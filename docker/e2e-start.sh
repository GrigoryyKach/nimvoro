#!/bin/bash
# Runs inside the container: Xvfb + window manager + local GitHub mirror + the launcher AppImage with a throwaway HOME.
# Drive it afterwards with xdotool / `import -window root` (see e2e-run.sh).
set -u
export DISPLAY=:99
export HOME=/tmp/home; rm -rf "$HOME"; mkdir -p "$HOME"
unset XDG_CONFIG_HOME XDG_DATA_HOME
mkdir -p "$HOME/Desktop" "$HOME/.config"; echo "XDG_DESKTOP_DIR=\"$HOME/Desktop\"" > "$HOME/.config/user-dirs.dirs"
Xvfb :99 -screen 0 1400x900x24 >/tmp/xvfb.log 2>&1 &
sleep 1; openbox >/tmp/openbox.log 2>&1 &
# The "new" launcher served as v9.9.9 is the same AppImage plus one byte, so its hash differs from the running one.
cp /out/NIMVORO-linux-x64.AppImage /tmp/new.AppImage; printf 'x' >> /tmp/new.AppImage
LAUNCHER_APPIMAGE=/tmp/new.AppImage /src/docker/make-mirror.sh /mirror 8000 1.0.0
(cd /mirror && python3 -m http.server 8000 --bind 127.0.0.1 >/tmp/mirror.log 2>&1 &)
mkdir -p /tmp/app && cp /out/NIMVORO-linux-x64.AppImage /tmp/app/
export NIMVORO_TEST_BASE_URL=http://127.0.0.1:8000
export APPIMAGE_EXTRACT_AND_RUN=1
# Docker only: WebKitGTK needs these inside a container without a user namespace / GPU.
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
nohup /tmp/app/NIMVORO-linux-x64.AppImage >/tmp/nimvoro.log 2>&1 &
sleep 8
echo started
