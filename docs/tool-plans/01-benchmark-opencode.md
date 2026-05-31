# Plan 1 - Benchmark Live Testing With OpenCode

## Purpose

ProofWeave token-efficiency benchmark를 실제 모델 실행 기준으로 검증한다.

현재 `experiments/token-efficiency` 아래 offline benchmark v2 환경은 이미 준비되어 있다. 이 계획의 목적은 새 기능을 크게 구현하는 것이 아니라, OpenCode에서 모델을 하나씩 직접 선택해 같은 benchmark를 3회 실행하고 다음을 확인하는 것이다.

- raw workflow와 ProofWeave workflow의 모델별 token usage 차이
- OpenCode가 보여주는 token usage가 benchmark 지표로 쓸 수 있는 값인지 여부
- provider API usage metadata 없이 가능한 측정과 불가능한 측정의 경계
- landing/UI/문서에 사용할 수 있는 숫자와 사용하면 안 되는 숫자

Do not run this through OpenCode subagents. Subagent/team execution can add hidden orchestration tokens and makes model-level usage harder to attribute. Run three direct OpenCode sessions instead.

## Owner

Primary: OpenCode

Review: Claude ultracode

Final validation: Codex

## Critical Point

OpenCode의 token usage를 그대로 ProofWeave benchmark 숫자로 쓰면 안 된다.

반드시 아래를 구분한다.

| Measurement | Meaning | Can be used as benchmark metric |
|---|---|---|
| OpenCode session total tokens | OpenCode agent가 전체 작업 중 쓴 토큰 | No |
| OpenCode per-model request usage | 특정 모델 호출별 입력/출력 토큰 | Conditional |
| Provider API usage metadata | 실제 provider 응답의 input/output usage | Best |
| Provider count API | generation 없이 모델 tokenizer 기준 count | Good for token-count validation |
| Offline CTT/o200k count | local canonical proxy | Useful for paired comparison, not billing claim |

OpenCode가 API를 직접 쓰지 않고 자체 token meter만 보여주는 경우, 그 값은 정확한 billing token이 아니다. 이 경우 결과에는 `opencode_observed_proxy` 또는 `agent_usage_proxy`처럼 명확히 라벨링한다.

## Required Model Set

Use these benchmark model labels.

| Run | Benchmark label | Target family | Notes |
|---|---|---|---|
| 1 | `claude-opus-4.8` | Claude | Replace all old `claude-opus-4.7` references. Record actual OpenCode/provider model id, for example `anthropic/claude-opus-4-8`. |
| 2 | `gpt-5.5-fast-high` | OpenAI GPT | Select GPT-5.5 Fast with `high` mode/variant in OpenCode. Record the exact selected model id and mode, for example `openai/gpt-5.5-fast` plus `high`. |
| 3 | `gemini-3.5-flash` | Gemini | Record actual selected Gemini model id. |

The benchmark must not mix these runs into one OpenCode team/subagent job. Each run gets its own prompt and output directory.

## OpenCode Agent Profile Decision

There are two different choices that must be recorded separately:

1. LLM/model choice: Claude, GPT, or Gemini.
2. OpenCode agent profile choice: profiles such as `atlas`, `sisyphus`, `prometheus`, `hephaestus`, etc.

The user can select the target LLM independently of the OpenCode agent profile. Because of that, keep the agent profile fixed across all three runs so the profile does not become another benchmark variable.

Preferred fixed profile:

```text
atlas
```

Reason:

- the benchmark plan is already written, so the agent should execute a known plan rather than create a new one
- `atlas` is the closest fit for plan execution among the shown choices
- using one fixed profile across Claude/GPT/Gemini keeps the benchmark closer to a model comparison

Important caveat:

- Keep each run as one direct OpenCode session. Do not enable Team Mode, subagents, or `task()` fan-out for the benchmark run.
- If `atlas` forces subagent/task orchestration and cannot stay as a direct single-session executor, stop and rerun with `sisyphus` as the fallback direct worker profile.
- Always record the chosen agent profile and whether any task/subagent orchestration was used. If orchestration was used, do not treat OpenCode session total tokens as benchmark tokens.

Current local config observation:

| Profile | Observed route in local config | Recommended use for this benchmark |
|---|---|---|
| `atlas` | `openai/gpt-5.5-fast`, variant `xhigh` in local config, but model can be overridden manually | Preferred fixed plan-executor profile, as long as the run stays direct and does not spawn subagents |
| `sisyphus` | `openai/gpt-5.5-fast`, variant `xhigh` | Fallback direct worker if `atlas` forces task/subagent orchestration |
| `prometheus` | `anthropic/claude-opus-4-8`, variant `max` | Avoid for execution; use for planning/review only |
| `hephaestus` | `anthropic/claude-opus-4-8`, variant `max` | Avoid for benchmark execution; more deep-agent/reviewer-biased |
| `momus` | `anthropic/claude-opus-4-8`, variant `high` | Avoid unless the goal is critique |
| `multimodal-looker` | `anthropic/claude-opus-4-8`, variant `fast` | Avoid for text benchmark unless visual inspection is needed |

