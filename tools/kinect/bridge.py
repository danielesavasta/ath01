#!/usr/bin/env python3
"""Kinect (Xbox 360, v1) -> browser bridge.

Reads the Kinect through libfreenect's synchronous C API (via ctypes, nothing to compile)
and streams frames to the page over a local WebSocket:

    ws://127.0.0.1:8770/rgb     colour, 640x480 JPEG
    ws://127.0.0.1:8770/depth   depth aligned to colour, 8-bit JPEG (near = bright)

Run:   .venv/bin/python bridge.py            (Ctrl-C to stop)
Test without a Kinect:   .venv/bin/python bridge.py --fake
"""
import argparse
import asyncio
import ctypes
import ctypes.util
import glob
import io
import math
import os
import shutil
import subprocess
import sys
import threading
import time

import numpy as np
from PIL import Image, ImageDraw
from websockets.asyncio.server import serve

W, H = 640, 480
FREENECT_VIDEO_RGB = 0
FREENECT_DEPTH_REGISTERED = 4      # millimetres, aligned to the colour image
LED_GREEN, LED_YELLOW = 1, 3


# ───────────── libfreenect ─────────────
def find_libfreenect_sync():
    candidates = []
    brew = shutil.which("brew") or next((p for p in ("/opt/homebrew/bin/brew", "/usr/local/bin/brew",
                                                       os.path.expanduser("~/.homebrew/bin/brew")) if os.path.exists(p)), None)
    if brew:
        try:
            prefix = subprocess.run([brew, "--prefix", "libfreenect"], capture_output=True, text=True, timeout=20).stdout.strip()
            if prefix:
                candidates += glob.glob(os.path.join(prefix, "lib", "libfreenect_sync*.dylib"))
        except Exception:
            pass
    for d in ("/opt/homebrew/lib", "/usr/local/lib", os.path.expanduser("~/.homebrew/lib"), "/usr/lib", "/usr/lib/x86_64-linux-gnu"):
        candidates += glob.glob(os.path.join(d, "libfreenect_sync*.dylib")) + glob.glob(os.path.join(d, "libfreenect_sync.so*"))
    found = ctypes.util.find_library("freenect_sync")
    if found:
        candidates.append(found)
    for c in candidates:
        try:
            return ctypes.CDLL(c)
        except OSError:
            continue
    return None


class Kinect:
    def __init__(self):
        self.lib = find_libfreenect_sync()
        if self.lib is None:
            sys.exit("libfreenect_sync not found. Run ./setup.sh first (it installs libfreenect with Homebrew).")
        L = self.lib
        L.freenect_sync_get_video.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_uint32), ctypes.c_int, ctypes.c_int]
        L.freenect_sync_get_depth.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_uint32), ctypes.c_int, ctypes.c_int]
        L.freenect_sync_set_led.argtypes = [ctypes.c_int, ctypes.c_int]
        L.freenect_sync_set_tilt_degs.argtypes = [ctypes.c_int, ctypes.c_int]
        self._ptr = ctypes.c_void_p()
        self._ts = ctypes.c_uint32()

    def rgb(self):
        if self.lib.freenect_sync_get_video(ctypes.byref(self._ptr), ctypes.byref(self._ts), 0, FREENECT_VIDEO_RGB) != 0:
            return None
        buf = (ctypes.c_uint8 * (W * H * 3)).from_address(self._ptr.value)
        return np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3).copy()

    def depth_mm(self):
        if self.lib.freenect_sync_get_depth(ctypes.byref(self._ptr), ctypes.byref(self._ts), 0, FREENECT_DEPTH_REGISTERED) != 0:
            return None
        buf = (ctypes.c_uint16 * (W * H)).from_address(self._ptr.value)
        return np.frombuffer(buf, dtype=np.uint16).reshape(H, W).copy()

    def led(self, mode):
        try:
            self.lib.freenect_sync_set_led(mode, 0)
        except Exception:
            pass

    def tilt(self, deg):
        self.lib.freenect_sync_set_tilt_degs(int(max(-27, min(27, deg))), 0)

    def stop(self):
        try:
            self.led(LED_YELLOW)
            self.lib.freenect_sync_stop()
        except Exception:
            pass


