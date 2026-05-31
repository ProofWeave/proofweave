# Raw Source Bundle: Foundry Security Smoke Test Skill

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: security_deployment
Problem type: predeploy_security
Listing id: att_sec_foundry_security_smoke
Last refreshed for fixture: 2026-04-28T00:00:00Z

## Source URLs

- https://book.getfoundry.sh/forge/tests
- https://book.getfoundry.sh/forge/fuzz-testing
- https://book.getfoundry.sh/forge/invariant-testing

## Extraction Notes

1. Foundry predeploy checks can combine deterministic unit tests, fuzz tests, invariant tests, fork tests, and gas snapshots.
2. The smoke phase should be fast enough for every deploy candidate but broad enough to catch auth and accounting regressions.
3. Fork tests should pin chain id, block number, RPC source, and external addresses.
4. A gas snapshot is useful for unexpected cost changes but is not a security proof.
5. The artifact should include command lines and evidence files instead of vague assurances.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | security_deployment | Foundry predeploy checks can combine deterministic unit tests, fuzz tests, invariant tests, fork tests, and gas snapshots. | keep |
| S2 | security_deployment | The smoke phase should be fast enough for every deploy candidate but broad enough to catch auth and accounting regressions. | keep |
| S3 | security_deployment | Fork tests should pin chain id, block number, RPC source, and external addresses. | keep |
| S4 | security_deployment | A gas snapshot is useful for unexpected cost changes but is not a security proof. | keep |
| S5 | security_deployment | The artifact should include command lines and evidence files instead of vague assurances. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: forge test, fuzz, invariant, fork, gas snapshot.
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
- Run `forge test` for deterministic unit coverage.
- Run targeted fuzz tests for boundary inputs and accounting transitions.
- Run invariant tests for balances, roles, and supply constraints.
- Pin fork tests by chain id and block number.
- Record `forge snapshot` separately from security pass/fail.
