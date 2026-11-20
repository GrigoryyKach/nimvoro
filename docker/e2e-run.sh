#!/bin/bash
# Runs inside the container after e2e-start.sh: clicks through the launcher and checks the result. Screenshots go to /out/shots.
export DISPLAY=:99 HOME=/tmp/home NIMVORO_TEST_BASE_URL=http://127.0.0.1:8000 APPIMAGE_EXTRACT_AND_RUN=1
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
S=/out/shots; mkdir -p $S; rm -f $S/*.png
APP=/tmp/app/NIMVORO-linux-x64.AppImage
APPS=$HOME/.local/share/nimvoro/apps; MENU=$HOME/.local/share/applications
fails=0
check() { if eval "$2"; then echo "PASS  $1"; else echo "FAIL  $1   [$2]"; fails=$((fails+1)); fi; }
click() { xdotool mousemove "$1" "$2"; sleep 0.4; xdotool click 1; sleep "${3:-1.5}"; }
shot() { import -window root "$S/$1.png"; }

shot 01-catalog

# The launcher's own update is signed (Tauri updater, latest.json) and is not exercised here: the mirror cannot sign.

# --- install Demo Tool (desktop shortcut on by default)
click 300 552 2; shot 04-install-dialog
click 902 596 5; shot 05-installed
check "binary installed" "[ -x $APPS/demo-tool/demo-tool ]"
check "icon.png installed" "[ -f $APPS/demo-tool/icon.png ]"
check "language marker written" "grep -q '\"language\": \"en\"' $APPS/demo-tool/.nimvoro.json"
check "menu .desktop created" "[ -x $MENU/nimvoro-demo-tool.desktop ]"
check "desktop .desktop created" "[ -x $HOME/Desktop/nimvoro-demo-tool.desktop ]"
check ".desktop Exec is the quoted binary" "grep -q '^Exec=\"$APPS/demo-tool/demo-tool\"' $MENU/nimvoro-demo-tool.desktop"
check ".desktop Icon is the installed icon" "grep -q '^Icon=$APPS/demo-tool/icon.png' $MENU/nimvoro-demo-tool.desktop"
check "desktop-file-validate style: has Type and Name" "grep -q '^Type=Application' $MENU/nimvoro-demo-tool.desktop && grep -q '^Name=Demo Tool' $MENU/nimvoro-demo-tool.desktop"
gio set $HOME/Desktop/nimvoro-demo-tool.desktop metadata::trusted true 2>/dev/null; echo "(gio trusted attribute here: $(gio info -a metadata::trusted $HOME/Desktop/nimvoro-demo-tool.desktop 2>&1 | grep -i trusted || echo 'not readable in this container'))"

# --- launch from the card: clean environment, runs from its folder
click 276 552 2
check "tool started" "grep -q 'demo-tool 1.0.0' $HOME/demo-started"
P=$(pgrep -x demo-tool | head -1)
check "tool runs from the install folder" "[ \"\$(readlink /proc/$P/exe)\" = $APPS/demo-tool/demo-tool ]"
check "AppImage environment not passed to the tool" "[ \$(tr '\0' '\n' < /proc/$P/environ | grep -c 'appimage_extracted\|^APPDIR=\|^APPIMAGE=\|^GTK_THEME=') = 0 ]"

# --- update while the tool runs: it is closed, files replaced, tool started again
LAUNCHER=$(python3 -c "import json;print(json.load(open('$HOME/.config/NIMVORO/launcher.json'))['path'])")
check "launcher.json points to the AppImage" "[ '$LAUNCHER' = $APP ]"
/src/docker/make-mirror.sh /mirror 8000 1.1.0 >/dev/null
$LAUNCHER --update demo-tool >/dev/null 2>&1 &
sleep 9; shot 06-updated-while-running
check "marker has the new version, language kept" "grep -q '\"version\": \"1.1.0\"' $APPS/demo-tool/.nimvoro.json && grep -q '\"language\": \"en\"' $APPS/demo-tool/.nimvoro.json"
check "old process is gone, new one runs" "[ \$(pgrep -x demo-tool | wc -l) = 1 ] && [ \"\$(pgrep -x demo-tool)\" != '$P' ]"
check "tool started again with the new version" "grep -q 'demo-tool 1.1.0' $HOME/demo-started"
check "no zombie left" "[ -z \"\$(ps -eo stat,comm | grep '^Z.*demo-tool')\" ]"
check "exec bit kept after update" "[ -x $APPS/demo-tool/demo-tool ]"

# --- uninstall (the tool is running: the launcher asks, then closes it)
click 470 552 1; click 332 760 2; shot 07-uninstall-confirm
click 845 506 2; shot 08-running-prompt
click 804 485 3; shot 09-uninstalled
check "tool folder removed" "[ ! -e $APPS/demo-tool ]"
check "menu .desktop removed" "[ ! -e $MENU/nimvoro-demo-tool.desktop ]"
check "desktop .desktop removed" "[ ! -e $HOME/Desktop/nimvoro-demo-tool.desktop ]"
check "tool process closed" "[ -z \"\$(pgrep -x demo-tool)\" ]"

# --- second tool with string-valued requirements
click 677 552 2; click 902 596 5; shot 10-dice-installed
check "Dice Roller tarball installed with exec bit" "[ -x $APPS/dice-roller/dice-roller ] && [ -f $APPS/dice-roller/icon.png ]"
echo "failures: $fails"
