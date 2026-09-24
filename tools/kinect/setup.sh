#!/bin/bash
# One-time setup for the Kinect bridge on macOS (Apple Silicon or Intel).
# Installs libfreenect with Homebrew and a small Python environment next to this file.
set -e
cd "$(dirname "$0")"

BREW="$(command -v brew || true)"
for p in /opt/homebrew/bin/brew /usr/local/bin/brew "$HOME/.homebrew/bin/brew"; do
  [ -z "$BREW" ] && [ -x "$p" ] && BREW="$p"
done
if [ -z "$BREW" ]; then
  echo "Homebrew not found. Install it from https://brew.sh, then run this again."
  exit 1
fi
echo "Using Homebrew at $BREW"
"$BREW" install libfreenect

PY="$(command -v python3)"
echo "Using $PY ($("$PY" --version))"
"$PY" -m venv .venv
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/pip install numpy pillow "websockets>=13"

echo
echo "Done. Plug in the Kinect (USB and its power adapter), then:"
echo "  $("$BREW" --prefix)/bin/freenect-glview     # quick check: a window with colour + depth"
echo "  .venv/bin/python bridge.py                  # start the bridge for the browser"
