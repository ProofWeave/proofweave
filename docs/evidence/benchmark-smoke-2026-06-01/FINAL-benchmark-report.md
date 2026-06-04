# ProofWeave 토큰효율 벤치마크 — 최종 보고서

작성일: 2026-06-02 · 환경: Claude Code (solo, subagent/병렬 없음)

---

## 📊 핵심 수치 (TL;DR)

**LIVE 실측** (provider usage metadata · single-shot · cache/tool off · 전체 42쿼리 paired · 출력 cap 2000 잘림 해소본). 저가 티어 호출, 비용은 절감률만(금액 비공개).

| 지표 | GPT (gpt-5.4-mini) | Gemini (gemini-3.5-flash) | Claude (claude-sonnet-4-6) |
|---|---:|---:|---:|
| **입력(컨텍스트) 절감** | **59.51%** | **60.49%** | **59.87%** |
| 총토큰 절감 | 48.22% | 35.74% | 45.58% |
| 비용 절감(상대) | 28.31% | 24.49% | 35.54% |
| paired 쿼리 | 41 | 41 | 24¹ |

**offline / retrieval** (모델 호출 0):
| 지표 | 값 | 비고 |
|---|---:|---|
| artifact 입력 절감 (offline CTT, tiktoken o200k) | 67.41% (42쿼리) | proxy, billing 아님 |
| 답변 품질 (artifact vs raw) | regression **none** (3모델) | 환각 0, 단 §품질 caveat |
| Retrieval Hit@3 | 94.44% | fixture 기반 |
| Retrieval MRR | 0.819 | |
| no-match precision/recall | 100% / 100% | |
| Top-K(k=5) 컨텍스트 효과 | **−38.0%(증가)** | 검색 폭 클수록 절감 사라짐 |

**한 줄 결론:** 동일 근거를 ProofWeave artifact로 주면 **입력 컨텍스트가 3모델 모두 ~60% 작고**(live 실측), **답변 품질은 동등**하다. 총토큰·비용 절감은 그보다 작고 모델/출력 구조에 의존한다.

¹ Claude는 재실행 중 025–042 구간이 네트워크 오류(`fetch failed`)로 실패 → 24쿼리만 집계(입력 절감은 타 모델과 일치하여 결론 불변).

---

## 1. 이 실험이 무엇을 측정하는가

ProofWeave의 핵심 주장: "원본 소스(raw source bundle)를 그대로 LLM에 넣는 대신 큐레이션된 **artifact**(압축본)를 넣으면 **같은 답을 더 적은 컨텍스트로** 낸다." 같은 질문에 대해 두 워크플로를 **paired** 비교한다:
- **raw**: 정답 listing의 원본 소스 번들을 컨텍스트로.
- **ProofWeave(artifact)**: 같은 listing의 압축 artifact를 컨텍스트로.

측정 축을 분리한다(섞지 않음):
- **토큰/비용 효율**(입력·출력·총토큰·비용) — "얼마나 싸게 답하나".
- **답변 품질**(필수 개념 커버 + 환각 회피) — "압축이 답을 망치지 않나".
- **검색(retrieval)**(Hit@K·MRR·no-match) — "필요한 artifact를 잘 찾고, 없을 땐 없다고 하나". 별도 파일·별도 기준.

원칙: no-match 쿼리에서 컨텍스트가 작아진 것은 토큰 절감 성공으로 세지 않는다(검색이 '없음'을 맞췄는지로만 평가).

## 2. 왜 이렇게 측정했는가 (1차 OpenCode 실패의 교훈)

1차(OpenCode)는 **agent harness 오염**으로 실패했다:
- OpenCode total에 cache_read·reasoning·멀티스텝 runtime이 섞여, GPT total 절감 2.38%·Gemini 1.21%로 나왔다(input은 ~63% 줄었는데도).
- OpenCode "input"조차 동일 쿼리 offline 대비 ~23배 부풀려져 있었다(agent scaffolding).
- usageSource(offline_ctt vs opencode_request_usage)·query set이 모델마다 달라 비교 불가.

