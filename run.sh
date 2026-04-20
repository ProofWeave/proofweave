#!/usr/bin/env bash
# ============================================================
#  ProofWeave 로컬 실행 스크립트
#  어디서든 이 스크립트만 실행하면 환경 셋업 + 서버 실행 완료!
#
#  Usage:
#    ./run.sh          # API + Web 둘 다 실행
#    ./run.sh api      # API 서버만
#    ./run.sh web      # Web 프론트만
#    ./run.sh stop     # 백그라운드 프로세스 종료
# ============================================================
set -euo pipefail

# ── 스크립트 위치 기준 루트 디렉토리 (어디서 실행해도 OK) ───
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 색상 ─────────────────────────────────────────────────────
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
BOLD="\033[1m"
NC="\033[0m"

log()  { echo -e "${CYAN}[proofweave]${NC} $1"; }
ok()   { echo -e "${GREEN}[✅]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠️]${NC} $1"; }
fail() { echo -e "${RED}[❌]${NC} $1" && exit 1; }

PID_DIR="$ROOT_DIR/.pids"
mkdir -p "$PID_DIR"

# ── 1. Node 환경 세팅 (nvm) ──────────────────────────────────
setup_node() {
  log "Node.js 환경 세팅 중..."

  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
  else
    fail "nvm이 설치되어 있지 않습니다. https://github.com/nvm-sh/nvm 참고"
  fi

  local REQUIRED_NODE
  REQUIRED_NODE=$(cat "$ROOT_DIR/.nvmrc" | tr -d '[:space:]')

  # 필요한 Node 버전 설치 & 사용
  if ! nvm ls "$REQUIRED_NODE" &>/dev/null; then
    log "Node v${REQUIRED_NODE} 설치 중..."
    nvm install "$REQUIRED_NODE" || fail "Node v${REQUIRED_NODE} 설치 실패"
  fi
  nvm use "$REQUIRED_NODE" || fail "Node v${REQUIRED_NODE} 전환 실패"

  ok "Node $(node -v) 준비 완료"
}

# ── 2. 의존성 설치 ───────────────────────────────────────────
install_deps() {
  local dir="$1"
  local name="$2"

  if [ ! -d "$dir/node_modules" ]; then
    log "${name} 의존성 설치 중 (npm install)..."
    cd "$dir"
    npm install || fail "${name} npm install 실패"
    ok "${name} 의존성 설치 완료"
  else
    # package.json이 node_modules보다 새로우면 재설치
    if [ "$dir/package.json" -nt "$dir/node_modules" ]; then
      warn "${name} package.json 변경 감지 → 재설치 중..."
      cd "$dir"
      npm install || fail "${name} npm install 실패"
      ok "${name} 의존성 업데이트 완료"
    else
      ok "${name} 의존성 이미 설치됨 (스킵)"
    fi
  fi
}

# ── 3. .env 검증 ─────────────────────────────────────────────
check_env() {
  if [ ! -f "$ROOT_DIR/.env" ]; then
    fail ".env 파일이 없습니다. .env.example을 복사하세요: cp .env.example .env"
  fi
  ok ".env 파일 확인됨"
}

