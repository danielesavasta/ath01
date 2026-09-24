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

1. Plug in the Kinect (USB + power). Optional check: `freenect-camtest` should print a line for every frame it receives (Ctrl-C to stop).
2. `tools/kinect/.venv/bin/python tools/kinect/bridge.py` and leave it running. The Kinect light turns green.
3. Open the installation with Live Server as usual. The small status line (top right) says `Kinect connected`.

`tools/kinect/viewer.html` (open with Live Server) shows the colour and depth streams side by side, to check the Kinect on its own.

## Options

- `--video rgb|hires|ir` picks the picture: colour 640×480 (default), colour 1280×1024 at about 10 fps, or infrared (works in the dark). See below.
- `?source=webcam` or `?source=kinect` on the page URL forces one source (default: Kinect if the bridge answers, else webcam).
- `--fake` streams a test pattern, for checking the page without the device.
- The bridge opens the **camera only**. The newer Xbox 360 Kinect (model 1473) drives its tilt motor through the audio chip, which needs a firmware file (`audios.bin`) that libfreenect doesn't ship; asking for the motor makes the whole device fail to open. That is also why `freenect-glview` says `upload_firmware failed`: it asks for the motor. `--motor --tilt 10` works on the older 1414 model, or on a 1473 once `audios.bin` is in `~/.libfreenect/`.
- Colour is 640×480. The page crops it to fill the screen width (see `object-fit: cover` in `css/sections.css`), so the camera's left and right edges reach the screen edges; the top and bottom of the camera image are cut.

## Hands at 2 m and further

The hand detector (MediaPipe) needs a hand to be a reasonable size in the picture it gets, and it needs light on it. At 2 m in a 640×480 picture a hand is about 30 pixels wide, and in a dim room the Kinect's colour camera gets dark and grainy. In order of effect:

1. **Crop to where the visitors are.** Press `K` on the page, tab *Kamera*: drag the yellow rectangle over the area where hands move and zoom in. Only that part goes to the detector, so a hand looks 1.5 to 2 times bigger to it. That part is also what fills the screen, so visitors don't have to reach the edges of the camera's view. Lower *Algılama eşiği* (0.5 or so) if hands are still missed; raise it if things that aren't hands get found.
2. **Light on the visitors, not on the wall.** A soft light from above and in front of where people stand, aimed so it doesn't reach the projection surface. You saw this already: with the room lights on, detection came back.
3. **`--video hires`**: colour at 1280×1024 instead of 640×480. Twice the detail for hands far away, but only about 10 frames a second, so movements feel less smooth. Combine with the crop.
4. **`--video ir`**: the Kinect's infrared camera. It works in the dark, because the Kinect lights the room with its own invisible infrared dots; the bridge blurs the dots away (`--ir-blur 1` to `4`, default 2) and sends a grey picture. Worth trying in the real room; whether the detector does well enough on it at 2 m has to be tried there. `tools/kinect/viewer.html` shows what the page gets.
5. **If none of this is enough:** an infrared-sensitive USB camera (sold as "NoIR" or "night vision", 1080p, no IR-cut filter) with an 850 nm infrared floodlight next to it. Visitors see nothing, the camera sees them clearly lit, and the page uses it as a webcam (`?source=webcam`). This is the usual setup for dark museum rooms and costs little.

Depth (`/depth`) also works in the dark and finds hands reliably, but it can't tell an open hand from a fist at 2 m, which the coin needs for grabbing. It could drive a different gesture (pushing the hand forward to grab); that would change how the coin is played, so it's not in yet.

## Only hands pointing up

A hand counts only if it points up, within *Yukarı bakan el* degrees of vertical (default 70°; 180 turns it off). Arms hanging down and hands resting on a railing are ignored. A hand already in play gets 20° more, so it doesn't vanish when tilted during a throw.

## Notes
- If `freenect-camtest` receives no frames either, the problem is the connection (power, cable, USB hub), not this code.
