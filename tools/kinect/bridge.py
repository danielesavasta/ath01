#!/usr/bin/env python3
"""Kinect (Xbox 360, v1) -> browser bridge.

Reads the Kinect through libfreenect (via ctypes, nothing to compile), camera only,
and streams frames to the page over a local WebSocket:

    ws://127.0.0.1:8770/rgb     the camera picture, JPEG (the page finds hands in it)
    ws://127.0.0.1:8770/depth   depth aligned to colour, 8-bit JPEG (near = bright)

Run:   .venv/bin/python bridge.py            (Ctrl-C to stop)
Test without a Kinect:   .venv/bin/python bridge.py --fake

--video picks what goes out on /rgb:
    rgb     colour 640x480, 30 fps (default)
    hires   colour 1280x1024, about 10 fps: twice the detail for people far away, fewer frames
    ir      the infrared camera, 640x488 grey: works in the dark, lit by the Kinect's own infrared
            dot pattern, which is blurred away (--ir-blur) so the hand detector sees a smooth picture
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
FREENECT_VIDEO_IR_8BIT = 2
FREENECT_DEPTH_REGISTERED = 4      # millimetres, aligned to the colour image
LED_GREEN, LED_YELLOW = 1, 3


# ───────────── libfreenect ─────────────
# The Xbox 360 Kinect model 1473 drives its tilt motor through the audio chip, which needs a firmware
# upload (audios.bin). Opening the *camera only* avoids that, so the tilt motor is off unless --motor.
DEVICE_MOTOR, DEVICE_CAMERA = 0x01, 0x02
RESOLUTION_MEDIUM, RESOLUTION_HIGH = 1, 2
VIDEO_MODES = {   # --video: (resolution, format, channels)
    "rgb": (RESOLUTION_MEDIUM, FREENECT_VIDEO_RGB, 3),
    "hires": (RESOLUTION_HIGH, FREENECT_VIDEO_RGB, 3),
    "ir": (RESOLUTION_MEDIUM, FREENECT_VIDEO_IR_8BIT, 1),
}
LOG_WARNING = 2


class FrameMode(ctypes.Structure):          # freenect_frame_mode, 24 bytes
    _fields_ = [("reserved", ctypes.c_uint32), ("resolution", ctypes.c_int), ("format", ctypes.c_int32),
                ("bytes", ctypes.c_int32), ("width", ctypes.c_int16), ("height", ctypes.c_int16),
                ("data_bits_per_pixel", ctypes.c_int8), ("padding_bits_per_pixel", ctypes.c_int8),
                ("framerate", ctypes.c_int8), ("is_valid", ctypes.c_int8)]


FRAME_CB = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32)


def find_libfreenect():
    candidates = []
    brew = shutil.which("brew") or next((p for p in ("/opt/homebrew/bin/brew", "/usr/local/bin/brew",
                                                       os.path.expanduser("~/.homebrew/bin/brew")) if os.path.exists(p)), None)
    if brew:
        try:
            prefix = subprocess.run([brew, "--prefix", "libfreenect"], capture_output=True, text=True, timeout=20).stdout.strip()
            if prefix:
                candidates += sorted(glob.glob(os.path.join(prefix, "lib", "libfreenect.*dylib")))
        except Exception:
            pass
    for d in ("/opt/homebrew/lib", "/usr/local/lib", os.path.expanduser("~/.homebrew/lib"), "/usr/lib", "/usr/lib/x86_64-linux-gnu", "/usr/lib/aarch64-linux-gnu"):
        candidates += sorted(glob.glob(os.path.join(d, "libfreenect.dylib")) + glob.glob(os.path.join(d, "libfreenect.*.dylib"))
                             + glob.glob(os.path.join(d, "libfreenect.so*")))
    found = ctypes.util.find_library("freenect")
    if found:
        candidates.append(found)
    for c in candidates:
        if "sync" in os.path.basename(c):
            continue
        try:
            return ctypes.CDLL(c)
        except OSError:
            continue
    return None


class Kinect:
    def __init__(self, motor=False, video="rgb"):
        L = find_libfreenect()
        if L is None:
            sys.exit("libfreenect not found. Run ./setup.sh first (it installs libfreenect with Homebrew).")
        self.L = L
        P, I = ctypes.c_void_p, ctypes.c_int
        L.freenect_init.argtypes = [ctypes.POINTER(P), P]
        L.freenect_set_log_level.argtypes = [P, I]
        L.freenect_num_devices.argtypes = [P]
        L.freenect_select_subdevices.argtypes = [P, I]
        L.freenect_open_device.argtypes = [P, ctypes.POINTER(P), I]
        L.freenect_find_video_mode.argtypes = [I, I]; L.freenect_find_video_mode.restype = FrameMode
        L.freenect_find_depth_mode.argtypes = [I, I]; L.freenect_find_depth_mode.restype = FrameMode
        L.freenect_set_video_mode.argtypes = [P, FrameMode]
        L.freenect_set_depth_mode.argtypes = [P, FrameMode]
        L.freenect_set_video_callback.argtypes = [P, FRAME_CB]
        L.freenect_set_depth_callback.argtypes = [P, FRAME_CB]
        for f in ("freenect_start_video", "freenect_start_depth", "freenect_stop_video", "freenect_stop_depth", "freenect_close_device"):
            getattr(L, f).argtypes = [P]
        L.freenect_process_events.argtypes = [P]
        L.freenect_shutdown.argtypes = [P]
        L.freenect_set_led.argtypes = [P, I]
        L.freenect_set_tilt_degs.argtypes = [P, ctypes.c_double]

        self.ctx, self.dev, self.motor = P(), P(), motor
        if L.freenect_init(ctypes.byref(self.ctx), None) < 0:
            sys.exit("libfreenect could not start (USB).")
        L.freenect_set_log_level(self.ctx, LOG_WARNING)
        n = L.freenect_num_devices(self.ctx)
        if n < 1:
            L.freenect_shutdown(self.ctx)
            sys.exit("No Kinect found on USB. Check the cable and the power adapter.")
        L.freenect_select_subdevices(self.ctx, DEVICE_CAMERA | (DEVICE_MOTOR if motor else 0))
        if L.freenect_open_device(self.ctx, ctypes.byref(self.dev), 0) < 0:
            L.freenect_shutdown(self.ctx)
            sys.exit("Could not open the Kinect. Is another program using it (freenect-glview, camtest)?"
                     + (" With --motor the 1473 model needs audios.bin; try without --motor." if motor else ""))

        res, fmt, self.vch = VIDEO_MODES[video]
        vm = L.freenect_find_video_mode(res, fmt)
        dm = L.freenect_find_depth_mode(RESOLUTION_MEDIUM, FREENECT_DEPTH_REGISTERED)
        if not (vm.is_valid and dm.is_valid):
            sys.exit(f"This libfreenect has no '{video}' video mode / registered depth mode.")
        self.vw, self.vh = vm.width, vm.height
        print(f"Kinect video: {video}, {self.vw}x{self.vh}, {vm.framerate} fps", flush=True)
        L.freenect_set_video_mode(self.dev, vm)
        L.freenect_set_depth_mode(self.dev, dm)
        self._vcb, self._dcb = FRAME_CB(self._on_video), FRAME_CB(self._on_depth)   # keep references alive
        L.freenect_set_video_callback(self.dev, self._vcb)
        L.freenect_set_depth_callback(self.dev, self._dcb)

        self.cond = threading.Condition()
        self._rgb, self._depth, self._rgb_seq, self._taken = None, None, 0, 0
        self.running = True
        L.freenect_start_video(self.dev)
        L.freenect_start_depth(self.dev)
        self.events = threading.Thread(target=self._pump, daemon=True)
        self.events.start()

    # libfreenect calls these from the event thread; copy the frame out of its buffer
    def _on_video(self, dev, data, ts):
        n = self.vw * self.vh * self.vch
        a = np.ctypeslib.as_array((ctypes.c_uint8 * n).from_address(data))
        a = (a.reshape(self.vh, self.vw, 3) if self.vch == 3 else a.reshape(self.vh, self.vw)).copy()
        with self.cond:
            self._rgb, self._rgb_seq = a, self._rgb_seq + 1
            self.cond.notify_all()

    def _on_depth(self, dev, data, ts):
        a = np.ctypeslib.as_array((ctypes.c_uint16 * (W * H)).from_address(data)).reshape(H, W).copy()
        with self.cond:
            self._depth = a

    def _pump(self):
        while self.running:
            if self.L.freenect_process_events(self.ctx) < 0:
                print("USB error from the Kinect, stopping.", flush=True)
                self.running = False

    def rgb(self):
        with self.cond:
            if not self.cond.wait_for(lambda: self._rgb_seq != self._taken or not self.running, timeout=2):
                return None
            self._taken = self._rgb_seq
            return self._rgb

    def depth_mm(self):
        with self.cond:
            return self._depth if self._depth is not None else np.zeros((H, W), np.uint16)

    def led(self, mode):
        if self.motor:
            self.L.freenect_set_led(self.dev, mode)

    def tilt(self, deg):
        if not self.motor:
            print("Tilt needs --motor (and, on the 1473 model, the audios.bin firmware).", flush=True)
            return
        self.L.freenect_set_tilt_degs(self.dev, float(max(-27, min(27, deg))))

    def stop(self):
        self.running = False
        L = self.L
        try:
            L.freenect_stop_video(self.dev); L.freenect_stop_depth(self.dev)
            self.events.join(timeout=1)
            L.freenect_close_device(self.dev); L.freenect_shutdown(self.ctx)
        except Exception:
            pass


class FakeKinect:
    """Moving test pattern, for checking the browser side without hardware."""
    def __init__(self, video="rgb"):
        self.t0 = time.time()
        self.video = video

    def rgb(self):
        img = self._rgb()
        if self.video == "ir":   # grey with a dot pattern, like the real infrared camera
            g = img.mean(axis=2)
            dots = (np.random.default_rng(1).random(g.shape) > 0.55) * 1.0
            return np.clip(g * (0.35 + 0.9 * dots), 0, 255).astype(np.uint8)
        return img

    def _rgb(self):
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


# ───────────── infrared picture ─────────────
def box_blur(a, r):
    """Mean over a (2r+1)² square, via a summed-area table."""
    if r <= 0:
        return a
    k = 2 * r + 1
    c = np.pad(np.pad(a, r, mode="edge").cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def max_filter(a, r):
    """Brightest value in a (2r+1)² square."""
    p = np.pad(a, r, mode="edge")
    h, w = a.shape
    rows = np.max([p[i:i + h, :] for i in range(2 * r + 1)], axis=0)
    return np.max([rows[:, j:j + w] for j in range(2 * r + 1)], axis=0)


def clean_ir(ir, blur):
    """Kinect infrared -> smooth grey picture. The Kinect lights the room with a pattern of bright dots;
    taking the brightest value around each pixel fills the gaps between them, a blur smooths the rest,
    then the contrast is stretched."""
    a = max_filter(ir.astype(np.float32), blur)
    a = box_blur(box_blur(a, max(1, blur // 2 + 1)), max(1, blur // 2 + 1))
    lo, hi = np.percentile(a, 1), np.percentile(a, 99.5)
    a = np.clip((a - lo) / max(hi - lo, 1), 0, 1) ** 0.8
    return (a * 255).astype(np.uint8)


# ───────────── capture thread ─────────────
class Capture(threading.Thread):
    def __init__(self, dev, fps, quality, near, far, ir_blur=2):
        super().__init__(daemon=True)
        self.dev, self.period, self.quality, self.near, self.far = dev, 1.0 / fps, quality, near, far
        self.ir_blur = ir_blur
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
                    print("No colour frame from the Kinect yet. Is the power adapter plugged in? (check: freenect-camtest)", flush=True)
                time.sleep(0.2)
                continue
            self.fails = 0
            if rgb.ndim == 2:     # infrared
                self.rgb_jpeg = self.encode(clean_ir(rgb, self.ir_blur), "L")
            else:
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
    ap.add_argument("--motor", action="store_true", help="also open the tilt motor / LED (1473 model: needs audios.bin)")
    ap.add_argument("--fake", action="store_true", help="test pattern instead of the Kinect")
    ap.add_argument("--video", choices=sorted(VIDEO_MODES), default="rgb",
                    help="rgb (default), hires (1280x1024, ~10 fps) or ir (infrared, works in the dark)")
    ap.add_argument("--ir-blur", type=int, default=2, help="ir: blur radius in pixels that hides the dot pattern (1-4)")
    a = ap.parse_args()

    dev = FakeKinect(a.video) if a.fake else Kinect(motor=a.motor, video=a.video)
    if a.tilt is not None:
        dev.tilt(a.tilt)
    dev.led(LED_GREEN)
    cap = Capture(dev, a.fps, a.quality, a.near, a.far, a.ir_blur)
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
