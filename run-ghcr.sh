#!/usr/bin/env bash
# AIna Sentinel — run the prebuilt GHCR image stack (no build). CPU-safe by
# default; add --gpu to enable the NVIDIA runtime overlay.
#
# Usage:
#   ./run-ghcr.sh [up|down|status|logs] [--gpu] [--version <tag>]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$ROOT/deploy/docker-compose.ghcr.yml"
GPU="$ROOT/deploy/docker-compose.ghcr.gpu.yml"
VERSION="${AINA_VERSION:-v0.1.0-alpha}"
export AINA_VERSION="$VERSION"

CMD="${1:-up}"
shift || true
ARGS=()
GPU_MODE=0
for a in "$@"; do
  case "$a" in
    --gpu)       GPU_MODE=1 ;;
    --version)   VERSION="$2"; export AINA_VERSION="$VERSION"; shift ;;
    *)           ARGS+=("$a") ;;
  esac
done

FILES=(-f "$BASE")
[[ $GPU_MODE -eq 1 ]] && FILES+=(-f "$GPU")

case "$CMD" in
  up)
    docker compose "${FILES[@]}" up -d "${ARGS[@]}"
    docker compose "${FILES[@]}" ps
    echo "Dashboard: http://localhost:${DASHBOARD_PORT:-3000}"
    echo "API:       http://localhost:${API_PORT:-5000}/health"
    echo "Docs:      http://localhost:${DOCS_PORT:-3001}"
    ;;
  down)  docker compose "${FILES[@]}" down "${ARGS[@]}" ;;
  status|logs) docker compose "${FILES[@]}" "$CMD" "${ARGS[@]}" ;;
  *) echo "usage: $0 [up|down|status|logs] [--gpu] [--version <tag>]"; exit 1 ;;
esac