class FakeKinect:
    """Moving test pattern, for checking the browser side without hardware."""
    def __init__(self):
        self.t0 = time.time()

    def rgb(self):
        t = time.time() - self.t0
        x = np.linspace(0, 1, W)[None, :]
        y = np.linspace(0, 1, H)[:, None]
        img = np.zeros((H, W, 3), np.uint8)
        img[..., 0] = (120 + 100 * np.sin(6 * x + t)).astype(np.uint8)
        img[..., 1] = (90 + 60 * np.cos(5 * y - t * 0.7)).astype(np.uint8)
        img[..., 2] = 70
        im = Image.fromarray(img)
        d = ImageDraw.Draw(im)
        cx, cy = W / 2 + math.sin(t) * 200, H / 2 + math.cos(t * 1.3) * 120
        d.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], fill=(240, 180, 41))
        d.text((20, 20), "KINECT BRIDGE TEST (--fake)", fill=(255, 255, 255))
        return np.asarray(im)

    def depth_mm(self):
        t = time.time() - self.t0
        x = np.linspace(-1, 1, W)[None, :]
        y = np.linspace(-1, 1, H)[:, None]
        cx, cy = math.sin(t) * 0.6, math.cos(t * 1.3) * 0.5
        d = 2500 - 1500 * np.exp(-((x - cx) ** 2 + (y - cy) ** 2) * 8)
        return d.astype(np.uint16)

    def led(self, mode): pass
    def tilt(self, deg): pass
    def stop(self): pass


# ───────────── capture thread ─────────────
class Capture(threading.Thread):
    def __init__(self, dev, fps, quality, near, far):
        super().__init__(daemon=True)
        self.dev, self.period, self.quality, self.near, self.far = dev, 1.0 / fps, quality, near, far
        self.want_depth = False
        self.rgb_jpeg = None
        self.depth_jpeg = None
        self.seq = 0
        self.fails = 0
        self.running = True

    def encode(self, arr, mode):
        b = io.BytesIO()
        Image.fromarray(arr, mode).save(b, "JPEG", quality=self.quality)
        return b.getvalue()

    def run(self):
        while self.running:
            t = time.time()
            rgb = self.dev.rgb()
            if rgb is None:
                self.fails += 1
                if self.fails in (1, 30) or self.fails % 300 == 0:
                    print("No colour frame from the Kinect. Is the power adapter plugged in? (try: freenect-glview)", flush=True)
                time.sleep(0.2)
                continue
            self.fails = 0
            self.rgb_jpeg = self.encode(rgb, "RGB")
            if self.want_depth:
                d = self.dev.depth_mm().astype(np.float32)
                valid = d > 0
                v = np.clip((self.far - d) / (self.far - self.near), 0, 1) * 255
                v[~valid] = 0
                self.depth_jpeg = self.encode(v.astype(np.uint8), "L")
            self.seq += 1
            dt = time.time() - t
            if dt < self.period:
                time.sleep(self.period - dt)


# ───────────── WebSocket server ─────────────
async def main():
    ap = argparse.ArgumentParser(description="Kinect v1 -> WebSocket bridge")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--quality", type=int, default=80, help="JPEG quality")
    ap.add_argument("--near", type=float, default=500, help="depth view: mm shown as white")
    ap.add_argument("--far", type=float, default=4000, help="depth view: mm shown as black")
    ap.add_argument("--tilt", type=float, default=None, help="tilt the Kinect motor, degrees (-27..27)")
    ap.add_argument("--fake", action="store_true", help="test pattern instead of the Kinect")
    a = ap.parse_args()

    dev = FakeKinect() if a.fake else Kinect()
    if a.tilt is not None:
        dev.tilt(a.tilt)
    dev.led(LED_GREEN)
    cap = Capture(dev, a.fps, a.quality, a.near, a.far)
    cap.start()
    clients = {"rgb": 0, "depth": 0}

    async def handler(ws):
        path = ws.request.path.strip("/") or "rgb"
        if path not in clients:
            await ws.close(code=1008, reason="use /rgb or /depth")
            return
        clients[path] += 1
        cap.want_depth = clients["depth"] > 0
        print(f"+ {path} client ({clients[path]})", flush=True)
        last = -1
        try:
            while True:
                if cap.seq != last:
                    frame = cap.rgb_jpeg if path == "rgb" else cap.depth_jpeg
                    if frame is not None:
                        await ws.send(frame)
                        last = cap.seq
                await asyncio.sleep(0.005)
        except Exception:
            pass
        finally:
            clients[path] -= 1
            cap.want_depth = clients["depth"] > 0
            print(f"- {path} client", flush=True)

    print(f"Kinect bridge on ws://127.0.0.1:{a.port}/rgb  and  /depth" + ("  (test pattern)" if a.fake else ""), flush=True)
    try:
        async with serve(handler, "127.0.0.1", a.port, max_size=None, compression=None):
            await asyncio.Future()
    finally:
        cap.running = False
        dev.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nstopped")
