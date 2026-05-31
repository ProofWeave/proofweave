# Raw Source Bundle: FATF Travel Rule Baseline Comparison

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: regulatory_comparison
Problem type: travel_rule
Listing id: att_reg_fatf_travel_rule
Last refreshed for fixture: 2026-05-02T00:00:00Z

## Source URLs

- https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html
- https://www.fatf-gafi.org/content/dam/fatf-gafi/guidance/Updated-Guidance-VA-VASP.pdf.coredownload.inline.pdf

## Extraction Notes

1. FATF Recommendation 16 is the baseline source for originator and beneficiary information transfer expectations.
2. Virtual asset service providers should obtain, hold, and transmit required information where applicable.
3. Jurisdictional implementation differs, so country-specific thresholds must not be inferred solely from FATF text.
4. The artifact should separate FATF baseline from local legal implementation.
5. Self-hosted wallet obligations require local-law confirmation before operational use.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | regulatory_comparison | FATF Recommendation 16 is the baseline source for originator and beneficiary information transfer expectations. | keep |
| S2 | regulatory_comparison | Virtual asset service providers should obtain, hold, and transmit required information where applicable. | keep |
| S3 | regulatory_comparison | Jurisdictional implementation differs, so country-specific thresholds must not be inferred solely from FATF text. | keep |
| S4 | regulatory_comparison | The artifact should separate FATF baseline from local legal implementation. | keep |
| S5 | regulatory_comparison | Self-hosted wallet obligations require local-law confirmation before operational use. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: Recommendation 16, originator information, beneficiary information, VASP, virtual assets.
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
- Use FATF Recommendation 16 as the baseline, not as a substitute for local law.
- Track required originator information and beneficiary information separately.
- Identify whether the counterparty is a VASP, other obliged entity, or self-hosted wallet.
- Mark jurisdiction-specific thresholds as local implementation fields.
- Flag self-hosted wallet treatment as requiring local-law verification.
