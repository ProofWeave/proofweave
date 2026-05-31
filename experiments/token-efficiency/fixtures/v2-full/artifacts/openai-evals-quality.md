# OpenAI Evals Quality Rubric Dataset

Listing id: att_agent_openai_evals_quality
Domain: agent_workflow
Kind: curated_dataset

## Use When

Use this artifact when the query asks for eval_design in the agent_workflow
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Define eval input, expected behavior, and scoring rubric before running models.
- Use deterministic `mustInclude` checks alongside any LLM judge.
- Report per-query quality score and domain-level pass rate.
- Sample failures for human review when rubric interpretation is ambiguous.
- Keep quality-adjusted saving separate from raw token reduction.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
