# ProofWeave 벤치마크 — 축소 데이터셋 + 예측 처리 (offline, 비용 0)

작성일: 2026-06-01
환경: Claude Code (solo, subagent/병렬/live 호출 없음)
방법 스크립트: `experiments/token-efficiency/scripts/predict-live-from-offline.ts`
가격 설정: `experiments/token-efficiency/fixtures/provider-pricing.current.json`

> 이 문서의 모든 토큰/비용은 **예측(ESTIMATE)** 이며 **provider billing 이 아니다.**
> - input: offline CTT(`tiktoken_o200k_base`) + 고정 프롬프트 오버헤드. **cross-model o200k proxy**(Claude/Gemini 실제 토크나이저와 다름).
> - output: 가정값(기본 150/query, OpenCode 관측 eligible output ~150에 anchor). **실측 아님.**
> - cost: 가격이 있는 모델만. gpt/claude는 가격 미검증이라 **계산하지 않음(null)** — 가격 날조 금지.
> - "절감"은 항상 **input(컨텍스트)** / **total(토큰)** / **cost** 를 분리 표기.

## 1. 왜 예측이 가능한가 (그리고 왜 OpenCode보다 깨끗한가)

직전 진단(`claude-code-rebenchmark-plan.md`)에서 OpenCode total을 망친 성분은 cache_read·reasoning·agent-runtime이었다. **통제된 single-shot 하네스에는 이들이 없다**(도구·멀티스텝·캐시 OFF). 따라서:

```
total_tokens = input_tokens + output_tokens   (cache/reasoning/runtime = 0)
input_tokens = offline_CTT(scenario) + fixed_prompt_overhead
output_tokens = (가정 또는 실측)
```

input은 offline 토크나이저로 결정적으로 잡히고, 남는 불확실성은 **output 크기 하나**다. 그래서 "데이터셋을 줄여 일부만 live로 output을 실측 → 나머지는 그 평균으로 예측"이 성립한다(아래 4).

고정 오버헤드(시스템 프롬프트 + 출력 JSON schema, 모든 호출 공통) = **85 tokens** (o200k로 토크나이즈, `predict-live-from-offline.ts`의 `FIXED_PROMPT`).

## 2. 예측 결과 (output 가정 150/query)

usageSource: input=`offline_ctt(o200k)+overhead, cross-model proxy`, output=`assumption(150)`, cost=`estimate(가격 template)`.

| 범위 | input 절감 | total 절감 | Gemini cost 절감 | raw→PW total tok |
|---|---:|---:|---:|---|
| canonical 5 (eligible 4) | **61.55%** | **53.15%** | **31.59%** | 4,397 → 2,060 |
| 전체 42 (eligible) | 61.44% | 53.14% | 31.71% | 39,966 → 18,728 |

- gpt-5.5-fast-high / claude-opus-4.8: 토큰 절감은 동일(61.5%/53.1%, CTT 동일 + o200k proxy), **cost는 가격 미검증으로 n/a.**
- input 절감(61.5%)은 CTT-only(67.6%)보다 낮다 — 고정 오버헤드 85가 양쪽 분모에 더해지기 때문(현실적).

## 3. 핵심 발견 — Gemini는 깨끗한 하네스에서도 cost 절감이 토큰 절감보다 훨씬 낮다

Gemini Flash는 output 단가($9/Mtok)가 input 단가($1.50/Mtok)의 **6배**다. output(150 토큰)은 raw·PW 양쪽이 동일하므로, PW가 줄이는 것은 input 비용뿐이고 **비싼 output 비용은 그대로 남는다.**

- raw cost/query ≈ (950 input × $1.5 + 150 output × $9)/1e6 = $0.002775
- PW cost/query ≈ (365 input × $1.5 + 150 output × $9)/1e6 = $0.0018975
- cost 절감 = 31.6% « 토큰 절감 53%

즉 OpenCode에서 Gemini가 나빠 보인 데에는 harness 오염뿐 아니라 **output-heavy pricing이라는 구조적 이유**도 있다. 깨끗한 하네스에서도 Gemini cost 절감은 토큰 절감의 절반 이하로 예측된다. (gpt/claude는 가격 확인 후 같은 분석 필요.)

