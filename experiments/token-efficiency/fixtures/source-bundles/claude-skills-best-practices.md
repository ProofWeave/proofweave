# Claude Code Skills — Authoring Best Practices (raw 2026-05-01)

> Raw evidence pack. Combines the Claude Code Skills documentation
> (`docs.claude.com/.../claude-code/skills`) and the agent-skill authoring
> guide (`docs.claude.com/.../agent-skills/best-practices`), both as of
> 2026-05-01, with practical notes from a corpus of 40 hand-reviewed
> skills shipped by ProofWeave.

## 1. What a Skill is

A Skill is a Markdown file (`SKILL.md`) plus optional accompanying assets
that Claude loads on demand. A Skill is selected for use when the user's
current task semantically matches the Skill's `description`. The model
reads the Skill body only when it decides the Skill applies, so the
description acts as a router.

A Skill is not a prompt. It is an executable instruction pack. Skills can
reference scripts (`scripts/`) and reference docs (`docs/`) that Claude can
read or run.

## 2. SKILL.md required fields

The YAML frontmatter at the top of `SKILL.md` must contain:

- `name` — kebab-case, unique within the skill registry.
- `description` — a single paragraph aimed at the model, written in the
  imperative. It must contain the triggers ("Use when ...") and the
  high-level capability ("Provides ...").
- `version` — semver string.
- `triggers` — optional array of natural-language phrases that should
  cause the Skill to be selected.

## 3. Description discipline

Bad descriptions are the dominant failure mode. The description controls
selection. Bad descriptions cause the wrong Skill to be loaded, which
wastes context and corrupts answers.

Rules:

- Start with the verb. "Migrate to OpenAI Responses API" not "This Skill
  helps you migrate to..."
- Include the trigger phrase. "Use when migrating from chat completions
  to /v1/responses."
- Include the success contract. "Produces working SDK code targeting
  Responses API v1."
- Avoid generic adjectives ("powerful", "comprehensive", "best-in-class").
- Avoid the words "this Skill". They waste tokens and add no signal.

## 4. Progressive disclosure

A Skill is loaded fully when selected. Therefore, every line in the body
costs context. The right pattern:

- Body contains the core decision tree (under 200 lines).
- Detailed reference moves to `docs/<topic>.md`; Skill instructs the model
  to read it only when needed.
- Long scripts move to `scripts/`; Skill instructs the model to run them.
- Test inputs and golden outputs move to `tests/`.

This is the same load-only-when-needed pattern that ProofWeave's listing
taxonomy points at: the artifact is small and routes to the raw evidence.

## 5. Verifiability

Every Skill should declare how to verify its own output. Either:

- A short verification script in `scripts/verify.sh` that returns non-zero
  on failure.
- A test fixture in `tests/` with expected outputs.
- A rubric block at the bottom of `SKILL.md` listing must-include and
  must-not-hallucinate items.

Skills without verification are not Skills, they are prompts. ProofWeave's
quality rubric mirrors this: `mustInclude`, `mustNotHallucinate`,
`passThreshold`.

## 6. Common mistakes

- Treating `SKILL.md` as documentation. It is instructions for a model.
- Putting examples in the body that the model will copy verbatim even when
  inappropriate. Mark examples explicitly.
- Skipping the version field, then breaking dependents.
- Letting the body grow above 400 lines. Beyond that the Skill should be
  split or content moved to `docs/`.
- No triggers, then wondering why selection is unreliable.

## 7. Example header

```markdown
---
name: gpt5-responses-migration
description: Migrate code from `/v1/chat/completions` to `/v1/responses`. Use when the user is upgrading an OpenAI integration to GPT-5. Produces working SDK code on Responses API v1 and flags removed parameters.
version: 1.0.0
triggers:
  - "migrate to GPT-5"
  - "responses api"
  - "/v1/responses"
---
```

## 8. Lifecycle

- v0.x: experimental, breaking changes allowed.
- v1.0: stable signature, rubric exists, verification script passes.
- After v1.0: any breaking change requires a major version bump and a
  changelog entry under `CHANGELOG.md`.
