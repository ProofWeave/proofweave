# Claude Code Skill Authoring Recipe

Listing id: att_agent_claude_code_skills
Domain: agent_workflow
Kind: workflow_recipe

## Use When

Use this artifact when the query asks for skill_authoring in the agent_workflow
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Write a `SKILL.md` with a clear `description` trigger.
- Use progressive disclosure by linking scripts, references, and examples only when needed.
- Include workflow steps, safety constraints, and verification expectations.
- Keep generated artifacts separate from skill instructions.
- Do not describe a skill as a provider API key or plugin manifest.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
