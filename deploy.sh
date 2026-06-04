#!/usr/bin/env bash
# ============================================================
#  ProofWeave 배포 스크립트
#  Usage:
#    ./deploy.sh          # 전체 (API + Web)
#    ./deploy.sh api      # 백엔드만
#    ./deploy.sh web      # 프론트만
# ============================================================
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/opt/homebrew/bin:/opt/homebrew/share/google-cloud-sdk/bin:$PATH"

# 정식 GCP 프로젝트 — 프론트의 VITE_API_URL 이 가리키는 proofweave-api 가 사는 곳.
# gcloud config 의 default 에 의존하면(예: gen-lang-client) 엉뚱한 프로젝트로 배포되어
# "배포는 성공하는데 프론트는 옛 API를 보는" 사고가 난다. 그래서 고정한다.
# 필요 시 PROOFWEAVE_GCP_PROJECT 환경변수로만 override.
PROJECT_ID="${PROOFWEAVE_GCP_PROJECT:-proofweave}"
REGION="asia-northeast3"
SERVICE="proofweave-api"
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

  log "1/3 Docker 이미지 빌드... (project: $PROJECT_ID)"
  cd "$ROOT_DIR/api"
  gcloud builds submit --project "$PROJECT_ID" --tag "$IMAGE" --quiet || fail "Docker 빌드 실패"
  ok "이미지 빌드 + 푸시 완료"

  log "2/3 Cloud Run 업데이트..."
  ENV_VARS=$(node "$ROOT_DIR/api/scripts/export-run-env.js" || echo "")
  if [ -z "$ENV_VARS" ]; then
    fail "환경 변수 로드 실패"
  fi

  # 무효한 SUPABASE_SERVICE_ROLE_KEY 배포 차단 (이게 무효면 로그인/인증이 전부 깨진다).
  # 주입 직전 값을 Supabase admin API 로 실제 검증한다.
  SRK=$(printf '%s' "$ENV_VARS" | tr ',' '\n' | grep '^SUPABASE_SERVICE_ROLE_KEY=' | head -1 | sed 's/^SUPABASE_SERVICE_ROLE_KEY=//')
  SUPA_URL=$(printf '%s' "$ENV_VARS" | tr ',' '\n' | grep '^SUPABASE_URL=' | head -1 | sed 's/^SUPABASE_URL=//')
  if [ -n "$SRK" ] && [ -n "$SUPA_URL" ]; then
    SRK_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 \
      "$SUPA_URL/auth/v1/admin/users?page=1&per_page=1" \
      -H "apikey: $SRK" -H "Authorization: Bearer $SRK")
    [ "$SRK_CODE" = "200" ] || fail "SUPABASE_SERVICE_ROLE_KEY 무효 (Supabase admin API → HTTP $SRK_CODE). 배포 중단. shell env/.env 의 키를 확인하세요."
    ok "SUPABASE_SERVICE_ROLE_KEY 유효성 확인 (200)"
  else
    fail "SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_URL 누락 — 배포 중단"
  fi

  gcloud run services update "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE" \
    --set-env-vars "$ENV_VARS" \
    --quiet || fail "Cloud Run 업데이트 실패"

  # 공개(unauthenticated) 호출 허용 보장 — 이미 설정돼 있으면 no-op
  gcloud run services add-iam-policy-binding "$SERVICE" \
    --project "$PROJECT_ID" --region "$REGION" \
    --member=allUsers --role=roles/run.invoker --quiet >/dev/null 2>&1 || true
  ok "Cloud Run 배포 완료"

  log "3/3 Health check (배포한 서비스 URL 을 직접 조회)..."
  sleep 3
  # 하드코딩 URL 대신, 방금 배포한 바로 그 서비스의 URL 을 가져와 확인한다.
  SERVICE_URL=$(gcloud run services describe "$SERVICE" \
    --project "$PROJECT_ID" --region "$REGION" \
    --format='value(status.url)' 2>/dev/null || echo "")
  [ -z "$SERVICE_URL" ] && fail "서비스 URL 조회 실패"
  log "Service URL: $SERVICE_URL"

  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health")
  [ "$HEALTH" = "200" ] || fail "Health check 실패 (HTTP $HEALTH)"
  ok "API Health OK (200)"

  # 최신 코드가 실제로 반영됐는지 검증: 인증 라우트는 미인증 시 401(존재) / 404(미배포).
  CLAIMS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/claims/me")
  if [ "$CLAIMS" = "404" ]; then
    fail "최신 라우트 누락 (/claims/me → 404). 이미지 또는 프로젝트 불일치 의심."
  fi
  ok "최신 라우트 확인 (/claims/me → $CLAIMS)"
}

deploy_web() {
  log "=== 프론트엔드 배포 (Vercel) ==="

  cd "$ROOT_DIR/web"

  log "1/2 프로덕션 빌드 테스트..."
  npm run build || fail "빌드 실패"
  ok "빌드 성공"

  log "2/2 Vercel 프로덕션 배포..."
  # Vercel 프로젝트 설정은 루트 기준이므로 루트에서 실행
  cd "$ROOT_DIR"
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
