# GPT(Codex) · Gemini(Antigravity) 답변 품질 비교 — 위임 프롬프트 + 레퍼런스

목적: Claude 품질 평가(`quality-comparison-subscription.md`)와 **완전히 동일한 방식**으로, GPT는 Codex가·Gemini는 Antigravity가 자기 모델로 raw vs ProofWeave artifact 답변 품질을 비교한다.

## 공통 규칙 (반드시 지킬 것)

- 이것은 **품질 전용** 평가다. **토큰 수·비용·달러를 측정하거나 보고하지 말 것.** (에이전트 런타임은 harness라 토큰/비용이 오염된다 — 인용 금지.)
- 평가 모델을 결과에 명시한다 (Codex→사용한 GPT 모델 id, Antigravity→사용한 Gemini 모델 id).
- 답변은 **각 컨텍스트만** 보고 생성한다(외부 지식·웹 금지). raw 답변은 raw 파일만, artifact 답변은 artifact 파일만 근거로.
- 답변은 짧게(핵심 용어 커버가 목적). 새 파일 생성·코드 실행 불필요, 읽기+채점만.

## 데이터 (repo: research-lab/proofweave, 경로는 repo 루트 기준)

평가 대상 4개 쿼리(매칭) + 1개 no-match. fixture: `experiments/token-efficiency/fixtures/benchmark-v2.full.json`

| queryId | domain | userQuery (요약) | raw 파일 | artifact 파일 | rubric.mustInclude | rubric.mustNotHallucinate |
|---|---|---|---|---|---|---|
| bq_full_013 | market_timeseries | Kraken OHLC vs trades candle 검증에 필요한 컬럼·gap policy | `experiments/token-efficiency/fixtures/v2-full/source-bundles/kraken-ohlc-trades.md` | `experiments/token-efficiency/fixtures/v2-full/artifacts/kraken-ohlc-trades.md` | OHLC, trades, last cursor, gap list | forward-fill by default, Binance only, daily only |
| bq_full_019 | regulatory_comparison | FATF Travel Rule originator/beneficiary 분리 비교표 | `.../source-bundles/fatf-travel-rule.md` | `.../artifacts/fatf-travel-rule.md` | Recommendation 16, originator information, beneficiary information, VASP | single global threshold, no local law needed, privacy exemption for all |
| bq_full_025 | security_deployment | Base UUPS 프록시 배포 전 _disableInitializers/ERC1967Proxy/storage layout 체크리스트 | `.../source-bundles/openzeppelin-uups-deploy.md` | `.../artifacts/openzeppelin-uups-deploy.md` | _disableInitializers, ERC1967Proxy, storage layout, upgrade authorization | beacon proxy only, constructor initializes proxy state, skip storage check |
| bq_full_031 | agent_workflow | Claude Code Skill의 SKILL.md description·progressive disclosure 설계 | `.../source-bundles/claude-code-skills.md` | `.../artifacts/claude-code-skills.md` | SKILL.md, description, progressive disclosure, workflow steps | plugin manifest required, API key required, always load all references |
| bq_full_037 | api_spec_migration | (no-match: 매칭 listing 없음) | — | — | — | — |

(정확한 userQuery 전문과 rubric은 fixture의 `queries[].userQuery` / `queries[].qualityRubric`에서 직접 확인 가능. 위 경로의 `.../`는 `experiments/token-efficiency/fixtures/v2-full/` 생략형.)

## 채점식 (Claude 평가와 동일)

```
mustInclude_coverage = (답변이 담은 mustInclude 용어 수) / (mustInclude 총 개수)   # 대소문자 무시 부분일치
no_hallucination     = (답변에 mustNotHallucinate 용어가 하나도 없으면 1, 있으면 0)
score                = mustInclude_coverage × no_hallucination
pass                 = score >= 0.75
```
- bq_full_037은 no-match → "검색 결과 없음/근거 부족"이라고 답하는 게 정답. 품질 점수 집계에서 제외하고 "no-match를 올바르게 거절했는가"만 yes/no로 기록.

## 절차

각 매칭 쿼리(013,019,025,031)에 대해:
1. raw 파일을 읽고, 그 내용만 근거로 userQuery에 짧게 답 → mustInclude/ mustNotHallucinate로 채점.
2. artifact 파일을 읽고, 그 내용만 근거로 같은 userQuery에 짧게 답 → 동일 채점.
3. raw score vs artifact score 비교.

## 출력 형식 (이대로 표 + JSON으로 회신)

```json
{
  "evaluatorAgent": "codex | antigravity",
  "model": "사용한 실제 모델 id",
  "usageNote": "quality only; tokens/cost NOT measured (agent harness)",
  "perQuery": [
    {"queryId":"bq_full_013","rawScore":0.0,"artifactScore":0.0,"rawPass":true,"artifactPass":true,
     "rawMustIncludeHit":"4/4","artifactMustIncludeHit":"4/4","rawHallucination":false,"artifactHallucination":false},
    {"queryId":"bq_full_019", "...": "..."},
    {"queryId":"bq_full_025", "...": "..."},
    {"queryId":"bq_full_031", "...": "..."}
  ],
  "noMatch": {"queryId":"bq_full_037","correctlyRefused":true},
  "summary": {"matchedQueries":4,"artifactPassCount":0,"rawPassCount":0,"qualityRegressionVsRaw":"none|some|details"}
}
```

저장 위치 제안: `docs/evidence/benchmark-smoke-2026-06-01/quality-<agent>-<model>.json` + 한 줄 요약 md.

