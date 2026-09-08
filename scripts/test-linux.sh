#!/bin/sh
# Always isolate the display, D-Bus and keyring from the user's desktop.
set -eu
if [ "${PIPELINE_DESK_TEST_SESSION:-}" != 1 ]; then
  exec xvfb-run -a dbus-run-session -- env PIPELINE_DESK_TEST_SESSION=1 sh "$0"
fi
desk_test_data=$(mktemp -d)
desk_wm_pid=
cleanup() {
  if [ -n "$desk_wm_pid" ]; then kill "$desk_wm_pid" 2>/dev/null || true; fi
  rm -rf "$desk_test_data"
}
trap cleanup EXIT HUP INT TERM
export XDG_DATA_HOME="$desk_test_data"
export XDG_CURRENT_DESKTOP=GNOME
printf '%s' 'pipeline-desk-test-keyring-only' | gnome-keyring-daemon --unlock --components=secrets
openbox >"$desk_test_data/openbox.log" 2>&1 &
desk_wm_pid=$!
desk_attempt=0
until xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id'; do
  desk_attempt=$((desk_attempt + 1))
  if [ "$desk_attempt" -ge 50 ]; then cat "$desk_test_data/openbox.log"; exit 1; fi
  sleep 0.1
done
npm run test:desktop
PIPELINE_DESK_EXECUTABLE=/opt/pipeline-desk/pipeline-desk npm run test:package:linux
