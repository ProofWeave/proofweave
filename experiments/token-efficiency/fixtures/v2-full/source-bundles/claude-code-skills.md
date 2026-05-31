# Raw Source Bundle: Claude Code Skill Authoring Recipe

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: agent_workflow
Problem type: skill_authoring
Listing id: att_agent_claude_code_skills
Last refreshed for fixture: 2026-04-26T00:00:00Z

## Source URLs

- https://docs.anthropic.com/
- https://docs.anthropic.com/en/docs/claude-code

## Extraction Notes

1. Agent skills should have a concise description that tells the model when the skill applies.
2. Progressive disclosure keeps the entrypoint small and points to scripts, references, or examples only as needed.
3. A good skill includes workflow steps, safety constraints, and verification expectations.
4. Benchmark queries should reward artifacts that name files, commands, and handoff boundaries.
5. Do not conflate a skill with a plugin manifest or provider API configuration.

## Benchmark Cautions

- Record exact source URL, retrieval date, and source-owner wording before a live paid run.
- Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.
- Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.
- Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
| S1 | agent_workflow | Agent skills should have a concise description that tells the model when the skill applies. | keep |
| S2 | agent_workflow | Progressive disclosure keeps the entrypoint small and points to scripts, references, or examples only as needed. | keep |
| S3 | agent_workflow | A good skill includes workflow steps, safety constraints, and verification expectations. | keep |
| S4 | agent_workflow | Benchmark queries should reward artifacts that name files, commands, and handoff boundaries. | keep |
| S5 | agent_workflow | Do not conflate a skill with a plugin manifest or provider API configuration. | keep |

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: SKILL.md, description, progressive disclosure, trigger, examples.
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
- Write a `SKILL.md` with a clear `description` trigger.
- Use progressive disclosure by linking scripts, references, and examples only when needed.
- Include workflow steps, safety constraints, and verification expectations.
- Keep generated artifacts separate from skill instructions.
- Do not describe a skill as a provider API key or plugin manifest.