---

## 프롬프트 A — Codex (GPT)에 그대로 붙여넣기

```
ProofWeave 토큰효율 벤치마크의 "답변 품질 비교"를 GPT(너의 모델)로 수행해줘. 코드 실행·파일 생성 없이 읽기+채점만. 토큰/비용은 측정·보고하지 마(에이전트 런타임이라 오염됨). 품질만 본다.

대상: experiments/token-efficiency/fixtures/benchmark-v2.full.json 의 쿼리 4개(bq_full_013, bq_full_019, bq_full_025, bq_full_031)와 no-match 1개(bq_full_037).

각 매칭 쿼리에 대해:
1) raw 파일(experiments/token-efficiency/fixtures/v2-full/source-bundles/<name>.md)만 근거로 userQuery에 짧게 답하고,
2) artifact 파일(experiments/token-efficiency/fixtures/v2-full/artifacts/<name>.md)만 근거로 같은 질문에 짧게 답해.
   <name>: 013=kraken-ohlc-trades, 019=fatf-travel-rule, 025=openzeppelin-uups-deploy, 031=claude-code-skills.

채점(각 답변):
- mustInclude_coverage = 담은 mustInclude 용어수 / 총개수 (대소문자 무시 부분일치)
- no_hallucination = mustNotHallucinate 용어가 하나도 없으면 1, 있으면 0
- score = coverage × no_hallucination, pass = score>=0.75
rubric 용어는 fixture의 queries[].qualityRubric 에서 읽어.
bq_full_037은 매칭 listing이 없으니 "근거 없음/거절"이 정답 — 점수 집계 제외, correctlyRefused만 기록.

출력: 아래 JSON 스키마로 회신하고 docs/evidence/benchmark-smoke-2026-06-01/quality-codex-<model>.json 에 저장.
{evaluatorAgent, model, usageNote, perQuery[{queryId,rawScore,artifactScore,rawPass,artifactPass,rawMustIncludeHit,artifactMustIncludeHit,rawHallucination,artifactHallucination}], noMatch{queryId,correctlyRefused}, summary{matchedQueries,artifactPassCount,rawPassCount,qualityRegressionVsRaw}}
주의: artifact가 raw 대비 품질을 떨어뜨리는지(=qualityRegression)에 집중. 숫자 과장 금지.
```

## 프롬프트 B — Antigravity (Gemini)에 그대로 붙여넣기

```
ProofWeave 토큰효율 벤치마크의 "답변 품질 비교"를 Gemini(너의 모델)로 수행해줘. 코드 실행·파일 생성 없이 읽기+채점만. 토큰/비용은 측정·보고하지 마(에이전트 런타임이라 오염됨). 품질만 본다.

대상: experiments/token-efficiency/fixtures/benchmark-v2.full.json 의 쿼리 4개(bq_full_013, bq_full_019, bq_full_025, bq_full_031)와 no-match 1개(bq_full_037).

각 매칭 쿼리에 대해:
1) raw 파일(experiments/token-efficiency/fixtures/v2-full/source-bundles/<name>.md)만 근거로 userQuery에 짧게 답하고,
2) artifact 파일(experiments/token-efficiency/fixtures/v2-full/artifacts/<name>.md)만 근거로 같은 질문에 짧게 답해.
   <name>: 013=kraken-ohlc-trades, 019=fatf-travel-rule, 025=openzeppelin-uups-deploy, 031=claude-code-skills.

채점(각 답변):
- mustInclude_coverage = 담은 mustInclude 용어수 / 총개수 (대소문자 무시 부분일치)
- no_hallucination = mustNotHallucinate 용어가 하나도 없으면 1, 있으면 0
- score = coverage × no_hallucination, pass = score>=0.75
rubric 용어는 fixture의 queries[].qualityRubric 에서 읽어.
bq_full_037은 매칭 listing이 없으니 "근거 없음/거절"이 정답 — 점수 집계 제외, correctlyRefused만 기록.

출력: 아래 JSON 스키마로 회신하고 docs/evidence/benchmark-smoke-2026-06-01/quality-antigravity-<model>.json 에 저장.
{evaluatorAgent, model, usageNote, perQuery[{queryId,rawScore,artifactScore,rawPass,artifactPass,rawMustIncludeHit,artifactMustIncludeHit,rawHallucination,artifactHallucination}], noMatch{queryId,correctlyRefused}, summary{matchedQueries,artifactPassCount,rawPassCount,qualityRegressionVsRaw}}
주의: artifact가 raw 대비 품질을 떨어뜨리는지(=qualityRegression)에 집중. 숫자 과장 금지.
```

---

## Codex / Antigravity 실행 "비용"

- 둘 다 **각자의 구독/포함 사용량**으로 동작한다 (Codex=ChatGPT/OpenAI 에이전트 접근, Antigravity=Google 에이전트 IDE). 한도 내라면 **추가 달러 비용 $0**.
- 단, 이들은 agent harness이므로 **여기서 나오는 토큰/비용 수치는 신뢰 불가 → 품질 결과만 사용**한다. (우리가 OpenCode 토큰을 버린 것과 동일 이유.)
- 즉 이 위임의 산출물은 "GPT/Gemini가 artifact로도 raw와 동등한 품질을 내는가"라는 **품질 판정**뿐이고, 그게 정확히 목적이다.
- 회신 JSON을 받으면 내가 Claude 결과(`quality-comparison-subscription.md`)와 합쳐 **3모델 품질 매트릭스**로 정리한다.
