# OpenAI Responses API Migration Skill

Listing id: att_api_openai_responses_migration
Domain: api_spec_migration
Kind: skill

## Use When

Use this artifact when the query asks for migration in the api_spec_migration
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Map legacy `/v1/chat/completions` calls to `/v1/responses` with an `input` array.
- Replace `max_tokens` or chat-only caps with `max_output_tokens` in the Responses request.
- Stream text by handling `response.output_text.delta` and final response completion events.
- Return tool results through `function_call_output` items tied to the original tool call id.
- Persist `response.id` and use follow-up inputs or `previous_response_id` only when state carryover is intended.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
