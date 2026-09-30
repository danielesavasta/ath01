# Kinect on Windows: skeletons and open/closed hands

The venue setup. `KinectBridge.exe` reads the Kinect with Microsoft's own SDK: skeleton tracking (works in
the dark), hands counted only when raised above the hips, and open or closed hand from KinectInteraction's
grip detection. It sends hands to the page in the same form as the Mac bridge, and it also serves the page
itself, so the PC needs no Python and no web server.

## Once, on the PC

1. Install **Kinect for Windows SDK 1.8** and **Kinect for Windows Developer Toolkit 1.8** (both from
   Microsoft's download centre; the toolkit gives the open/closed hand). Without the toolkit the bridge
   still runs, but every hand counts as open.
2. Install Chrome.
3. Plug in the Kinect (USB and its power adapter). Windows installs the driver; the Kinect light turns green
   when a program uses it.
4. Copy the repo to the PC (or `git clone`).

## Every time

Double-click `start-windows.bat` in the repo root. The first time it builds `KinectBridge.exe` (a few seconds,
with the compiler that comes with Windows), then starts it minimised and opens Chrome full screen on
`http://127.0.0.1:8770/index.htm`. `start-windows.bat window` opens a normal window instead.
The status line (top right of the page) says `Kinect skeleton connected`. Close the "Athena Kinect" window
to stop the bridge. It keeps waiting if the Kinect is unplugged and picks it up again when it's back.

Options: `KinectBridge.exe --port 8770 --raise 0.10` (metres a hand must be above the hips to count).

## What to know

- The SDK tracks the skeletons of **two people at a time** (up to six are seen, two get hands). Visitors
  beyond two can't play at the same moment.
- Skeletons need most of the body in view, from about 0.8 to 4 m. Aim the Kinect so visitors at 1.5 to 3 m
  are seen from the knees up.
- Grip needs the hand facing the Kinect. It is Microsoft's grip detector; test it with the coin on site.
- Microsoft's licence allows the Xbox 360 Kinect for development with this SDK; the commercial version is
  "Kinect for Windows". Worth knowing if the museum asks.
- Written in C# 5 against .NET Framework 4 so `build.bat` needs only Windows. It was compile-checked and
  its web/WebSocket side tested with a simulated Kinect, but not yet run on a real Windows PC.
