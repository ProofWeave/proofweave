# Webhook Idempotency Migration Recipe

Listing id: att_api_stripe_webhook_idempotency
Domain: api_spec_migration
Kind: workflow_recipe

## Use When

Use this artifact when the query asks for webhook_migration in the api_spec_migration
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Use an `Idempotency-Key` for client-created payment requests and store the request fingerprint.
- Verify the webhook signature before accepting an event into the local queue.
- Deduplicate webhook work by `event.id` and keep a processed-event table with timestamps.
- Design handlers to tolerate retry and out-of-order delivery.
- Do not treat webhook signature verification as a replacement for idempotent mutation logic.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
