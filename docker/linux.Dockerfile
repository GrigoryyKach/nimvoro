# Linux build and test environment for NIMVORO (CI baseline: Ubuntu 22.04, old glibc).
# Build:  docker build -f docker/linux.Dockerfile -t nimvoro-linux docker
# Use:    see docker/README.md
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget ca-certificates git file pkg-config patchelf rsync \
      libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev \
      xvfb x11-apps imagemagick xdotool xauth dbus-x11 xdg-utils libglib2.0-bin \
      squashfs-tools python3 openbox fonts-dejavu fonts-noto-color-emoji \
      libgl1-mesa-dri libegl1 \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
ENV PATH=/root/.cargo/bin:$PATH
# AppImage tools cannot use FUSE inside a container.
ENV APPIMAGE_EXTRACT_AND_RUN=1
WORKDIR /work
