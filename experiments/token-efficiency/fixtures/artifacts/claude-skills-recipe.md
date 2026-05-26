# RECIPE: Author a Claude Code Skill

Use when writing a new `SKILL.md`. Source evidence: see linked raw bundle.

## YAML frontmatter

Required: `name` (kebab-case), `description`, `version` (semver). Optional:
`triggers` (array of trigger phrases).

## Description rules

- Start with the verb.
- Include "Use when ..." trigger.
- Include "Produces ..." success contract.
- Skip generic adjectives and the literal phrase "this Skill".

## Progressive disclosure

- Body under 200 lines. Hard limit 400.
- Long reference content lives under `docs/`.
- Scripts under `scripts/`. Test fixtures under `tests/`.

## Verifiability

Every Skill must declare verification. Choose one:

- `scripts/verify.sh` that exits non-zero on failure.
- `tests/` directory with golden outputs.
- Rubric block (`mustInclude`, `mustNotHallucinate`, `passThreshold`).

## Lifecycle

- v0.x: breaking changes allowed.
- v1.0+: breaking changes require major bump and `CHANGELOG.md` entry.

## Common mistakes

- Treating `SKILL.md` as documentation.
- Body over 400 lines.
- No `triggers`, then unreliable selection.
- Examples without an "example only" marker.
