# Harness Implementation Notes

- Added `cli/` as a focused npm package with bin `proofweave`, TypeScript build/typecheck scripts, no runtime dependencies, and Node >=20 fetch/std-lib usage.
- Implemented `proofweave install --target claude-code` and `uninstall` for deterministic command-type hooks in Claude settings. Hooks call `proofweave hook ...`; no API keys are embedded in `~/.claude/settings.json` or project settings.
- Implemented local config at `~/.proofweave/config.json`, receipts under `~/.proofweave/receipts/`, artifact cache under `~/.proofweave/artifacts/`, and advisory/non-blocking hook handlers for session start, user prompt submit, and tool telemetry.
- Implemented efficient publish normalization against existing `POST /attest`: JSON stays JSON; SKILL.md/prompt-like inputs become structured `{ artifactKind, metadata, content, sourcePath, generatedAt }`; optional `priceUsdMicros` and `usageEventId` are passed through.
- Implemented minimum viable API-backed commands for `auth`, `publish`, `search`, `preview`, `buy`, `install-artifact`, and `stats` using existing `/auth/register`, `/attest`, `/search`, `/attestations/:id`, `/attestations/:id/detail`, and `/stats/*` routes.
