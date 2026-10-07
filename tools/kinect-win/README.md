# Kinect on Windows: Kinect 360 and Kinect One

The Windows bridge reads either Kinect generation with Microsoft's SDK. Both track raised hands in the dark
and send the same hand data to the page; the bridge also serves the page, so the PC needs no Python or web
server. Kinect 360 is the default; Kinect One is selected with `start-windows.bat one`.

## Once, on the PC

1. For Kinect 360, install **Kinect for Windows SDK 1.8** and **Kinect for Windows Developer Toolkit 1.8**.
   The toolkit supplies grip detection; without it, the v1 bridge still runs but treats hands as open.
2. For Kinect One (Xbox One), install **Kinect for Windows SDK 2.0**. It uses Kinect v2's built-in hand
   states and does not need the Developer Toolkit.
3. Install Chrome and copy the repo to the PC (or `git clone`).
4. Plug in the sensor and its power adapter. Kinect One also needs a USB 3.0 port and its Kinect adapter.
   Windows installs the driver; the sensor light turns green when a program uses it.

## Every time

Double-click `start-windows.bat` for Kinect 360, or run `start-windows.bat one` for Kinect One. The first
time, the matching bridge is built with the .NET compiler and SDK installed above; it starts minimised and
opens Chrome full screen on `http://127.0.0.1:8770/index.htm`. Add `window` to open Chrome normally:
`start-windows.bat window` or `start-windows.bat one window`. The page status says `Kinect skeleton connected`.
Close the "Athena Kinect" window to stop the bridge. It keeps waiting if the sensor is unplugged and picks it
up again when it is back.

Build either variant explicitly with `tools\kinect-win\build.bat` (360) or
`tools\kinect-win\build.bat one` (Kinect One). `--raise 0.10` sets how far above the hips a hand must be
to count (metres); pass it to the bridge executable if tuning is needed.

## What to know

- Kinect 360 tracks up to six skeletons but provides hands for two people. Kinect One tracks up to six
  people and reports both hands for each tracked body.
- Skeletons need most of the body in view, from about 0.8 to 4 m. Aim the Kinect so visitors at 1.5 to 3 m
  are seen from the knees up.
- Kinect 360's grip detector works best with the hand facing the sensor. Kinect One reports its own open,
  closed, and other hand states; only its explicit closed state counts as closed.
- Microsoft's licence allows the Xbox 360 Kinect for development with this SDK; the commercial version is
  "Kinect for Windows". Worth knowing if the museum asks.
- The v1 bridge is written in C# 5 against .NET Framework 4; Kinect One requires the Kinect v2 runtime and
  SDK 2.0. The web/WebSocket interface is shared, but both sensors still need testing on the installation PC.