→ 결론: **agent를 거치지 말고 single-shot으로 provider usage를 직접** 받아야 깨끗하다. 이번엔: agent 루프·도구·캐시·웹·grounding 전부 OFF, 동일 system 프롬프트+출력 schema, temperature 0, concurrency 1, provider usage 원본 보존, 비용은 실측 토큰 × 공식단가(estimatedCost 라벨).
(1차 산출물은 `archive-opencode/`에 보관 — **인용 금지**.)

## 3. 실험 설계 상세

### 3.1 데이터셋
- fixture: `experiments/token-efficiency/fixtures/benchmark-v2.full.json` (42 쿼리, 6 도메인, no-match 포함).
- 각 쿼리: 정답 listing + qualityRubric(mustInclude / mustNotHallucinate / passThreshold 0.75).
- 전체 42쿼리 × raw/artifact = **84콜/모델** (방침: "저가 모델이라도 데이터셋을 늘리는 게 의미 있다").

### 3.2 호출 모델 (저비용 티어) — 발표 라벨과 분리
| 발표 비교 라벨 | 실제 호출 모델 (저가) | 단가 in/out ($/Mtok) | 출처(2026-06-01 확인) |
|---|---|---|---|
| GPT-5.5 | `gpt-5.4-mini` | 0.75 / 4.50 | developers.openai.com (gpt-5.5-mini 미존재) |
| Gemini 3.5 | `gemini-3.5-flash` | 1.50 / 9.00 | ai.google.dev (output에 thinking 포함) |
| Claude Opus 4.8 | `claude-sonnet-4-6` | 3.00 / 15.00 | platform.claude.com |

단가 전부 공식 pricing 확인(추측 0). config: `fixtures/provider-pricing.current.json`.

### 3.3 측정 도구 (모델 호출 / offline 분리)
- `run-live-model-benchmark.ts` — single-shot live runner. 기본 dry-run, `--execute --max-usd=<cap>` 게이트(projection 초과 시 중단, 누적 추적, 재시도 없음).
- `run-benchmark-v2.ts` — offline CTT(tiktoken o200k) (모델 호출 0).
- `run-retrieval-benchmark.ts` — Hit@K/MRR/nDCG/no-match (offline).
- `summarize-live-results.mjs` — live 결과 모델별 paired 집계(금액 제외, 절감률만).
- `make-clean-contexts.mjs` — 품질 평가용 "정답 누출 제거" 컨텍스트 생성.

### 3.4 비용 통제
- 모델별 하드 cap을 `--max-usd`로 강제. 모델별 따로 실행해 cap 독립 적용.
- 실측 지출은 세 모델 모두 cap 대비 극소(구체 금액 비공개).

## 4. 토큰/비용 결과 (live 실측)

상단 TL;DR 표 참조. 핵심 발견:
1. **입력 절감 ~59–60%는 3모델 provider 실측으로 일관 재현**됐다(offline o200k proxy 67%와 정합). 모델 티어 무관하게 robust → ProofWeave 컨텍스트 압축 주장 **입증**. 가장 견고한 결과.
2. **총토큰 절감이 OpenCode(GPT 2.38%)와 달리 ~36–48%로 회복**됐다 → "OpenCode total은 harness 오염" 진단을 실측 확정. 깨끗한 single-shot에선 total이 input 절감을 따라간다.
3. **비용 절감(24–36%)은 토큰 절감과 다르다.** output 단가가 input보다 높고(Gemini 6배, Sonnet 5배) output은 raw·artifact가 비슷하므로, 비용 절감률은 output 비중·단가 구조에 좌우 → 별도 수치로 보고.

