# Raw Source Bundle: Slither Static Analysis Triage Recipe

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: security_deployment
Problem type: static_analysis
Listing id: att_sec_slither_static_analysis
Last refreshed for fixture: 2026-04-27T00:00:00Z

## Source URLs

- https://github.com/crytic/slither
- https://github.com/crytic/slither/wiki

## Extraction Notes

1. Static analysis should be recorded as detector output plus a human triage decision.
2. False positives are common; the benchmark should reward artifacts that preserve detector id, severity, file, and rationale.
3. CI integration can export JSON or SARIF for repeatability.
4. Security deployment readiness should not depend on passing every informational detector.
5. The artifact should name the detectors that are blockers for the project's threat model.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | security_deployment | Static analysis should be recorded as detector output plus a human triage decision. | keep |
| S2 | security_deployment | False positives are common; the benchmark should reward artifacts that preserve detector id, severity, file, and rationale. | keep |
| S3 | security_deployment | CI integration can export JSON or SARIF for repeatability. | keep |
| S4 | security_deployment | Security deployment readiness should not depend on passing every informational detector. | keep |
| S5 | security_deployment | The artifact should name the detectors that are blockers for the project's threat model. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: slither, detectors, triage, false positive, SARIF.
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
- Run Slither and preserve detector id, severity, file, and line evidence.
- Export JSON or SARIF so CI can diff findings.
- Triage false positives with an explicit rationale.
- Define deployment blockers by detector severity and the project's threat model.
- Do not treat informational findings as automatic deploy blockers.
