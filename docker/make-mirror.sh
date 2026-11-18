#!/bin/bash
# Builds a local mirror of GitHub for NIMVORO_TEST_BASE_URL (see docs/ADDING_A_TOOL.md, "Testing the launcher").
# Usage: make-mirror.sh <mirror dir> <port> [demo version]   (the launcher AppImage, if any, is /out/NIMVORO-linux-x64.AppImage)
set -euo pipefail
M=$1; PORT=$2; VER=${3:-1.0.0}
BASE=http://127.0.0.1:$PORT
mkdir -p "$M/assets" "$M/GrigoryyKach/nimvoro/main" "$M/repos/GrigoryyKach/nimvoro/releases"
mkdir -p "$M/test/demo-tool/main/assets" "$M/test/win-only/main" "$M/test/legacy/main" "$M/repos/test/demo-tool/releases"

cat > "$M/GrigoryyKach/nimvoro/main/catalog.json" <<JSON
[{"id":"demo-tool","repo":"test/demo-tool"},{"id":"win-only","repo":"test/win-only"},{"id":"legacy","repo":"test/legacy"}]
JSON
convert -size 256x256 gradient:'#4f6bff-#8a5bff' "$M/test/demo-tool/main/assets/icon.png"

cat > "$M/test/demo-tool/main/nimvoro.json" <<JSON
{"schema":1,"id":"demo-tool","name":"Demo Tool","tagline":"A tool for the Linux test","description":"Installed from the local test mirror.",
 "icon":"assets/icon.png","exe":"DemoTool.exe","asset":"DemoTool-win-x64.zip","requirements":["Windows 10/11 x64"],
 "platforms":["windows","linux"],
 "linux":{"asset":"demo-tool-linux-x64.tar.gz","exe":"demo-tool","requirements":["Linux x86_64 (X11 or Wayland)","libwebkit2gtk-4.1"]},
 "i18n":{"ru":{"tagline":"Инструмент для проверки Linux","linux":{"requirements":["Linux x86_64 (X11 или Wayland)","libwebkit2gtk-4.1"]}}}}
JSON
echo '{"schema":1,"id":"win-only","name":"Windows Only Tool","tagline":"must be hidden","description":"x","icon":"i.png","exe":"a.exe","asset":"a.zip","platforms":["windows"]}' > "$M/test/win-only/main/nimvoro.json"
echo '{"schema":1,"id":"legacy","name":"Legacy Tool","tagline":"no platforms field: must be hidden on Linux","description":"x","icon":"i.png","exe":"a.exe","asset":"a.zip"}' > "$M/test/legacy/main/nimvoro.json"

# demo tool archive: executable script at the root + icon.png, exec bit set inside the tar
T=$(mktemp -d)
# a real ELF binary (a script would show up as /bin/sh in the process list, which the launcher's "is it running" check cannot match)
cat > "$T/demo.c" <<C
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
int main(void) {
  char p[512]; snprintf(p, sizeof p, "%s/demo-started", getenv("HOME"));
  FILE *f = fopen(p, "w"); if (f) { fputs("demo-tool $VER started\n", f); fclose(f); }
  sleep(600); return 0;
}
C
gcc -O1 -o "$T/demo-tool" "$T/demo.c"; chmod 755 "$T/demo-tool"; rm "$T/demo.c"; cp "$M/test/demo-tool/main/assets/icon.png" "$T/icon.png"
tar -C "$T" -czf "$M/assets/demo-tool-linux-x64.tar.gz" demo-tool icon.png
SHA=$(sha256sum "$M/assets/demo-tool-linux-x64.tar.gz" | cut -d' ' -f1); SIZE=$(stat -c %s "$M/assets/demo-tool-linux-x64.tar.gz")
cat > "$M/repos/test/demo-tool/releases/latest" <<JSON
{"tag_name":"v$VER","published_at":"2026-11-18T10:00:00Z","html_url":"https://github.com/test/demo-tool/releases/tag/v$VER",
 "assets":[{"name":"demo-tool-linux-x64.tar.gz","browser_download_url":"$BASE/assets/demo-tool-linux-x64.tar.gz","size":$SIZE,"digest":"sha256:$SHA"}]}
JSON

# the launcher's own "new version": the AppImage under test served as v9.9.9
LAUNCHER_APPIMAGE=${LAUNCHER_APPIMAGE:-/out/NIMVORO-linux-x64.AppImage}
if [ -f "$LAUNCHER_APPIMAGE" ]; then
  cp "$LAUNCHER_APPIMAGE" "$M/assets/NIMVORO-linux-x64.AppImage"
  LSHA=$(sha256sum "$M/assets/NIMVORO-linux-x64.AppImage" | cut -d' ' -f1); LSIZE=$(stat -c %s "$M/assets/NIMVORO-linux-x64.AppImage")
  cat > "$M/repos/GrigoryyKach/nimvoro/releases/latest" <<JSON
{"tag_name":"v9.9.9","published_at":"2026-11-18T10:00:00Z","html_url":"https://github.com/GrigoryyKach/nimvoro/releases/tag/v9.9.9",
 "assets":[{"name":"NIMVORO-linux-x64.AppImage","browser_download_url":"$BASE/assets/NIMVORO-linux-x64.AppImage","size":$LSIZE,"digest":"sha256:$LSHA"}]}
JSON
fi
# optional second tool with string-valued requirements (the manifest shape Dice Roller uses): /out/DiceRoller-linux-x64.tar.gz
if [ -f /out/DiceRoller-linux-x64.tar.gz ]; then
  mkdir -p "$M/test/dice-roller/main/assets" "$M/repos/test/dice-roller/releases"
  cp "$M/test/demo-tool/main/assets/icon.png" "$M/test/dice-roller/main/assets/icon.png"
  cp /out/DiceRoller-linux-x64.tar.gz "$M/assets/"
  cat > "$M/test/dice-roller/main/nimvoro.json" <<JSON
{"schema":1,"id":"dice-roller","name":"Dice Roller","tagline":"3D dice","description":"Linux requirements given as a string.",
 "icon":"assets/icon.png","exe":"DiceRoller.exe","asset":"DiceRoller-win-x64.zip","requirements":["Windows 10/11 x64"],"platforms":["windows","linux"],
 "linux":{"asset":"DiceRoller-linux-x64.tar.gz","exe":"dice-roller","requirements":"Linux x86_64; libwebkit2gtk-4.1 is required"},
 "i18n":{"ru":{"linux":{"requirements":"Linux x86_64; нужен libwebkit2gtk-4.1"}}}}
JSON
  DSHA=$(sha256sum "$M/assets/DiceRoller-linux-x64.tar.gz" | cut -d' ' -f1); DSIZE=$(stat -c %s "$M/assets/DiceRoller-linux-x64.tar.gz")
  cat > "$M/repos/test/dice-roller/releases/latest" <<JSON
{"tag_name":"v1.2.0","published_at":"2026-11-18T10:00:00Z","html_url":"https://github.com/test/dice-roller/releases/tag/v1.2.0",
 "assets":[{"name":"DiceRoller-linux-x64.tar.gz","browser_download_url":"$BASE/assets/DiceRoller-linux-x64.tar.gz","size":$DSIZE,"digest":"sha256:$DSHA"}]}
JSON
  sed -i 's#\[{"id":"demo-tool"#[{"id":"dice-roller","repo":"test/dice-roller"},{"id":"demo-tool"#' "$M/GrigoryyKach/nimvoro/main/catalog.json"
fi
echo "mirror ready in $M"
