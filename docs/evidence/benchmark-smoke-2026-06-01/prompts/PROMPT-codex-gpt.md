ProofWeave 토큰효율 벤치마크의 "답변 품질 비교"를 GPT(너의 모델)로 수행해줘.
목적: 원본(raw) 컨텍스트로 답할 때와 ProofWeave 압축본(artifact) 컨텍스트로 답할 때, 답변 품질이 떨어지는지(qualityRegression) 판정한다.

== 매우 중요: 공정성 규칙 ==
- 반드시 "clean" 컨텍스트 파일을 써라. 원본(source-bundles/, artifacts/)에는 정답 용어가 본문에 박혀 있어 베끼기가 되므로 쓰지 마라. clean 버전은 그 누출을 제거한 것이다.
- 만약 clean 파일이 없으면 먼저 이걸 실행해 생성: `node experiments/token-efficiency/scripts/make-clean-contexts.mjs`
- 답변은 "그 clean 컨텍스트에 있는 내용만" 근거로. 외부지식·웹·추측 금지. 컨텍스트에 없으면 "근거 없음"이라고 해라.
- 토큰 수·비용·달러는 측정·보고하지 마라(에이전트 런타임이라 토큰이 오염됨). 품질만 본다.
- repo 루트는 research-lab/proofweave 기준.

== 대상 ==
fixtures/benchmark-v2.full.json 의 queries 중 매칭 4개(bq_full_013, bq_full_019, bq_full_025, bq_full_031)와 no-match 1개(bq_full_037).
- 각 쿼리의 userQuery 전문과 qualityRubric(mustInclude / mustNotHallucinate / passThreshold)은 fixtures/benchmark-v2.full.json 의 queries[] 에서 직접 읽어라.
- clean 컨텍스트 경로:
  - RAW:      experiments/token-efficiency/fixtures/v2-full/clean/source-bundles/<name>.md
  - ARTIFACT: experiments/token-efficiency/fixtures/v2-full/clean/artifacts/<name>.md
  - <name> 매핑: 013=kraken-ohlc-trades, 019=fatf-travel-rule, 025=openzeppelin-uups-deploy, 031=claude-code-skills

== 절차 (각 매칭 쿼리마다) ==
1) RAW 답변: clean RAW 파일만 근거로 userQuery에 답한다(3~6문장, 실무 답변처럼).
2) ARTIFACT 답변: clean ARTIFACT 파일만 근거로 같은 userQuery에 답한다.
3) 두 답변을 아래 "실질 채점"으로 평가한다.

== 실질 채점 (단순 키워드 매칭 금지) ==
각 답변에 대해 다음을 LLM 판단으로 평가:
- correctnessCoverage (0~1): mustInclude의 각 개념을 "올바르게, 의미 있게" 다뤘는가. 단어만 등장하고 틀리게 쓰면 감점. (단순 문자열 포함이 아니라 개념 사용의 정확성)
- hallucination (true/false): mustNotHallucinate의 잘못된 주장을 했거나, 컨텍스트에 없는 사실을 지어냈는가.
- answeredQuestion (0~1): 질문에 실제로 답했는가(누락/회피 아님).
- score = correctnessCoverage × (hallucination ? 0 : 1) × answeredQuestion
- pass = score >= passThreshold (보통 0.75)

bq_full_037은 매칭 listing이 없는 no-match다. clean 컨텍스트를 주지 말고, "근거 없음/답변 거절"이 정답이다. 점수 집계에서 제외하고 correctlyRefused(true/false)만 기록.

== 출력 ==
아래 JSON으로 회신하고 docs/evidence/benchmark-smoke-2026-06-01/quality-codex-<model>.json 에 저장(<model>=실제 사용 GPT 모델 id). 각 쿼리의 raw/artifact 답변 원문도 answersText에 함께 남겨라(검증용).

{
  "evaluatorAgent": "codex",
  "model": "<실제 GPT 모델 id>",
  "contextVariant": "clean (leak-removed)",
  "usageNote": "quality only; tokens/cost NOT measured (agent harness)",
  "perQuery": [
    {"queryId":"bq_full_013",
     "rawScore":0.0,"artifactScore":0.0,"rawPass":true,"artifactPass":true,
     "rawCorrectnessCoverage":0.0,"artifactCorrectnessCoverage":0.0,
     "rawHallucination":false,"artifactHallucination":false,
     "rawAnsweredQuestion":1.0,"artifactAnsweredQuestion":1.0,
     "verdict":"artifact가 raw 대비 동등/열등/우수 중 무엇이고 왜",
     "answersText":{"raw":"...","artifact":"..."}},
    {"queryId":"bq_full_019","...":"..."},
    {"queryId":"bq_full_025","...":"..."},
    {"queryId":"bq_full_031","...":"..."}
  ],
  "noMatch": {"queryId":"bq_full_037","correctlyRefused":true},
  "summary": {"matchedQueries":4,"rawPassCount":0,"artifactPassCount":0,
              "meanRawScore":0.0,"meanArtifactScore":0.0,
              "qualityRegressionVsRaw":"none|minor|significant + 한줄설명"}
}

숫자 과장 금지. 근거 없는 주장 금지. artifact가 raw 대비 품질을 떨어뜨리는지에 집중.
