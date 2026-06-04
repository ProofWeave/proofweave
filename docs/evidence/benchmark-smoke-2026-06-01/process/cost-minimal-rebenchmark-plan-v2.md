# 비용 최소화 재설계 — 품질/토큰/비용 분리 (v2)

작성일: 2026-06-01
배경: 최신 플래그십 모델 API 비용이 부담 → "품질"과 "토큰/비용"을 분리하고, 각 차원을 **가장 싼 경로**로 측정한다.

> 용어: "절감"은 항상 **입력(컨텍스트)** / **출력+총토큰** / **비용**을 분리. 숫자엔 usageSource 라벨.

## 핵심 아이디어 — 세 차원을 분리해 각각 최저비용 경로로

| 차원 | 무엇 | 가장 싼 경로 | 비용 |
|---|---|---|---|
| A. 입력 컨텍스트 절감 | raw vs artifact 입력 토큰 | (이미) offline tiktoken + (신규) **provider count-tokens 무료 API** | **$0** |
| B. 답변 품질 유지 | artifact가 품질 떨어뜨리나 | 모델별 **기존 에이전트**로 평가(아래) | **$0** (구독/포함 사용량) |
| C. 출력 토큰 + 달러 비용 | 실제 output·$ | metered 생성, **최소 cap·최소 쿼리** | **센트 단위** |

이전 플랜은 3모델 × 여러 쿼리 × 생성을 한 번에 돌리려 했다. v2는 **A·B를 $0로 떼어내고, C만 아주 작게** 유료로 남긴다.

---

## A. 입력 컨텍스트 절감 — $0, provider-정확

- offline o200k proxy(이미 측정): artifact 입력 **~61–67% 절감**(`predicted-cost-token-estimate.md`, `claude-code-rebenchmark-plan.md`).
- **업그레이드(무료)**: provider count-tokens로 o200k 근사를 **provider-정확 입력 토큰**으로 교체.
  - Anthropic `POST /v1/messages/count_tokens` — **공식 "free to use"** (분당 rate limit만; estimate; cache 미적용). 확인: platform.claude.com token-counting 문서.
  - Gemini `models.countTokens` — 무료로 **추정**(공식 문서에 무료 명시 못 찾음 → "무료 추정, 단가표 재확인 필요"로 라벨).
  - OpenAI: 별도 무료 count 엔드포인트 대신 tiktoken(o200k)로 로컬 계산이 이미 정확 → 추가 호출 불필요.
- 생성이 없으므로 **토큰 과금 0**. 키만 있으면 됨. → A는 키 확보 즉시 $0로 정확화 가능.

## B. 답변 품질 — $0, 모델별 에이전트로 분담

artifact 압축이 답변 품질을 떨어뜨리지 않는지(루브릭: mustInclude 커버리지 × no-hallucinate, threshold 0.75)를 **모델별로 분담**:

| 모델 | 평가자 | 상태 | 비용 |
|---|---|---|---|
| Claude | 이 Claude Code 세션(나) | **완료** (`quality-comparison-subscription.md`, 4/4 품질 유지) | $0 |
| GPT | **Codex** (사용자 기존 접근) | 프롬프트 제공 (`quality-comparison-agent-prompts.md`) | $0 (구독/포함) |
| Gemini | **Antigravity** (Google 에이전트 IDE) | 프롬프트 제공 (동 문서) | $0 (구독/포함) |

주의: Codex/Antigravity도 agent harness라 **토큰/비용 수치는 신뢰 불가** → 거기서는 **품질만** 받고 토큰/비용은 절대 인용 안 함(우리가 OpenCode를 버린 이유와 동일). 이 분담으로 **3모델 품질을 전부 $0**에 확보.

## C. 출력 토큰 + 비용 — 센트 단위 metered

A로 입력을, B로 품질을 이미 확보했으므로, **C는 오직 "모델이 답을 몇 토큰 생성하나 + 그 달러"만** 남는다. 따라서 최대한 축소:

- 모델: 가진 키만. (예산 우선순위: Gemini > GPT > Claude Opus. Opus가 가장 비싸므로 마지막/선택)
- 쿼리: 모델당 **1쿼리(`bq_full_013`)**, scenario raw+artifact = **2콜/모델**.
- **출력 cap 최소**: 품질은 B가 보증하므로 C의 생성 품질은 무관 → `--max-output-tokens=120` 같은 짧은 값. (출력 토큰 "규모"만 보면 됨)
- cache/tool/web off, temperature=0, concurrency=1, 재시도 없음.
- runner `--execute --max-usd=<cap>`로 cap 강제. projection 초과 시 자동 중단.

예상 비용(120 output 가정, Gemini 단가 1.5/9):
- Gemini 2콜 ≈ 입력 ~1,300 tok + 출력 ~240 tok → **< $0.005**.
- GPT/Claude는 단가 확인 후 동일 규모면 각 **1센트 안팎**(Opus는 단가 높아 더 클 수 있어 마지막에 판단).

C의 산출물(실측 output)로 `predict-live-from-offline.ts --measured=`를 돌려 **나머지 쿼리의 total/비용 예측을 실데이터로 재보정**한다. 즉 1쿼리 실측으로 42쿼리 예측을 고정.

---

## 실행 순서

1. **(A 준비, $0)** 키 들어오면 runner에 count-tokens 모드 추가 → provider-정확 입력 토큰으로 A 확정.
2. **(B, $0)** Codex·Antigravity에 `quality-comparison-agent-prompts.md`의 프롬프트 전달 → GPT/Gemini 품질 결과 회수. (Claude는 완료)
3. **(C, 센트)** 가진 키로 모델당 1쿼리×raw/artifact, output cap 120, `--max-usd` cap → 실측 output.
4. **(통합)** C 실측으로 예측 재보정 → 최종 보고: A(입력 절감, provider-정확) + B(품질 유지, 3모델) + C(출력/비용, 실측+예측), 전부 라벨.

## 비용 상한 요약

| 단계 | 비용 |
|---|---|
| A 입력(count-tokens) | $0 (무료 API) |
| B 품질(3 에이전트) | $0 (구독/포함) |
| C 출력/비용(metered) | 모델당 1~2센트, cap 강제. Opus는 선택 |
| **합계** | **수 센트 (cap 내)** |

이전 "3모델 전체 생성" 대비, 품질·입력을 $0로 떼어내 **유료 호출을 모델당 2콜로** 축소했다.

## 정직성 가드(유지)

- 구독/Workbench/agent로 얻은 토큰·비용 수치는 인용 금지(harness 오염 또는 단가 부재).
- count-tokens는 "estimate"이며 cache 미반영 — input 비교용으로만.
- Gemini count-tokens 무료 여부는 단가표 재확인 후 확정.
- 출력 토큰은 생성해야만 알 수 있어 C는 회피 불가(최소화만 가능).
