# Raw Source Bundle: Browser-to-API Agent Workflow Skill

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: agent_workflow
Problem type: api_discovery
Listing id: att_agent_browser_to_api_workflow
Last refreshed for fixture: 2026-04-24T00:00:00Z

## Source URLs

- https://playwright.dev/docs/network
- https://spec.openapis.org/oas/latest.html

## Extraction Notes

1. Browser-observed API reconstruction should capture method, URL pattern, status code, request body schema, and response body shape.
2. Sensitive values must be redacted before generating an OpenAPI document.
3. Coverage reports should list observed endpoints and unobserved assumptions.
4. The workflow is useful for agent handoff because it turns UI traffic into a concrete API artifact.
5. Do not claim full API coverage from one browser journey.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | agent_workflow | Browser-observed API reconstruction should capture method, URL pattern, status code, request body schema, and response body shape. | keep |
| S2 | agent_workflow | Sensitive values must be redacted before generating an OpenAPI document. | keep |
| S3 | agent_workflow | Coverage reports should list observed endpoints and unobserved assumptions. | keep |
| S4 | agent_workflow | The workflow is useful for agent handoff because it turns UI traffic into a concrete API artifact. | keep |
| S5 | agent_workflow | Do not claim full API coverage from one browser journey. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: browser trace, network requests, OpenAPI, redaction, coverage report.
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
- Capture browser network requests with method, URL pattern, status code, request body, and response shape.
- Redact tokens, cookies, emails, and personal identifiers before writing artifacts.
- Generate a best-effort OpenAPI document plus a coverage report.
- Mark unobserved endpoints and inferred schemas explicitly.
- Do not claim complete API coverage from a single trace.
