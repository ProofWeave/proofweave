# Raw Source Bundle: OpenAPI Petstore Contract Normalization Dataset

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: api_spec_migration
Problem type: openapi_contract
Listing id: att_api_openapi_petstore_contract
Last refreshed for fixture: 2026-05-10T00:00:00Z

## Source URLs

- https://github.com/OAI/OpenAPI-Specification/tree/main/examples
- https://spec.openapis.org/oas/latest.html

## Extraction Notes

1. OpenAPI examples are useful for contract extraction because they contain paths, operations, schemas, examples, and security declarations.
2. Migration tasks should preserve operationId stability so generated clients do not break unnecessarily.
3. Schema normalization should keep enum values, nullable semantics, examples, and response status codes.
4. Security requirements belong in components.securitySchemes and per-operation security arrays when behavior differs.
5. Do not convert an example contract into implementation behavior that was not present in the source specification.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | api_spec_migration | OpenAPI examples are useful for contract extraction because they contain paths, operations, schemas, examples, and security declarations. | keep |
| S2 | api_spec_migration | Migration tasks should preserve operationId stability so generated clients do not break unnecessarily. | keep |
| S3 | api_spec_migration | Schema normalization should keep enum values, nullable semantics, examples, and response status codes. | keep |
| S4 | api_spec_migration | Security requirements belong in components.securitySchemes and per-operation security arrays when behavior differs. | keep |
| S5 | api_spec_migration | Do not convert an example contract into implementation behavior that was not present in the source specification. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: openapi, operationId, components.schemas, securitySchemes, examples.
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
- Use the OpenAPI example as a fixture for `paths`, `operationId`, response status codes, and `components.schemas`.
- Normalize examples without dropping enum values, nullable fields, or request/response examples.
- Preserve `securitySchemes` separately from operation-level security overrides.
- Snapshot generated client diffs after migration so changed operation names are reviewed explicitly.
- Mark absent behavior as unknown instead of inventing endpoint side effects.
