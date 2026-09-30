#!/bin/bash
# Double-click to start the installation on a Mac: the Kinect bridge, a local web server and the browser.
# Order doesn't matter any more and nothing needs setting up first: the page finds the bridge by itself,
# and the bridge learns the room by itself. Close this Terminal window (or Ctrl-C) to stop everything.
#   ./start.command            browser window
#   ./start.command --kiosk    full screen, no browser bars (for the venue)
cd "$(dirname "$0")"
PORT=5510
URL="http://localhost:$PORT/index.htm"

# a bridge left over from before keeps the Kinect busy: stop it first
pkill -f "tools/kinect/bridge.py" 2>/dev/null && sleep 2

python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
WEB=$!

# the bridge, started again if it stops (Kinect unplugged, USB hiccup)
(
  while true; do
    if [ -x tools/kinect/.venv/bin/python ]; then
      tools/kinect/.venv/bin/python tools/kinect/bridge.py
    else
      echo "Kinect bridge not set up (tools/kinect/setup.sh). Running with the webcam."; sleep 3600
    fi
    echo "Bridge stopped; starting it again in 3 s."; sleep 3
  done
) &
LOOP=$!

stop() { kill $LOOP $WEB 2>/dev/null; pkill -f "tools/kinect/bridge.py" 2>/dev/null; exit 0; }
trap stop INT TERM HUP

sleep 1
if [ -n "$ATH_NO_BROWSER" ]; then :
elif [ "$1" = "--kiosk" ]; then
  open -na "Google Chrome" --args --kiosk --autoplay-policy=no-user-gesture-required "$URL"
else
  open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
fi
echo "Running at $URL  (close this window or press Ctrl-C to stop)"
wait