## 4. output 가정 민감도 (이것이 small live anchor가 핀다운할 변수)

canonical 5 eligible, output/query 가정만 바꿈:

| output/query | input 절감 | total 절감 | Gemini cost 절감 |
|---:|---:|---:|---:|
| 150 | 61.55% | 53.15% | 31.59% |
| 300 | 61.55% | 46.77% | 21.25% |
| 600 | 61.55% | 37.71% | 12.84% |

- **input 절감은 output에 불변(61.55%)** — 견고한 수치.
- total·cost 절감만 output에 민감. output이 클수록 둘 다 하락.
- → "데이터셋 축소 + 나머지 예측"에서 **live로 실측할 핵심값은 query당 평균 output 토큰**이다. 1~수 개 query만 실측하면 이 가정을 실데이터로 고정하고 나머지를 재예측할 수 있다.

## 5. "축소 데이터셋 live + 나머지 예측" 실행 구조

스크립트는 `--measured=<live-results.jsonl>` 를 받으면:
1. 해당 (model,query,scenario) row를 **실측으로 교체**.
2. 남은 query의 output 가정을 **실측 평균으로 재보정**.
3. 재예측 결과를 measured/predicted 라벨과 함께 출력.

즉 live는 작게(예: 2~3 query × raw/artifact), 나머지 39+는 예측.

**live runner는 구현 완료(실행은 게이트됨):** `scripts/run-live-model-benchmark.ts`
- single-shot, no-agent, no-tool/cache, concurrency=1, 자동 재시도 없음, provider usage 원본(`providerUsageRaw`) 보존.
- **기본 dry-run**(API 호출 0): offline 입력 토큰 + 예상 비용만 계산. 검증됨 — canonical5×raw/artifact = 30 calls, projected input 16,593 tok(o200k), Gemini-priced 예상비용 $0.062296(output=600 max 기준).
- **실제 호출은 모두 충족 시에만**: `--execute` + `--max-usd=<cap>` + projection≤cap + pricing의 `providerModelId`/단가 채움 + `apiKeyEnv` 키 존재. 현재는 gpt/claude 단가 미검증이라 `--execute` 시 안전하게 **중단**됨(확인됨).

**실행에 아직 필요(현재 없음):** provider API 키(shell env·하네스 모두 없음 — 확인됨), gpt/claude 검증 단가+`providerModelId`, 하드 비용 cap(OpenCode 로그 $0.28 vs 계정 ~$15 괴리 경험).

## 6. 지금 주장 가능 / 보류

주장 가능(라벨 필수):
- "동일 근거 기준 ProofWeave artifact는 raw 대비 **input(컨텍스트) 토큰 ~61% 작다** (offline o200k proxy + 고정 오버헤드 포함; cross-model 근사)."
- "통제된 single-shot 하네스라면 total 토큰 절감도 ~53%로 예측된다(output 150 가정; OpenCode의 2%는 harness 오염 탓)." — **예측**임을 명시.

보류(아직 불가):
- 모든 cost/billing 절감 수치 — 실측 usage + 검증 단가 없음.
- gpt/claude cost — 가격 미검증.
- 정확한 total/cost — output 실측 anchor 없음(현재 가정값).

## 7. 재현 (비용 0)

```bash
cd experiments/token-efficiency
npm run benchmark:v2 -- --out-dir=/tmp/pw-rebench-offline          # offline CTT
npx tsx scripts/predict-live-from-offline.ts \
  --offline-dir=/tmp/pw-rebench-offline --queries=canonical5       # 예측

# live runner — 기본 dry-run (API 호출 0, 안전)
npx tsx scripts/run-live-model-benchmark.ts \
  --queries=canonical5 --scenarios=raw,artifact --max-output-tokens=600
# (키+검증단가+cap 확보 후 실제 실행)
#   --execute --max-usd=<cap>
# 그 후 측정 anchor로 나머지 재예측:
#   predict-live-from-offline.ts --measured=/tmp/proofweave-live-benchmark/live-results.jsonl
```

수치 출처: 위 명령 (2026-06-01). usageSource: input=offline_ctt(tiktoken_o200k_base)+overhead, output=assumption, cost=estimate(template price). provider billing 아님.