### 4.1 caveat
- **출력 cap 보정**: 1차에서 Claude(output=600 막힘)·Gemini(output 21–23토큰 잘림)가 total/cost 저평가 → cap 2000 재실행으로 해소(2000 도달 0건). 1차 Gemini "비용절감 45%"는 출력 ~0이라 나온 허수, 정상 출력에서 24.49%로 수렴.
- Claude 24쿼리(네트워크 실패). 입력 절감은 타 모델과 일치하나 total/cost 표본은 41 vs 24로 다름.
- 저가 티어 측정 → 플래그십 절대 토큰/비용과 다를 수 있음. 단 입력 절감률은 티어 무관 경향.
- 비용 절감률은 토큰 비율 상대값이며 실제 청구액은 비공개. provider 청구서 아님.

## 5. 답변 품질 결과 (3모델 분담, 추가 API 비용 없이)

매칭 4쿼리(013/019/025/031) + no-match(037), 모델별 에이전트 분담:

| 모델 | 평가자 | raw pass | artifact pass | regression | no-match 거절 |
|---|---|---|---|---|---|
| Claude | Claude Code 세션 | 4/4 | 4/4 | none | ✅ |
| GPT | Codex (`gpt-5-codex`) | 4/4 | 4/4 | none | ✅ |
| Gemini | Antigravity (`gemini-3.5-flash`) | 4/4 | 4/4 | none | ✅ |

→ 3모델 모두 artifact가 raw 대비 품질 저하 없음. 결과: `quality/`.

**공정성 수정**: 원본 raw/artifact에 정답 용어가 본문에 박혀(예: raw `"The correct answer ... should mention: ..."`, artifact `"Required terms ... intentionally present"`) 베끼기만 해도 만점이 되는 문제가 있었다 → `make-clean-contexts.mjs`로 누출 섹션 제거 clean 컨텍스트 생성(실제 근거는 보존, 누출 0 검증).

**품질 caveat (과신 금지)**: 세 평가 모두 정확히 1.0 만점 수렴. (a) fixture가 품질 동등에 유리하게 설계됐고, (b) 회수 JSON에 clean 사용 여부·LLM 실질 채점 근거가 명시 안 됨 → **키워드 매칭에 가까운 평가일 가능성**. "품질 저하 없음"은 **이 데이터셋·루브릭 한정 결론**이며 적대적 스트레스 테스트는 아니다.

## 6. 발표 덱(`proofweave-benchmark-deck.pdf`) 대비 검증

> 사용자 메모: "이거는 좀 과하게 한 거 같다, 처음에 목표로 대충 해둔 것." → 정직하게 대조한다. **덱 page 5·6 하단에 "Projected preview ... live API billing run in progress"라고 명시돼 있어, 덱 수치는 처음부터 'projection(예측)'이었다.** 실측과 대조 결과:

| 덱 주장 | 덱 값 | 실측 | 판정 |
|---|---|---|---|
| Context Saving (artifact vs raw) | 67.4% (3모델 동일) | offline 67.41% ✅ / **live ~60%** | offline은 일치. live는 ~60%(토크나이저 차로 모델별 상이) |
| Quality Pass Rate | 100% | regression none(품질 동등) | ✅ 단 만점수렴 caveat |
| Retrieval Hit@K | 94.4% | 94.44% | ✅ 일치 |
| Retrieval MRR | 0.82 | 0.819 | ✅ 일치 |
| Top-K Context Effect | −38.1% | −38.0% | ✅ 일치 |
| no-match precision | (원칙만) | 100% | ✅ |
| **Quality-Adjusted Savings 61–64% ±CI** | GPT 64±5 / Opus 63±4 / Gemini 61±4 | **미산출(검증 안 됨)** | ⚠️ projection. ±CI(부트스트랩) 실제 계산 안 함 |
| **Estimated Live API Cost ~$1–3.5** | 모델별 금액 | 실제는 더 쌌고, **금액 비공개 방침** | ⚠️ projection. 절대 금액 주장 폐기 |

