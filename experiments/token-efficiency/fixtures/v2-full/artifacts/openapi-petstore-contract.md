# OpenAPI Petstore Contract Normalization Dataset

Listing id: att_api_openapi_petstore_contract
Domain: api_spec_migration
Kind: curated_dataset

## Use When

Use this artifact when the query asks for openapi_contract in the api_spec_migration
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Use the OpenAPI example as a fixture for `paths`, `operationId`, response status codes, and `components.schemas`.
- Normalize examples without dropping enum values, nullable fields, or request/response examples.
- Preserve `securitySchemes` separately from operation-level security overrides.
- Snapshot generated client diffs after migration so changed operation names are reviewed explicitly.
- Mark absent behavior as unknown instead of inventing endpoint side effects.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
