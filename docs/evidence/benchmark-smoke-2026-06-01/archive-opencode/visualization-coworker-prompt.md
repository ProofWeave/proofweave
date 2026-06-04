# Visualization Coworker Prompt

cwd: /Users/heosehyeon/Projects/research-lab/proofweave

ProofWeave smoke benchmark 결과를 내부 공유용 시각 자료로 정리해줘.

중요:

- 새 모델 호출, OpenCode run, benchmark 재실행 금지.
- 수치 재계산 금지.
- 아래 source of truth 파일만 사용:
  - `docs/evidence/benchmark-smoke-2026-06-01/chart-data.json`
  - `docs/evidence/benchmark-smoke-2026-06-01/chart-data.csv`
  - `docs/evidence/benchmark-smoke-2026-06-01/observed-usage-report.md`
- provider billing claim으로 표현하지 말 것.
- 모든 수치는 `OpenCode observed/proxy usage` 또는 `offline_ctt proxy`로 라벨링할 것.
- Claude/GPT/Gemini의 직접 3-model comparison처럼 보이게 만들지 말 것. Claude는 query set과 usage source가 다르다.

만들 산출물:

```text
docs/evidence/benchmark-smoke-2026-06-01/visual/benchmark-smoke-dashboard.html
docs/evidence/benchmark-smoke-2026-06-01/visual/benchmark-smoke-brief.md
```

필수 시각화:

1. Model status matrix
   - Claude: complete, `offline_ctt`
   - GPT: complete, `opencode_request_usage`
   - Gemini: log-derived, `opencode_request_usage`

2. Input reduction vs total reduction
   - Claude는 separate/proxy 색상
   - GPT/Gemini는 OpenCode observed usage 색상
   - input reduction과 total reduction 차이를 명확히 보여줄 것

3. Observed usage totals
   - raw input vs ProofWeave input
   - raw total vs ProofWeave total
   - Gemini는 observed cost도 표시

4. Evidence quality ladder
   - provider billing metadata: not available
   - provider count API: not available
   - OpenCode request usage: GPT/Gemini
   - offline CTT: Claude

5. Query set mismatch
   - Claude set과 GPT/Gemini set이 다르다는 점 표시
   - "not apples-to-apples" 문구 포함

문구 가이드:

사용 가능:

```text
OpenCode observed smoke usage shows input-context reduction in GPT/Gemini runs, while total-token impact is heavily affected by agent/runtime overhead.
```

```text
Claude smoke shows strong offline CTT proxy reduction, but it is not Anthropic billing usage.
```

금지:

```text
ProofWeave reduces provider billing cost by X%.
```

```text
All three models verified the same saving.
```

```text
Full benchmark confirmed marketplace cost savings.
```
