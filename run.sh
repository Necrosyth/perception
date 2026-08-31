#!/usr/bin/env bash
# =============================================================================
#  AIna Sentinel — single-command run
#
#  "Only uv and docker." This script drives the whole stack through the Docker
#  Compose file and uses `uv` only as the auxiliary dependency runner for the
#  host-side capability probe. No pip, conda, npm, or apt installs on the host.
#
#  Usage:
#    ./run.sh                 # verify prerequisites, then build & start the stack
#    ./run.sh up              # same as bare (explicit)
#    ./run.sh down            # stop the stack (keeps volumes)
#    ./run.sh logs [-f]       # tail stack logs
#    ./run.sh status          # container states + service health endpoints
#    ./run.sh check           # prerequisites + GPU probe only (no start)
#    ./run.sh check --json    # machine-readable probe report
#    ./run.sh help
#
#  Exit codes:
#    0  OK
#    1  missing host tool (docker / docker compose plugin / uv)
#    2  GPU prerequisite not satisfied (no GPU / not enough VRAM / no toolkit)
#    3  fatal runtime error (compose up/down failed, etc.)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/deploy/docker-compose.yml"
ENV_FILE="$ROOT/.env"
# Resolve the compose file's relative paths (./media, ./config, build ./) against
# the repo root, not against deploy/. Keeps relative volumes correct regardless of cwd.
COMPOSE_DIR=(--project-directory "$ROOT")
CMD="${1:-up}"

# Colour only when attached to a TTY (logs stay clean when piped).
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'
  C_ACC=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_ACC=""
fi

say()  { printf '%s\n' "$*"; }
ok()   { printf '%s[ ok ]%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_WARN" "$C_RESET" "$*"; }
err()  { printf '%s[ ERR ]%s %s\n' "$C_ERR" "$C_RESET" "$*"; }
dim()  { printf '%s%s%s\n' "$C_DIM" "$*" "$C_RESET"; }

dep()  { printf '%s·%s %s\n' "$C_DIM" "$C_RESET" "$*"; }

usage() {
  sed -n '2,30p' "$0" | sed -e 's/^# \{0,1\}//' -e '/^ *$/d'
}

# -----------------------------------------------------------------------------
# Prerequisites: docker, compose plugin, uv
# -----------------------------------------------------------------------------
require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "docker not found on PATH."
    say  "Install Docker Engine (https://docs.docker.com/engine/install/), then re-run."
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "docker daemon is not running or the current user lacks permission."
    say  "Start Docker (or add your user to the docker group and re-login)."
    exit 1
  fi
  ok "docker daemon reachable"
}

COMPOSE="docker compose"
# Python side (JSON probe only) runs via uv's managed Python — no system python needed.
PY="uv run --no-project python3"

require_compose() {
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose plugin present ($(docker compose version --short 2>/dev/null || echo '?'))"
  elif command -v docker-compose >/dev/null 2>&1; then
    warn "legacy 'docker-compose' found — prefer the v2 plugin (docker compose)."
    COMPOSE="docker-compose"
  else
    err "docker compose (v2 plugin) not found."
    say  "Install the compose plugin: https://docs.docker.com/compose/install/"
    exit 1
  fi
}

require_uv() {
  if ! command -v uv >/dev/null 2>&1; then
    err "uv not found on PATH."
    say  "Install uv (the only Python tooling this project uses) via the standalone installer:"
    say  "    curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
  fi
  ok "uv present ($(uv --version | awk '{print $2}'))"
}

env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$ROOT/.env.example" ]]; then
      cp "$ROOT/.env.example" "$ENV_FILE"
      ok "created $ENV_FILE from .env.example (edit camera sources before going live)"
    else
      warn ".env.example missing — continuing with compose defaults"
    fi
  else
    ok "$ENV_FILE present"
  fi
}

# -----------------------------------------------------------------------------
# GPU prerequisites (host): nvidia-smi, VRAM, compute capability, CUDA runtime
# -----------------------------------------------------------------------------
gpu_probe() {
  # Emit host GPU facts into a temp file. Pure bash + nvidia-smi, no extra tools.
  local smi_file
  smi_file="$(mktemp)"

  if ! command -v nvidia-smi >/dev/null 2>&1; then
    err "nvidia-smi not found — no NVIDIA driver on the host."
    say  "The perception container requests the nvidia runtime. Install the driver"
    say  "and NVIDIA Container Toolkit, or run a CPU-only deployment (not supported by this compose)."
    rm -f "$smi_file"; exit 2
  fi

  # name, total VRAM MiB, driver, compute capability (semver-safe-ish)
  if ! nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap \
        --format=csv,noheader,nounits > "$smi_file" 2>/dev/null; then
    err "nvidia-smi failed — driver present but GPUs may be unavailable."
    rm -f "$smi_file"; exit 2
  fi

  local gpu_count=0 total_vram=0 min_cc="99"; IFS=$'\n'
  while read -r line; do
    [[ -z "$line" ]] && continue
    local name mem driver cc
    IFS=',' read -r name mem driver cc <<< "$line"
    name="${name// /}"; mem="${mem// /}"; driver="${driver// /}"; cc="${cc// /}"
    gpu_count=$((gpu_count+1))
    total_vram=$((total_vram + mem))
    # lower-than current min CC → keep a floor for the weakest GPU
    if [[ -n "$cc" ]]; then
      awk -v a="$cc" -v b="$min_cc" 'BEGIN{exit !(a+0 < b+0)}' && min_cc="$cc"
    fi
    printf '%s|%sMiB|driver %s|CC %s\n' "$name" "$mem" "$driver" "$cc"
  done < "$smi_file"
  rm -f "$smi_file"

  echo "gpu_count=$gpu_count"
  echo "total_vram=$total_vram"
  echo "min_cc=$min_cc"
}