For GPT and Gemini, OpenCode must explicitly record the chosen model/profile. If OpenCode cannot directly select the requested target model, stop and report that the run would be a proxy rather than a direct benchmark.

## Files To Read First

- `experiments/token-efficiency/package.json`
- `experiments/token-efficiency/README.md`
- `experiments/token-efficiency/fixtures/benchmark-v2.full.json`
- `experiments/token-efficiency/scripts/run-benchmark-v2.ts`
- `experiments/token-efficiency/scripts/run-retrieval-benchmark.ts`
- `experiments/token-efficiency/docs/live-model-cost-token-plan.md`
- `experiments/token-efficiency/docs/benchmark-reference.md`

## Current Benchmark Inventory

OpenCode는 먼저 현재 fixture와 script 상태를 요약한다.

Required inventory:

- query count
- listing count
- domain count
- no-match query count
- model labels
- available commands
- offline-only metric list
- live/provider usage를 위해 부족한 부분

Expected current direction:

- offline v2는 token context proxy와 retrieval quality를 분리한다.
- 현재 model label은 benchmark label일 수 있고 실제 provider model id가 아닐 수 있다.
- provider billing claim은 provider usage metadata 또는 count API 없이 확정하면 안 된다.

## Test Design

각 모델은 같은 query set에 대해 두 경로를 수행한다.

```text
Raw workflow:
user query
+ raw source bundle
-> model answer
-> input tokens, output tokens, latency, quality recorded

ProofWeave workflow:
user query
+ selected artifact or top-k artifact
-> model answer
-> input tokens, output tokens, latency, quality recorded
```

## Direct Run Matrix

Run exactly one direct OpenCode job for each row.

| Run | Benchmark label | Required LLM selection | Preferred agent profile | Output directory |
|---|---|---|---|---|
| Claude | `claude-opus-4.8` | Claude Opus 4.8 | `atlas`, fallback `sisyphus` only if direct execution is blocked | `/tmp/proofweave-live-benchmark-claude-opus-4.8/` |
| GPT | `gpt-5.5-fast-high` | GPT-5.5 Fast with `high` mode/variant | `atlas`, fallback `sisyphus` only if direct execution is blocked | `/tmp/proofweave-live-benchmark-gpt-5.5-fast-high/` |
| Gemini | `gemini-3.5-flash` | Gemini 3.5 Flash | `atlas`, fallback `sisyphus` only if direct execution is blocked | `/tmp/proofweave-live-benchmark-gemini/` |

모델 이름은 반드시 두 개로 나눠 기록한다.

```json
{
  "benchmarkModelLabel": "gpt-5.5-fast-high",
  "actualProviderModelId": "openai/gpt-5.5-fast",
  "actualModeOrVariant": "high",
  "opencodeAgentProfile": "atlas",
  "usedTeamModeOrSubagents": false,
  "usageSource": "provider_usage_metadata | provider_count_api | opencode_request_usage | opencode_session_usage | offline_ctt"
}
```

## Smoke Run

Full run 전에 smoke run을 먼저 한다.

Smoke scope:

- 5 queries
- at least 3 domains
- at least 1 no-match query
- run the same 5-query smoke separately for Claude, GPT, and Gemini
- explicit max cost or usage cap
- output directory outside repo, under `/tmp`

Required smoke output paths:

```text
/tmp/proofweave-live-benchmark-claude-opus-4.8/smoke/
/tmp/proofweave-live-benchmark-gpt-5.5-fast-high/smoke/
/tmp/proofweave-live-benchmark-gemini/smoke/
```

Smoke pass criteria:

- raw/proofweave paired results are saved
- model usage is separated by model and workflow
- OpenCode agent profile is recorded
- failed queries are retained, not dropped
- no-match query is not counted as token-saving success
- quality fail is not counted as successful saving
- OpenCode token usage source is clearly labeled

## Full Run

Run full benchmark only after smoke passes.

Full scope:

- all queries from `benchmark-v2.full.json`
- all domains
- all no-match queries
- three separate direct runs: Claude, GPT, Gemini
- raw/proofweave paired output per query
- token, cost, latency, quality summary

Required full output paths:

