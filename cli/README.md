# ProofWeave CLI Harness

`proofweave` is the npm-distributed harness for Claude Code command hooks and ProofWeave artifact transport. It is intentionally thin: hooks call this CLI, and the CLI reads local config from `~/.proofweave/config.json` so Claude settings never contain API keys.

## Install Claude Code hooks

```sh
proofweave install --target claude-code
proofweave install --target claude-code --dry-run
proofweave uninstall --target claude-code
```

The installer updates `~/.claude/settings.json` by default. Use `--scope project` to target `./.claude/settings.json`. Repeated installs are idempotent: existing ProofWeave hook commands are replaced, not duplicated.

## Configure API access

```sh
proofweave auth login --api-key <key> --api-base-url http://localhost:3001
proofweave auth whoami
proofweave auth logout
```

Wallet registration is available as a minimal pass-through to the existing backend contract:

```sh
proofweave auth register --address 0x... --message "..." --signature 0x...
```

## Publish efficiently

```sh
proofweave publish ./artifact.json --ai-model claude-3-5-sonnet --price-usd-micros 250000 --usage-event-id evt_123
proofweave publish ./SKILL.md --dry-run
```

Publish uses the existing `POST /attest` endpoint once. JSON files stay structured as `data`; `SKILL.md`, Markdown prompts, text prompts, and `.prompt` files are wrapped into `{ artifactKind, metadata, content, sourcePath, generatedAt }` so the backend receives a small structured JSON payload instead of a binary upload.

## Artifact use

```sh
proofweave search "extract structured data from PDF receipts"
proofweave preview <attestation-id>
proofweave buy <attestation-id>
proofweave install-artifact <attestation-id>
proofweave stats
proofweave doctor
```

`buy` calls `GET /attestations/:id/detail` with any cached `X-Access-Receipt`, saves returned receipts under `~/.proofweave/receipts/`, and caches detail payloads under `~/.proofweave/artifacts/`. `install-artifact` installs skill or prompt content into `.claude/skills/<slug>/SKILL.md` by default, or `~/.claude/skills/` with `--global`.

`doctor` checks local config permissions, API reachability, API key presence, and wallet balance endpoint access. Any `[FAIL]` result exits non-zero so it can be used in CI or smoke scripts.
