# Raw Source Bundle: OpenAI Responses API Migration Skill

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: api_spec_migration
Problem type: migration
Listing id: att_api_openai_responses_migration
Last refreshed for fixture: 2026-05-11T00:00:00Z

## Source URLs

- https://platform.openai.com/docs/api-reference/responses/create
- https://platform.openai.com/docs/advanced-usage
- https://platform.openai.com/docs/pricing

## Extraction Notes

1. Responses API request bodies use a structured input array rather than a single legacy chat messages envelope.
2. Migration requires mapping chat role/content records, tool definitions, tool call outputs, and streaming event handlers.
3. The output text helper is convenient, but production clients should still persist raw response ids and item ids.
4. Reasoning-capable models may bill invisible reasoning tokens as output tokens, so usage must be read from the response.
5. Count-only estimates can be generated before a paid response when the provider exposes an input-token endpoint.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | api_spec_migration | Responses API request bodies use a structured input array rather than a single legacy chat messages envelope. | keep |
| S2 | api_spec_migration | Migration requires mapping chat role/content records, tool definitions, tool call outputs, and streaming event handlers. | keep |
| S3 | api_spec_migration | The output text helper is convenient, but production clients should still persist raw response ids and item ids. | keep |
| S4 | api_spec_migration | Reasoning-capable models may bill invisible reasoning tokens as output tokens, so usage must be read from the response. | keep |
| S5 | api_spec_migration | Count-only estimates can be generated before a paid response when the provider exposes an input-token endpoint. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: responses api, /v1/responses, response.output_text.delta, function_call_output, max_output_tokens.
It should also preserve domain-specific caveats and avoid converting source notes
into unsupported claims. The raw bundle includes repeated context so the benchmark
has enough input size to expose whether source-bundle workflows become expensive
relative to curated artifacts.

Operational checklist:
- Confirm source URL still resolves before paid live runs.
- Confirm exact provider model id before paid live runs.
- Confirm raw context and artifact context are both fed through the same prompt wrapper.
- Confirm no-match queries are excluded from token-saving success calculations.
- Confirm quality score is reported next to token reduction, not hidden in notes.

Negative control reminders:
- Do not answer with a different domain just because a keyword overlaps.
- Do not treat source-note summaries as legal, financial, or security advice.
- Do not invent source fields that are absent from the source bundle.
- Do not claim provider billing savings from local tokenizer counts alone.

## Artifact Compression Target

The artifact should keep the following reusable facts:
- Map legacy `/v1/chat/completions` calls to `/v1/responses` with an `input` array.
- Replace `max_tokens` or chat-only caps with `max_output_tokens` in the Responses request.
- Stream text by handling `response.output_text.delta` and final response completion events.
- Return tool results through `function_call_output` items tied to the original tool call id.
- Persist `response.id` and use follow-up inputs or `previous_response_id` only when state carryover is intended.
