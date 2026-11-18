#!/bin/bash
# Runs inside the container: tests, then deb + AppImage. Sources are mounted read-only at /src, the cargo target is a volume.
set -euo pipefail
mkdir -p /work/app && cd /work/app
rsync -a --delete --exclude node_modules --exclude dist --exclude src-tauri/target --exclude docker/out /src/ /work/app/
export CARGO_TARGET_DIR=/target
npm ci --no-audit --no-fund
npm run build
(cd src-tauri && cargo test)
npx tauri build --bundles deb,appimage
mkdir -p /out
cp /target/release/bundle/deb/*.deb /out/
cp /target/release/bundle/appimage/*.AppImage /out/NIMVORO-linux-x64.AppImage
ls -l /out