# ── 4. API 서버 실행 ─────────────────────────────────────────
run_api() {
  log "API 서버 시작 중 (포트 3001)..."

  # 이미 실행 중인지 체크
  if [ -f "$PID_DIR/api.pid" ]; then
    local OLD_PID
    OLD_PID=$(cat "$PID_DIR/api.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      warn "API 서버가 이미 실행 중입니다 (PID: $OLD_PID)"
      return 0
    fi
  fi

  cd "$ROOT_DIR/api"

  # .env 심볼릭 링크 (api 디렉토리에서 루트 .env 읽기)
  if [ ! -f "$ROOT_DIR/api/.env" ] && [ ! -L "$ROOT_DIR/api/.env" ]; then
    ln -s "$ROOT_DIR/.env" "$ROOT_DIR/api/.env"
    log ".env 심볼릭 링크 생성"
  fi

  npx tsx watch src/index.ts &
  local API_PID=$!
  echo "$API_PID" > "$PID_DIR/api.pid"

  sleep 2
  if kill -0 "$API_PID" 2>/dev/null; then
    ok "API 서버 실행됨 (PID: $API_PID) → ${BOLD}http://localhost:3001${NC}"
  else
    fail "API 서버 시작 실패"
  fi
}

# ── 5. Web 프론트엔드 실행 ───────────────────────────────────
run_web() {
  log "Web 프론트엔드 시작 중 (Vite)..."

  # 이미 실행 중인지 체크
  if [ -f "$PID_DIR/web.pid" ]; then
    local OLD_PID
    OLD_PID=$(cat "$PID_DIR/web.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      warn "Web 서버가 이미 실행 중입니다 (PID: $OLD_PID)"
      return 0
    fi
  fi

  cd "$ROOT_DIR/web"
  npx vite --host &
  local WEB_PID=$!
  echo "$WEB_PID" > "$PID_DIR/web.pid"

  sleep 2
  if kill -0 "$WEB_PID" 2>/dev/null; then
    ok "Web 서버 실행됨 (PID: $WEB_PID) → ${BOLD}http://localhost:5173${NC}"
  else
    fail "Web 서버 시작 실패"
  fi
}

# ── 6. 종료 ──────────────────────────────────────────────────
stop_all() {
  log "ProofWeave 서버 종료 중..."

  for svc in api web; do
    if [ -f "$PID_DIR/${svc}.pid" ]; then
      local PID
      PID=$(cat "$PID_DIR/${svc}.pid")
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
        ok "${svc} 종료됨 (PID: $PID)"
      else
        warn "${svc} 이미 종료된 상태"
      fi
      rm -f "$PID_DIR/${svc}.pid"
    fi
  done

  ok "모든 서버 종료 완료"
}

# ── 7. 상태 출력 ─────────────────────────────────────────────
show_status() {
  echo ""
  echo -e "${BOLD}╔═══════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║      🧬 ProofWeave 실행 완료!         ║${NC}"
  echo -e "${BOLD}╠═══════════════════════════════════════╣${NC}"
  echo -e "${BOLD}║${NC}  API  → ${GREEN}http://localhost:3001${NC}         ${BOLD}║${NC}"
  echo -e "${BOLD}║${NC}  Web  → ${GREEN}http://localhost:5173${NC}         ${BOLD}║${NC}"
  echo -e "${BOLD}╠═══════════════════════════════════════╣${NC}"
  echo -e "${BOLD}║${NC}  종료: ${YELLOW}./run.sh stop${NC}                  ${BOLD}║${NC}"
  echo -e "${BOLD}║${NC}  로그: 이 터미널에서 확인            ${BOLD}║${NC}"
  echo -e "${BOLD}╚═══════════════════════════════════════╝${NC}"
  echo ""
}

# ── Main ─────────────────────────────────────────────────────
TARGET="${1:-all}"

case "$TARGET" in
  stop)
    stop_all
    exit 0
    ;;
  api)
    setup_node
    check_env
    install_deps "$ROOT_DIR/api" "API"
    run_api
    echo -e "\n${GREEN}API 서버 실행 중. Ctrl+C로 종료.${NC}"
    wait
    ;;
  web)
    setup_node
    check_env
    install_deps "$ROOT_DIR/web" "Web"
    run_web
    echo -e "\n${GREEN}Web 서버 실행 중. Ctrl+C로 종료.${NC}"
    wait
    ;;
  all)
    setup_node
    check_env
    install_deps "$ROOT_DIR/api" "API"
    install_deps "$ROOT_DIR/web" "Web"
    echo ""
    run_api
    run_web
    show_status
    echo -e "${CYAN}Ctrl+C로 모든 서버를 종료합니다.${NC}"

    # Ctrl+C → 클린 종료
    trap 'echo ""; stop_all; exit 0' INT TERM
    wait
    ;;
  *)
    echo "Usage: ./run.sh [api|web|all|stop]"
    exit 1
    ;;
esac
