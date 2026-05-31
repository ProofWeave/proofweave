# Raw Source Bundle: FinCEN Funds Travel Rule Q&A Extract

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: regulatory_comparison
Problem type: us_travel_rule
Listing id: att_reg_fincen_funds_travel_rule
Last refreshed for fixture: 2026-05-01T00:00:00Z

## Source URLs

- https://www.fincen.gov/resources/statutes-regulations/guidance/funds-travel-regulations-questions-answers

## Extraction Notes

1. FinCEN Q&A material describes funds travel regulations for covered financial institutions.
2. The classic US funds travel rule threshold is equal to or greater than 3,000 USD or foreign equivalent.
3. The Q&A is not a complete crypto-specific operating manual and must be paired with virtual currency guidance where relevant.
4. A benchmark artifact should preserve threshold, scope, and recordkeeping/transmittal distinction.
5. Do not turn the Q&A into a blanket statement about all wallets or all crypto transfers.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | regulatory_comparison | FinCEN Q&A material describes funds travel regulations for covered financial institutions. | keep |
| S2 | regulatory_comparison | The classic US funds travel rule threshold is equal to or greater than 3,000 USD or foreign equivalent. | keep |
| S3 | regulatory_comparison | The Q&A is not a complete crypto-specific operating manual and must be paired with virtual currency guidance where relevant. | keep |
| S4 | regulatory_comparison | A benchmark artifact should preserve threshold, scope, and recordkeeping/transmittal distinction. | keep |
| S5 | regulatory_comparison | Do not turn the Q&A into a blanket statement about all wallets or all crypto transfers. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: FinCEN, Funds Travel Rule, $3,000, transmittal, recordkeeping.
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
- Record the FinCEN Funds Travel Rule threshold as equal to or greater than `$3,000` or foreign equivalent.
- Preserve the distinction between recordkeeping and transmittal obligations.
- Label the source as FinCEN Q&A guidance for funds transfers.
- Add a caveat that crypto-specific applicability needs additional virtual currency guidance.
- Avoid claiming a blanket exemption for self-hosted wallets from this source alone.