**덱에서 과했던/검증 안 된 부분 (사용자 직감대로):**
1. **"Quality-Adjusted Savings 61–64% ± CI"** — projection이었고, `reduction × quality_score`의 부트스트랩 신뢰구간은 실제로 산출하지 않았다. 발표에서 이 수치·오차범위를 단정하면 안 됨.
2. **"Estimated Live API Cost ~$3/$3.5/$1"** — projection. 이제 실제 청구액은 기재하지 않으며, 비용은 **절감률(%)**로만 말한다.
3. **"Context Saving 67.4% 3모델 동일"** — offline o200k proxy라 동일했던 것. live provider 실측은 토크나이저 차로 **모델별 ~59–60%로 약간씩 다르다**. "67.4% 단일 숫자, 3모델 동일"은 proxy 한정.

**덱에서 실제로 맞은 부분:** retrieval(Hit@K 94.4%, MRR 0.82, no-match 100%), Top-K −38.1%, offline context 67.4%, 품질 동등(방향). 구조·원칙(축 분리, no-match 제외)도 그대로 지켜졌다.

## 7. 남은 것 / 완성도

| 항목 | 상태 |
|---|---|
| 입력 절감 결론 | ✅ 확정(3모델 ~59–60%, live) — 추가 실행 불필요 |
| 총토큰/비용 | ✅ 출력 cap 보정 재실행으로 확정(total 36–48%, cost 24–36%) |
| GPT live | ✅ 84/84 (output 자연종료) |
| Gemini live | ✅ 84/84 (재실행) |
| Claude live | ✅ 24쿼리(025–042 네트워크 실패분만 재실행하면 41로 보강 — 선택) |
| 품질 | ✅ 3모델 회수(단 만점수렴 caveat) |
| retrieval | ✅ Hit@3 94.4% / MRR 0.82 / no-match 100% |

→ **"1번 더"로 끝나는 항목은 없다(이미 사실상 완료).** 선택적 보강: Claude 실패분 재실행(결론 불변), 적대적 품질 테스트(누출 제거+더 어려운 루브릭).

## 8. 시각화 방안 (Claude coworker가 `live-results-summary.json`·`retrieval-summary.json`만 입력으로; 재계산 금지)

1. **3축 분리 막대**(모델별): 입력/총토큰/비용 절감 나란히 — "세 절감은 다르다"를 한 그림에.
2. **OpenCode vs single-shot 대조**: GPT total 2.38%→48.22% 비포/애프터 — harness 오염 시각화.
3. **raw vs artifact 입력 토큰**(쿼리별 누적) — 압축 폭.
4. **retrieval 카드**: Hit@3 94.4% / MRR 0.82 / no-match 100%.
5. **Top-K 곡선**: k=1 −67.9% → k=5 +38.0% — 검색 폭과 절감의 트레이드오프.
6. **품질 매트릭스**: 3모델 × 4쿼리 raw/artifact pass.
7. **usageSource 사다리**: offline_ctt → provider_usage_metadata → (미달성)provider_billing — 증거 등급.

각 차트 캡션에 usageSource·모델 티어·caveat·"estimatedCost(청구서 아님, 금액 비공개)" 명기. **덱의 ±CI·달러금액·"67.4% 3모델 동일"은 재사용 금지**(§6).

## 9. 재현 명령

```bash
cd experiments/token-efficiency
npm run benchmark:v2 -- --out-dir=/tmp/pw-rebench-offline      # offline CTT (비용 0)
npm run retrieval:v2 -- --out-dir=/tmp/pw-retrieval            # retrieval (비용 0)
node scripts/make-clean-contexts.mjs                          # 품질용 clean 컨텍스트
# live (키 필요, cap 강제) — 모델별
npx tsx scripts/run-live-model-benchmark.ts --models=gpt-5.4-mini --queries=all --scenarios=raw,artifact --max-output-tokens=2000 --execute --max-usd=6 --out-dir=/tmp/pw-live-gpt
node scripts/summarize-live-results.mjs /tmp/pw-live-gpt/live-results.jsonl /tmp/pw-live-gemini2/live-results.jsonl /tmp/pw-live-claude2/live-results.jsonl
```

데이터 출처: live `live-raw/*.jsonl` + `live-results-summary.json`, retrieval `retrieval-summary.json`. usageSource는 각 표에 라벨. provider 청구서 아님, 실제 청구액 비공개.
