# Raw Source Bundle: OpenAI Evals Quality Rubric Dataset

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: agent_workflow
Problem type: eval_design
Listing id: att_agent_openai_evals_quality
Last refreshed for fixture: 2026-04-25T00:00:00Z

## Source URLs

- https://platform.openai.com/docs/guides/evals
- https://platform.openai.com/docs/guides/evals-design

## Extraction Notes

1. Quality evaluation should define the task, input data, expected behavior, and scoring rubric before model runs.
2. LLM-as-judge can help but should be paired with deterministic checks for required facts.
3. A benchmark output should preserve per-query rubric coverage and aggregate pass rates by domain.
4. Human review samples are needed for high-stakes claims or ambiguous rubric failures.
5. Do not let token savings hide a drop in quality pass rate.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | agent_workflow | Quality evaluation should define the task, input data, expected behavior, and scoring rubric before model runs. | keep |
| S2 | agent_workflow | LLM-as-judge can help but should be paired with deterministic checks for required facts. | keep |
| S3 | agent_workflow | A benchmark output should preserve per-query rubric coverage and aggregate pass rates by domain. | keep |
| S4 | agent_workflow | Human review samples are needed for high-stakes claims or ambiguous rubric failures. | keep |
| S5 | agent_workflow | Do not let token savings hide a drop in quality pass rate. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: evals, rubric, grader, dataset, quality score.
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
- Define eval input, expected behavior, and scoring rubric before running models.
- Use deterministic `mustInclude` checks alongside any LLM judge.
- Report per-query quality score and domain-level pass rate.
- Sample failures for human review when rubric interpretation is ambiguous.
- Keep quality-adjusted saving separate from raw token reduction.
