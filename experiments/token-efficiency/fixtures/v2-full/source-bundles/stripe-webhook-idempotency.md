# Raw Source Bundle: Webhook Idempotency Migration Recipe

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: api_spec_migration
Problem type: webhook_migration
Listing id: att_api_stripe_webhook_idempotency
Last refreshed for fixture: 2026-05-09T00:00:00Z

## Source URLs

- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/webhooks

## Extraction Notes

1. Payment APIs often require idempotency for client-created resources and separate replay protection for webhook delivery.
2. Webhook handlers must verify signatures before mutating local state.
3. Event id deduplication should happen after signature verification and before side effects.
4. Retries can deliver events out of order, so workflows should store event timestamps and resource state versions.
5. A migration artifact should distinguish request idempotency from webhook event dedupe.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | api_spec_migration | Payment APIs often require idempotency for client-created resources and separate replay protection for webhook delivery. | keep |
| S2 | api_spec_migration | Webhook handlers must verify signatures before mutating local state. | keep |
| S3 | api_spec_migration | Event id deduplication should happen after signature verification and before side effects. | keep |
| S4 | api_spec_migration | Retries can deliver events out of order, so workflows should store event timestamps and resource state versions. | keep |
| S5 | api_spec_migration | A migration artifact should distinguish request idempotency from webhook event dedupe. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: idempotency key, webhook signature, event id, retry, dedupe.
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
- Use an `Idempotency-Key` for client-created payment requests and store the request fingerprint.
- Verify the webhook signature before accepting an event into the local queue.
- Deduplicate webhook work by `event.id` and keep a processed-event table with timestamps.
- Design handlers to tolerate retry and out-of-order delivery.
- Do not treat webhook signature verification as a replacement for idempotent mutation logic.
