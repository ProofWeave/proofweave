# Raw Source Bundle: EU TFR and EBA Travel Rule Guidelines Recipe

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: regulatory_comparison
Problem type: eu_crypto_transfer
Listing id: att_reg_eu_tfr_eba_guidelines
Last refreshed for fixture: 2026-04-30T00:00:00Z

## Source URLs

- https://www.eba.europa.eu/regulation-and-policy/single-rulebook/interactive-single-rulebook/13084
- https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/anti-money-laundering-and-countering-financing-terrorism/guidelines-information-requirements-relation-transfers-funds-and-certain-crypto-assets-transfers

## Extraction Notes

1. EU Regulation 2023/1113 extends transfer-information requirements to certain crypto-asset transfers.
2. EBA guidelines describe steps for PSPs, CASPs, and intermediaries to detect missing or incomplete information.
3. The benchmark fixture should label Article 14 and CASP obligations separately from FATF baseline language.
4. Self-hosted address verification questions are implementation-sensitive and should cite the EU source used.
5. Do not reuse the US 3,000 USD threshold as an EU crypto transfer default.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | regulatory_comparison | EU Regulation 2023/1113 extends transfer-information requirements to certain crypto-asset transfers. | keep |
| S2 | regulatory_comparison | EBA guidelines describe steps for PSPs, CASPs, and intermediaries to detect missing or incomplete information. | keep |
| S3 | regulatory_comparison | The benchmark fixture should label Article 14 and CASP obligations separately from FATF baseline language. | keep |
| S4 | regulatory_comparison | Self-hosted address verification questions are implementation-sensitive and should cite the EU source used. | keep |
| S5 | regulatory_comparison | Do not reuse the US 3,000 USD threshold as an EU crypto transfer default. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: Regulation (EU) 2023/1113, CASP, Article 14, missing information, self-hosted address.
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
- Label the EU source as `Regulation (EU) 2023/1113` plus EBA Travel Rule Guidelines.
- Track CASP and intermediary CASP duties separately from PSP duties.
- Use `Article 14` for information accompanying transfers of crypto-assets.
- Record checks for missing or incomplete information.
- Do not import the US `$3,000` threshold into EU crypto-transfer analysis.
