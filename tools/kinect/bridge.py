#!/usr/bin/env python3
"""Kinect (Xbox 360, v1) -> browser bridge.

Reads the Kinect through libfreenect (via ctypes, nothing to compile), camera only,
and streams frames to the page over a local WebSocket:

    ws://127.0.0.1:8770/rgb     the camera picture, JPEG (the page finds hands in it with MediaPipe)
    ws://127.0.0.1:8770/depth   depth aligned to colour, 8-bit JPEG (near = bright)
    ws://127.0.0.1:8770/hands   hands found in the depth picture, JSON, every frame (works in the dark).
                                The page sends its settings and "learn the empty room" on the same socket.

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
import collections
import ctypes
import ctypes.util
import glob
import io
import json
import math
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import warnings

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


# ───────────── hands from depth ─────────────
# The Kinect hangs on the wall and faces the visitors. The empty room (and the statue) is learned once as a
# background; whatever stands in front of it is a person. A hand is the part of a person that is clearly
# nearer to the Kinect than the rest of their body: an arm reaching towards the wall. Hanging arms and
# bodies are ignored. Works in the dark: depth is measured with the Kinect's own infrared.
CELL = 4                                  # the depth picture is searched on a grid of 4x4 pixel cells (160x120)
BG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "background.npy")
BG_FRAMES = 45                            # frames averaged when learning the room (about 1.5 s)


def cells(d):
    """640x480 depth in mm -> 160x120, the nearest valid value in each cell (0 = no reading)."""
    a = d.astype(np.float32)
    a[a == 0] = np.inf
    a = a.reshape(H // CELL, CELL, W // CELL, CELL).min(axis=(1, 3))
    a[np.isinf(a)] = 0
    return a


def components(mask):
    """Connected regions of a boolean grid (4-neighbours) -> list of (rows, cols) index arrays."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for r0, c0 in zip(*np.nonzero(mask)):
        if seen[r0, c0]:
            continue
        seen[r0, c0] = True
        q, rs, cs = collections.deque([(r0, c0)]), [], []
        while q:
            r, c = q.popleft()
            rs.append(r); cs.append(c)
            for rr, cc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= rr < h and 0 <= cc < w and mask[rr, cc] and not seen[rr, cc]:
                    seen[rr, cc] = True
                    q.append((rr, cc))
        out.append((np.array(rs), np.array(cs)))
    return out


