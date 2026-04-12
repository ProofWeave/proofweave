#!/usr/bin/env bash
# ============================================================
#  ProofWeave 배포 스크립트
#  Usage:
#    ./deploy.sh          # 전체 (API + Web)
#    ./deploy.sh api      # 백엔드만
#    ./deploy.sh web      # 프론트만
# ============================================================
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/share/google-cloud-sdk/bin:$PATH"

PROJECT_ID="proofweave"
REGION="asia-northeast3"
IMAGE="asia-northeast3-docker.pkg.dev/$PROJECT_ID/proofweave/api:latest"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 색상
GREEN="\033[0;32m"
CYAN="\033[0;36m"
RED="\033[0;31m"
NC="\033[0m"

log()  { echo -e "${CYAN}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[✅]${NC} $1"; }
fail() { echo -e "${RED}[❌]${NC} $1" && exit 1; }

deploy_api() {
  log "=== API 서버 배포 (Cloud Run) ==="

  log "1/3 Docker 이미지 빌드..."
  cd "$ROOT_DIR/api"
  gcloud builds submit --tag "$IMAGE" --quiet || fail "Docker 빌드 실패"
  ok "이미지 빌드 + 푸시 완료"

  log "2/3 Cloud Run 업데이트..."
  gcloud run services update proofweave-api \
    --region "$REGION" \
    --image "$IMAGE" \
    --quiet || fail "Cloud Run 업데이트 실패"
  ok "Cloud Run 배포 완료"

  log "3/3 Health check..."
  sleep 3
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://proofweave-api-299076588815.$REGION.run.app/health")
  if [ "$HTTP_CODE" = "200" ]; then
    ok "API Health OK (200)"
  else
    fail "Health check 실패 (HTTP $HTTP_CODE)"
  fi
}

deploy_web() {
  log "=== 프론트엔드 배포 (Vercel) ==="

  cd "$ROOT_DIR/web"

  log "1/2 프로덕션 빌드 테스트..."
  npm run build || fail "빌드 실패"
  ok "빌드 성공"

  log "2/2 Vercel 프로덕션 배포..."
  npx vercel --prod --yes || fail "Vercel 배포 실패"
  ok "Vercel 배포 완료: https://proofweave.vercel.app"
}

# ── Main ────────────────────────────────────────────────────
TARGET="${1:-all}"

case "$TARGET" in
  api)
    deploy_api
    ;;
  web)
    deploy_web
    ;;
  all)
    deploy_api
    echo ""
    deploy_web
    ;;
  *)
    echo "Usage: ./deploy.sh [api|web|all]"
    exit 1
    ;;
esac

echo ""
ok "배포 완료! 🚀"
