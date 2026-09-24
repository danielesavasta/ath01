# Kinect (Xbox 360, v1) as the camera

Browsers can't see a Kinect v1: it isn't a standard webcam. `bridge.py` reads it through
[libfreenect](https://github.com/OpenKinect/libfreenect) and streams frames to the page over a
local WebSocket. `index.htm` uses the Kinect when the bridge is running and the webcam otherwise.

## Once

```
cd tools/kinect
./setup.sh
```

Installs libfreenect with Homebrew and a Python environment in `tools/kinect/.venv`.
The Kinect v1 needs its **power adapter** as well as USB; without it the motor light stays off and no frames arrive.

## Every time

1. Plug in the Kinect (USB + power).
2. `tools/kinect/.venv/bin/python tools/kinect/bridge.py` and leave it running. The Kinect light turns green.
3. Open the installation with Live Server as usual. The small status line (top right) says `Kinect connected`.

`tools/kinect/viewer.html` (open with Live Server) shows the colour and depth streams side by side, to check the Kinect on its own.

## Options

- `?source=webcam` or `?source=kinect` on the page URL forces one source (default: Kinect if the bridge answers, else webcam).
- `bridge.py --tilt 10` tilts the Kinect motor. `--fake` streams a test pattern, for checking the page without the device.
- Colour is 640×480. The page crops it to fill the screen width (see `object-fit: cover` in `css/sections.css`), so the camera's left and right edges reach the screen edges; the top and bottom of the camera image are cut.

## Notes

- Hand tracking is still MediaPipe on the colour image, so it needs light on the visitors. In a dark projection room this is the weak point. The depth stream (`/depth`) works in the dark; hand tracking from depth is a possible next step.
- If `freenect-glview` shows nothing either, the problem is the connection (power, cable, USB hub), not this code.