class HandFinder:
    """Hands in the depth picture. The room learns itself: at start (and with the setup button) from a
    second and a half of frames, and afterwards cell by cell: where the room reads further away than
    remembered (someone left), it is taken at once; whatever stays put in front of it for BG_ABSORB
    seconds (a chair moved in) becomes part of the room. A hand must be seen in several frames running
    before it is reported, and is kept through a few missed frames, so it neither flickers nor blinks."""
    # the page sends these from content/venue.js (detect.depth), so they are set up per room with K
    DEFAULTS = {"near": 500, "far": 4000, "margin": 120, "reach": 180, "body": 150, "hand": 4}
    BORDER = 2              # cells along the edges of the picture are ignored (the depth edge is noisy)
    HAND_MAX = 600          # cells: bigger than this is not a hand
    BG_ABSORB = 60          # s something must stay put before it counts as part of the room
    CONFIRM, KEEP = 4, 4    # frames a hand must be seen before it shows / may be missed before it goes
    MATCH = 0.06            # how far (fraction of the width) a hand may move between frames

    def __init__(self):
        self.s = dict(self.DEFAULTS)
        self.bg = None
        self.learning = []                     # learn the room at start
        self.cand = self.count = None          # per cell: a value that stays put in front of the room, and for how long
        self.tracks, self.next_id = [], 1
        self.saved = time.time()
        try:
            bg = np.load(BG_FILE)
            if bg.shape == (H // CELL, W // CELL):
                self.bg, self.learning = bg, None
                print("Room loaded from background.npy (it keeps learning).", flush=True)
        except Exception:
            pass

    def settings(self, d):
        for k, v in d.items():
            if k in self.s and isinstance(v, (int, float)):
                self.s[k] = float(v)

    def learn(self):
        self.learning = []

    def status(self):
        return {"bg": self.bg is not None,
                "learning": None if self.learning is None else round(len(self.learning) / BG_FRAMES, 2)}

    def _save(self):
        try:
            np.save(BG_FILE, self.bg)
        except Exception:
            pass
        self.saved = time.time()

    def _adapt(self, d, dt):
        bg = self.bg
        valid = d > 0
        if self.cand is None:
            self.cand, self.count = d.copy(), np.zeros_like(d)
        # the room reads further than remembered, or had no reading there: take it
        farther = valid & ((bg == 0) | (d > bg + 60))
        bg[farther] = d[farther]
        # the same as remembered: follow slowly (drift, noise)
        same = valid & ~farther & (np.abs(d - bg) < 60)
        bg[same] += (d[same] - bg[same]) * 0.02
        # something in front that stays put for BG_ABSORB seconds becomes part of the room
        steady = valid & (np.abs(d - self.cand) < 60)
        self.count = np.where(steady, self.count + dt, 0)
        self.cand = np.where(steady, self.cand, d)
        absorb = self.count > self.BG_ABSORB
        bg[absorb] = d[absorb]
        self.count[absorb] = 0
        if time.time() - self.saved > 120:
            self._save()

    def find(self, depth_mm, dt=1 / 30):
        s = self.s
        d = cells(depth_mm)
        if self.learning is not None:
            self.learning.append(d)
            if len(self.learning) >= BG_FRAMES:
                st = np.stack(self.learning)
                st[st == 0] = np.nan
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", RuntimeWarning)      # cells with no reading at all
                    bg = np.nanmedian(st, axis=0)
                self.bg = np.nan_to_num(bg, nan=0).astype(np.float32)
                self.learning, self.cand = None, None
                self._save()
                print("Room learned.", flush=True)
            return self._track([])
        self._adapt(d, dt)
        b = self.BORDER
        fg = (d > s["near"]) & (d < s["far"])
        fg[:b, :] = fg[-b:, :] = False
        fg[:, :b] = fg[:, -b:] = False
        far_bg = np.where(self.bg > 0, self.bg, np.inf)              # no reading in the room: anything counts
        fg &= d < far_bg - s["margin"]
        found = []
        for rs, cs in components(fg):
            if len(rs) < s["body"]:
                continue
            z = d[rs, cs]
            body = float(np.median(z))
            near = z < body - s["reach"]
            if not near.any():
                continue
            sub = np.zeros_like(fg)
            sub[rs[near], cs[near]] = True
            for hr, hc in components(sub):
                if not s["hand"] <= len(hr) <= self.HAND_MAX:
                    continue
                hz = d[hr, hc]
                front = hz < hz.min() + 80                             # the most forward part is the hand
                found.append({"x": float((hc[front].mean() + 0.5) * CELL / W), "y": float((hr[front].mean() + 0.5) * CELL / H),
                              "z": float(hz[front].mean()), "bx": float((cs.mean() + 0.5) * CELL / W), "n": int(len(hr))})
        return self._track(found)

    def _track(self, found):
        """Match hands to the ones of the last frames; report only those seen CONFIRM frames running."""
        for t in self.tracks:
            t["hit"] = False
        for h in found:
            best, bd = None, self.MATCH
            for t in self.tracks:
                dd = math.hypot(t["x"] - h["x"], (t["y"] - h["y"]) * H / W)
                if not t["hit"] and dd < bd:
                    best, bd = t, dd
            if best is None:
                best = {"id": self.next_id, "seen": 0, "miss": 0}
                self.next_id += 1
                self.tracks.append(best)
            best.update(h, hit=True, seen=best["seen"] + 1, miss=0)
        for t in self.tracks:
            if not t["hit"]:
                t["miss"] += 1
        self.tracks = [t for t in self.tracks if t["miss"] <= self.KEEP]
        return [{"x": round(t["x"], 4), "y": round(t["y"], 4), "z": round(t["z"]), "bx": round(t["bx"], 4), "n": t["n"]}
                for t in self.tracks if t["seen"] >= self.CONFIRM]


# ───────────── capture thread ─────────────
class Capture(threading.Thread):
    def __init__(self, dev, fps, quality, near, far, ir_blur=2):
        super().__init__(daemon=True)
        self.dev, self.period, self.quality, self.near, self.far = dev, 1.0 / fps, quality, near, far
        self.ir_blur = ir_blur
        self.want_depth = False
        self.want_hands = False
        self.finder = HandFinder()
        self.hands_json = None
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
                if self.fails == 1:
                    print("No picture from the Kinect. Is the power adapter plugged in? (check: freenect-camtest)", flush=True)
                # rgb() waits 2 s; after about 6 s without pictures the connection is dead (the Kinect was
                # unplugged, or the USB hung): quit, so start.command starts the bridge again and reconnects
                if self.fails >= 3 and not isinstance(self.dev, FakeKinect):
                    print("No picture for 6 s: stopping, so the bridge can be started again.", flush=True)
                    os._exit(3)
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
            if self.want_hands:
                try:
                    found = self.finder.find(self.dev.depth_mm())
                except Exception as e:
                    print("hand finder:", e, flush=True)
                    found = []
                self.hands_json = json.dumps({"w": W, "h": H, "hands": found, **self.finder.status()})
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
    clients = {"rgb": 0, "depth": 0, "hands": 0}

    def wants():
        cap.want_depth = clients["depth"] > 0
        cap.want_hands = clients["hands"] > 0

    # the page sends {"settings": {...}} and {"learn": true} on /hands
    async def listen(ws):
        async for msg in ws:
            try:
                m = json.loads(msg)
            except Exception:
                continue
            if isinstance(m.get("settings"), dict):
                cap.finder.settings(m["settings"])
            if m.get("learn"):
                print("Learning the empty room: keep the area in front of the Kinect clear.", flush=True)
                cap.finder.learn()

    async def handler(ws):
        path = ws.request.path.strip("/") or "rgb"
        if path not in clients:
            await ws.close(code=1008, reason="use /rgb, /depth or /hands")
            return
        clients[path] += 1
        wants()
        print(f"+ {path} client ({clients[path]})", flush=True)
        listener = asyncio.create_task(listen(ws)) if path == "hands" else None
        last = -1
        try:
            while True:
                if cap.seq != last:
                    frame = {"rgb": cap.rgb_jpeg, "depth": cap.depth_jpeg, "hands": cap.hands_json}[path]
                    if frame is not None:
                        await ws.send(frame)
                        last = cap.seq
                await asyncio.sleep(0.005)
        except Exception:
            pass
        finally:
            if listener:
                listener.cancel()
            clients[path] -= 1
            wants()
            print(f"- {path} client", flush=True)

    print(f"Kinect bridge on ws://127.0.0.1:{a.port}/rgb, /depth and /hands" + ("  (test pattern)" if a.fake else ""), flush=True)
    try:
        async with serve(handler, "127.0.0.1", a.port, max_size=None, compression=None):
            await asyncio.Future()
    finally:
        cap.running = False
        # release the Kinect, but never hang on it: a bridge left running keeps the Kinect busy for the next one
        t = threading.Thread(target=dev.stop, daemon=True)
        t.start()
        t.join(timeout=2)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, signal.default_int_handler)     # `kill` stops it like Ctrl-C
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    print("\nstopped", flush=True)
    os._exit(0)