```text
/tmp/proofweave-live-benchmark-claude-opus-4.8/full/
/tmp/proofweave-live-benchmark-gpt-5.5-fast-high/full/
/tmp/proofweave-live-benchmark-gemini/full/
```

Expected artifacts:

```text
live-results.jsonl
live-summary.json
live-summary.md
model-summary.csv
domain-summary.csv
quality-failures.jsonl
no-match-analysis.md
usage-source-audit.md
```

## Metrics

Minimum metrics:

- input tokens raw
- input tokens proofweave
- output tokens raw
- output tokens proofweave
- total tokens raw
- total tokens proofweave
- latency raw
- latency proofweave
- quality pass/fail
- quality coverage
- no-match expected/predicted
- data price
- estimated raw cost
- estimated proofweave cost
- net saving

Reduction formulas:

```text
InputTokenReduction = 1 - input_tokens_proofweave / input_tokens_raw
TotalTokenReduction = 1 - total_tokens_proofweave / total_tokens_raw

RawCost = raw_input_tokens * input_rate
        + raw_output_tokens * output_rate

ProofWeaveCost = pw_input_tokens * input_rate
               + pw_output_tokens * output_rate
               + data_price

NetSaving = RawCost - ProofWeaveCost
```

Quality-adjusted saving:

```text
QualityAdjustedSaving = NetSaving if quality_pass == true
QualityAdjustedSaving = 0 if quality_pass == false
```

No-match handling:

- no-match queries are retrieval/product-quality tests
- do not count no-match token reduction as successful saving
- report no-match precision and recall separately

## Validation Gate

Before using any number in UI or docs, validate:

- Is usage provider metadata, count API, OpenCode request usage, OpenCode session usage, or offline CTT?
- Is raw/proofweave comparison paired on the same query and model?
- Are agent overhead tokens excluded?
- Are failed queries included?
- Are no-match cases excluded from saving success?
- Are quality failures zeroed or separately reported?
- Is data price included for net cost saving?

## Allowed UI Claims

Only after validation:

| Evidence level | Allowed placement | Example |
|---|---|---|
| Provider usage metadata | Landing, Analytics, deck | `Live paired benchmark showed median X% input-token reduction` |
| Provider count API | Analytics, technical docs | `Provider tokenizer count showed X% context reduction` |
| OpenCode request usage | Internal Analytics, caveated UI | `Observed model-run token proxy` |
| OpenCode session usage | Internal only | `OpenCode session usage, not benchmark token usage` |
| Offline CTT | Analytics detail, docs | `Offline canonical token proxy` |

Forbidden claims unless directly proven:

- `90% guaranteed saving`
- `100% cost reduction`
- `1.24M datasets`
- `100% verifiable`
- provider billing savings based only on OpenCode session token totals

## Prompt For OpenCode

Use the three separate prompts below. Do not combine them into one team/subagent job.

### Prompt 1 - Claude Opus 4.8

```text
cwd: /Users/heosehyeon/Projects/research-lab/proofweave

docs/tool-plans/01-benchmark-opencode.md 를 먼저 읽고 Claude run만 수행해줘.

중요:
- experiments/token-efficiency에 offline benchmark v2 환경이 이미 있다.
- 이 실행은 Claude 전용이다.
- benchmark label은 claude-opus-4.8 이다.
- OpenCode에서 Claude Opus 4.8을 직접 선택해라. 실제 selected model id를 기록해라.
- agent profile은 atlas로 고정해라.
- Team Mode, subagent, task fan-out은 사용하지 말고 direct session으로만 실행해라.
- atlas가 task/subagent orchestration을 강제하면 중단하고 sisyphus direct worker로 재실행한 뒤 그 사실을 기록해라.
- OpenCode가 제공하는 token usage가 benchmark prompt usage인지, agent session total usage인지 반드시 구분해라.
- provider API usage metadata 또는 request usage가 없으면 그 한계를 명확히 표시해라.
- API를 직접 쓰지 않는 이상 billing token은 정확하지 않다. 이 경우 proxy로만 표기해라.

작업:
1. 현재 benchmark fixture와 script 구조를 읽고 요약
2. Claude Opus 4.8으로 5-query smoke run 실행
3. smoke가 통과하면 Claude Opus 4.8 full run 실행 가능 여부 판단
4. raw/proofweave paired output 저장
5. token usage, output usage, latency, quality pass/fail 기록
6. OpenCode agent profile과 selected model id 기록
7. 결과를 /tmp/proofweave-live-benchmark-claude-opus-4.8/ 아래 저장

주의:
- OpenCode agent overhead를 benchmark token saving으로 계산하지 말 것
- no-match query를 token saving에 섞지 말 것
- quality fail을 saving success로 계산하지 말 것
- claude-opus-4.7을 사용하지 말 것
- benchmark label, selected model id, OpenCode agent profile을 분리할 것
```

