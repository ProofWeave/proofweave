# SKILL: Migrate to OpenAI GPT-5 Responses API

Use this skill when migrating code from `POST /v1/chat/completions` to
`POST /v1/responses`. Source evidence: see linked raw bundle.

## Endpoint

- New: `POST /v1/responses`
- Models: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-reasoning`.
- `temperature` is clamped to `[0, 1]` on reasoning models.
- `reasoning.effort` applies only to reasoning models.

## Renames

- `messages` to `input`
- `max_tokens` to `max_output_tokens`
- `functions` to `tools[{type:"function"}]`
- `function_call` to `tool_choice`
- `n` removed; loop or use `parallel_tool_calls`

## Tool calls

Tool replies must be `function_call_output` items with `call_id`. The
`role: "tool"` pattern returns HTTP 410 after 2026-09-01.

## MCP

`tools[{type:"mcp", server_url}]`. Auth flows: bearer, OAuth 2.1 PKCE, or
DPoP. DPoP `htu` must match `server_url`, proofs expire after 60 seconds, and
replay returns HTTP 401 `dpop_replay`.

## Streaming

SSE event types you must handle:

- `response.output_text.delta`
- `response.function_call.delta`
- `response.completed`
- `response.error`

## Cutover dates

- 2026-06-01: `functions` / `function_call` rejected.
- 2026-09-01: legacy tool messages rejected.
- 2026-12-01: chat completions read-only.