check_gpu() {
  local report
  report="$(gpu_probe)" || return $?

  local gpu_count total_vram min_cc
  gpu_count="$(echo "$report" | sed -n 's/^gpu_count=//p')"
  total_vram="$(echo "$report" | sed -n 's/^total_vram=//p')"
  min_cc="$(echo "$report" | sed -n 's/^min_cc=//p')"

  ok "NVIDIA GPU detected: $gpu_count device(s), ${total_vram} MiB VRAM total, lowest compute capability $min_cc"

  # VRAM — YOLO26s @640 with TensorRT sits comfortably in ~3.5–4 GB.
  if (( total_vram < 2048 )); then
    err "less than 2 GiB VRAM — object detection will not fit."
    exit 2
  elif (( total_vram < 4096 )); then
    warn "under the recommended 4 GiB VRAM — expect P100/fallback to smaller model, or CPU."
  else
    ok "VRAM within recommended range (>= 4 GiB)"
  fi

  # Compute capability — TensorRT engines are not portable across CC; we gate.
  if awk -v c="$min_cc" 'BEGIN{exit !(c+0 < 6.0)}'; then
    err "compute capability $min_cc is below the 6.0 floor for the CUDA 12 stack."
    exit 2
  fi
  ok "compute capability $min_cc >= 6.0 (CUDA 12 / ultralytics compatible)"

  # Docker nvidia runtime — requires NVIDIA Container Toolkit configured in dockerd.
  if docker info 2>/dev/null | grep -iq "Runtimes:.*nvidia"; then
    ok "docker nvidia runtime registered (NVIDIA Container Toolkit)"
  elif command -v nvidia-container-cli >/dev/null 2>&1; then
    warn "nvidia-container-cli present but dockerd does not expose the 'nvidia' runtime."
    say  "Configure it:  sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker"
    exit 2
  else
    err "NVIDIA Container Toolkit not installed."
    say  "Install it: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
    say  "then:  sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker"
    exit 2
  fi
}

# -----------------------------------------------------------------------------
# Actions
# -----------------------------------------------------------------------------
gpu_json() {
  local report gpu_count total_vram min_cc json=""
  report="$(gpu_probe)" || return $?
  gpu_count="$(echo "$report" | sed -n 's/^gpu_count=//p')"
  total_vram="$(echo "$report" | sed -n 's/^total_vram=//p')"
  min_cc="$(echo "$report" | sed -n 's/^min_cc=//p')"
  $PY -c 'import json,sys; \
    d={"gpu_count":int(sys.argv[1]),"total_vram_mib":int(sys.argv[2]),"min_compute_capability":float(sys.argv[3])}; \
    print(json.dumps(d))' "$gpu_count" "$total_vram" "$min_cc"
}

do_check() {
  if [[ "${1:-}" == "--json" ]]; then
    local report docker_ok
    report="$(gpu_json)" || exit $?
    docker_ok=1; docker info >/dev/null 2>&1 || docker_ok=0
    $PY -c 'import json,sys
out=json.loads(sys.argv[1])
out["docker_ok"]=bool(int(sys.argv[2]))
print(json.dumps(out))' "$report" "$docker_ok"
    return 0
  fi
  say "${C_BOLD}—— AIna Sentinel · prerequisites ————————————————${C_RESET}"
  require_docker
  require_compose
  require_uv
  env_file
  check_gpu
  # Optional mount sanity: perception reads models from a sibling repo.
  if [[ -d "$ROOT/../surveillance-backend/models" ]]; then
    ok "perception model mount found (../surveillance-backend/models)"
  else
    warn "model mount ../../surveillance-backend/models not found — perception will not boot the detector."
  fi
  say "${C_BOLD}—— all checks passed —————————————————————————————————${C_RESET}"
}

do_up() {
  do_check
  say ""
  say "${C_BOLD}—— building & starting stack —————————————————————————${C_RESET}"
  (
    cd "$ROOT"
    $COMPOSE "${COMPOSE_DIR[@]}" -f "$COMPOSE_FILE" build
    $COMPOSE "${COMPOSE_DIR[@]}" -f "$COMPOSE_FILE" up -d
  ) || { err "compose up failed."; exit 3; }
  do_status
}

do_down() {
  ( cd "$ROOT" && $COMPOSE "${COMPOSE_DIR[@]}" -f "$COMPOSE_FILE" down ) || exit 3
  ok "stack stopped (volumes retained: pgdata, engine_cache)"
}

do_logs() {
  shift || true
  ( cd "$ROOT" && $COMPOSE "${COMPOSE_DIR[@]}" -f "$COMPOSE_FILE" logs "${@:-}" )
}

do_status() {
  # reload port/settings from .env for the summary
  if [[ -f "$ENV_FILE" ]]; then
    set -a; . "$ENV_FILE"; set +a
  fi
  ( cd "$ROOT" && $COMPOSE "${COMPOSE_DIR[@]}" -f "$COMPOSE_FILE" ps )
  say ""
  say "Endpoints:"
  say "  API        http://localhost:${API_PORT:-5000}/health"
  say "  Dashboard  http://localhost:${DASHBOARD_PORT:-3000}"
  say "  go2rtc     http://localhost:${GO2RTC_PORT:-1984}/api"
  say "  Docs       http://localhost:${DOCS_PORT:-3001}"
}

# -----------------------------------------------------------------------------
case "$CMD" in
  help|-h|--help)    usage ;;
  up|start)          do_up ;;
  down|stop)         do_down ;;
  logs)              do_logs "$@" ;;
  status|ps)         do_status ;;
  check|verify)      do_check "${2:-}" ;;
  *)
    err "unknown command '$CMD'"
    usage
    exit 1
    ;;
esac
