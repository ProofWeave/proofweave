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
