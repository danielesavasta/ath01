# Kinect (Xbox 360, v1) as the camera

Browsers can't see a Kinect v1: it isn't a standard webcam. `bridge.py` reads it through
[libfreenect](https://github.com/OpenKinect/libfreenect) and talks to the page over a local WebSocket.
When the bridge runs, the page finds hands in the Kinect's **depth**, which works in the dark; otherwise it
uses the webcam with MediaPipe. The page keeps looking for the bridge, so the order you start things in
doesn't matter, and a restarted bridge is picked up without reloading.

## Depth (optional: `?source=depth`)

On the Mac the page uses the Kinect's colour picture with MediaPipe by default. The venue plan is the Windows
bridge (`tools/kinect-win/`), which has real skeletons and open/closed hands in the dark. Depth below works
in the dark on the Mac too, but hands must reach towards the wall to count and a push closes them, which
felt awkward in testing; it is kept as an option.

The Kinect hangs on the wall and faces the visitors. The bridge learns the empty room once; whatever stands
in front of it is a person, and a hand is the part of a person clearly nearer to the wall than the rest of
their body: an arm reaching towards the projection. Hanging arms and bodies are ignored.

1. Nothing to set up first: the bridge learns the room when it starts and keeps learning it (someone who
   walks away is taken out at once; something that stays put for a minute becomes part of the room). It is
   kept in `tools/kinect/background.npy` (not committed). If odd hands appear after furniture moved: `K`,
   tab *Kamera*, **Odayı baştan öğren** (5 seconds to step out of view).
2. The same tab shows the depth picture with every hand found circled in green. Adjust *Gövdeden öne uzanma*
   (how far in front of the body a hand must be, default 18 cm) and *En uzak* (default 4 m), then
   *Dosyaya kaydet*. A hand shows after 4 frames in a row and survives 4 missed frames, so it doesn't flicker.
3. Depth has no fingers. For the coin, pushing the hand about 12 cm towards the wall (quickly) closes it;
   pulling back opens it (*Tutmak için öne itme*). The owl hint says so when depth is in use.

`?source=kinect` (the default on the Mac) uses the Kinect's colour picture with MediaPipe; `?source=webcam` the webcam.

## Starting everything (Mac)

Double-click `start.command` in the repo root: it stops any bridge left over, starts the bridge (and starts
it again if it stops), a local web server on port 5510 and Chrome. `./start.command --kiosk` for full screen.
Close the Terminal window to stop everything.

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

With the Kinect, depth (above) is the default and avoids all of this; the points below apply to `?source=kinect` and the webcam.

## Only hands pointing up

A hand counts only if it points up, within *Yukarı bakan el* degrees of vertical (default 70°; 180 turns it off). Arms hanging down and hands resting on a railing are ignored. A hand already in play gets 20° more, so it doesn't vanish when tilted during a throw.

## Notes
- If `freenect-camtest` receives no frames either, the problem is the connection (power, cable, USB hub), not this code.
- Only one program can use the Kinect. If the bridge says it can't open it, look for another bridge still
  running (`pgrep -f bridge.py`) and stop it. Ctrl-C or `kill` stop the bridge and release the Kinect.
- `Unable to claim interface` lines at start are libfreenect trying the audio part; harmless if frames follow.