### Prompt 2 - GPT-5.5 Fast High

```text
cwd: /Users/heosehyeon/Projects/research-lab/proofweave

docs/tool-plans/01-benchmark-opencode.md 를 먼저 읽고 GPT run만 수행해줘.

중요:
- 이 실행은 GPT-5.5 Fast(high) 전용이다.
- benchmark label은 gpt-5.5-fast-high 이다.
- OpenCode에서 GPT-5.5 Fast를 직접 선택하고 mode/variant는 high로 선택해라.
- 실제 selected model id와 mode/variant를 기록해라. 예: openai/gpt-5.5-fast + high.
- agent profile은 atlas로 고정해라.
- Team Mode, subagent, task fan-out은 사용하지 말고 direct session으로만 실행해라.
- atlas가 task/subagent orchestration을 강제하면 중단하고 sisyphus direct worker로 재실행한 뒤 그 사실을 기록해라.
- GPT-5.5 Fast(high)를 직접 선택할 수 없으면 다른 GPT 계열 모델로 대체하지 말고 proxy run이라고 명확히 보고해라.

작업:
1. Claude run과 같은 5-query smoke set을 사용한다
2. GPT-5.5 Fast(high)로 raw/proofweave paired output을 생성한다
3. token usage, output usage, latency, quality pass/fail을 기록한다
4. OpenCode token usage가 request-level인지 session-level인지 구분한다
5. smoke가 통과하면 full run 가능 여부를 판단한다
6. 결과를 /tmp/proofweave-live-benchmark-gpt-5.5-fast-high/ 아래 저장한다

주의:
- OpenCode agent overhead를 benchmark token saving으로 계산하지 말 것
- no-match query를 token saving에 섞지 말 것
- quality fail을 saving success로 계산하지 말 것
- benchmark label, selected model id, OpenCode agent profile을 분리할 것
```

### Prompt 3 - Gemini

```text
cwd: /Users/heosehyeon/Projects/research-lab/proofweave

docs/tool-plans/01-benchmark-opencode.md 를 먼저 읽고 Gemini run만 수행해줘.

중요:
- 이 실행은 Gemini 전용이다.
- benchmark label은 gemini-3.5-flash 이다.
- OpenCode에서 Gemini 모델을 직접 선택해라. 실제 selected model id를 기록해라.
- agent profile은 atlas로 고정해라.
- Team Mode, subagent, task fan-out은 사용하지 말고 direct session으로만 실행해라.
- atlas가 task/subagent orchestration을 강제하면 중단하고 sisyphus direct worker로 재실행한 뒤 그 사실을 기록해라.
- Gemini direct model/profile을 선택할 수 없으면 다른 모델로 대체하지 말고 proxy run이라고 명확히 보고해라.

작업:
1. Claude/GPT run과 같은 5-query smoke set을 사용한다
2. Gemini로 raw/proofweave paired output을 생성한다
3. token usage, output usage, latency, quality pass/fail을 기록한다
4. OpenCode token usage가 request-level인지 session-level인지 구분한다
5. smoke가 통과하면 full run 가능 여부를 판단한다
6. 결과를 /tmp/proofweave-live-benchmark-gemini/ 아래 저장한다

주의:
- OpenCode agent overhead를 benchmark token saving으로 계산하지 말 것
- no-match query를 token saving에 섞지 말 것
- quality fail을 saving success로 계산하지 말 것
- benchmark label, selected model id, OpenCode agent profile을 분리할 것
```

## Prompt For Claude ultracode Review

```text
ProofWeave benchmark live testing 설계를 냉정하게 리뷰해줘.

전제:
- OpenCode가 여러 모델을 직접 호출하면서 token usage를 볼 수 있다.
- 하지만 OpenCode usage가 provider billing usage인지 agent session usage인지 불명확할 수 있다.
- 목표는 landing/UI에 넣어도 과장되지 않는 token/cost saving claim을 만드는 것이다.

검토:
1. OpenCode token usage를 benchmark metric으로 써도 되는 조건
2. provider API 없이 가능한 측정과 불가능한 측정
3. raw vs ProofWeave workflow 비교가 공정한지
4. no-match, quality fail, retry, latency 처리 방식
5. landing에 허용 가능한 표현과 금지해야 할 표현
6. 추가로 필요한 evidence
```

## Done Criteria

- smoke run result exists
- full run feasibility is clear
- usage source audit exists
- token usage is separated by model and workflow
- OpenCode token usage reliability is explicitly classified
- allowed UI claim list exists
- forbidden claim list exists
- final output paths are recorded
