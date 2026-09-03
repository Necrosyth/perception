#!/usr/bin/env bash
# Build & push the AIna Sentinel service images to GHCR for distribution.
#
# Images (each self-contained; no build-time npm/uv/pip needed by the consumer):
#   ghcr.io/hypotenuse-analytics/aina-sentinel-api
#   ghcr.io/hypotenuse-analytics/aina-sentinel-dashboard
#   ghcr.io/hypotenuse-analytics/aina-sentinel-docs
#   ghcr.io/hypotenuse-analytics/aina-sentinel-media
#   ghcr.io/hypotenuse-analytics/aina-sentinel-perception
#
# Usage:
#   ./deploy/build-push.sh            # build + push all five images
#   ./deploy/build-push.sh api        # just one image
#   GHCR_IMAGE=ghcr.io/hypotenuse-analytics/...  # override the image prefix
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${GHCR_IMAGE:-ghcr.io/hypotenuse-analytics/aina-sentinel}"

# Authenticate to GHCR with the GitHub CLI token (requires write:packages).
if ! docker info >/dev/null 2>&1; then
  echo "[ERR] docker daemon not running" >&2
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "[ERR] gh CLI required for GHCR auth" >&2
  exit 1
fi
echo "$(gh auth token)" | docker login ghcr.io -u "$(gh api user --jq .login)" --password-stdin >/dev/null

build_image() {
  local name="$1" dockerfile="$2" target="$PREFIX-$name"
  echo "==> building $target"
  docker buildx build \
    --platform linux/amd64 \
    --file "$ROOT/deploy/$dockerfile" \
    --tag "$target:latest" \
    --tag "$target:v0.1.0-alpha" \
    --push \
    "$ROOT"
  echo "==> pushed $target"
}

build_one() {
  case "$1" in
    api)         build_image api         Dockerfile.api ;;
    dashboard)   build_image dashboard   Dockerfile.dashboard ;;
    docs)        build_image docs        Dockerfile.docs ;;
    media)       build_image media       Dockerfile.media ;;
    perception)  build_image perception Dockerfile.perception ;;
    *) echo "unknown image: $1 (api|dashboard|docs|media|perception)" >&2; exit 1 ;;
  esac
}

if [[ $# -gt 0 ]]; then
  build_one "$1"
else
  for img in api dashboard docs media perception; do
    build_one "$img"
  done
fi
echo "done."
