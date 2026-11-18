# Linux checks in Docker

No Linux machine is needed: the launcher is built and exercised in an `ubuntu:22.04` container (the same baseline as CI), under Xvfb.

```
docker build -f docker/linux.Dockerfile -t nimvoro-linux docker
docker volume create nimvoro-target
docker run --rm -v "<repo>:/src:ro" -v nimvoro-target:/target -v "<repo>/docker/out:/out" nimvoro-linux bash /src/docker/build-linux.sh
docker run --rm -v "<repo>:/src:ro" -v "<repo>/docker/out:/out" nimvoro-linux bash /src/docker/e2e-linux.sh
```

- `build-linux.sh` copies the sources, runs `cargo test`, builds the deb and the AppImage and puts them in `docker/out`.
- `e2e-linux.sh` starts a local mirror of GitHub (`NIMVORO_TEST_BASE_URL`, see `docs/ADDING_A_TOOL.md`), runs the AppImage under Xvfb with a temporary `HOME`, installs a demo tool, updates it, updates the launcher itself and saves screenshots to `docker/out/shots`.

`docker/out` is git-ignored.
