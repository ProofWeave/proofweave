# Area #3 — Claude Code Hook Harness

## Product Position

ProofWeave's V1 surface is **not a standalone CLI** and **not a generic LLM integration platform**. It is a **harness layer that plugs into Claude Code's existing hook + skill primitives**, distributed as a single npm package. The terminal `proofweave` binary exists as the underlying transport (search, preview, buy, install, stats, auth), but the *product experience* is that during a Claude Code session the agent itself transparently discovers, previews, pays for, and installs ProofWeave artifacts via hook-triggered shell calls. This beats a standalone CLI because Claude Code users — the highest-frequency Anthropic agent users — never have to leave their session to acquire a skill; the harness inverts the workflow so the agent reaches for ProofWeave inside the loop the user is already in.

## Claude Code Hook Surface

**Hooks live on disk** at `~/.claude/settings.json` (user-level) or `./.claude/settings.json` (project-level). Each hook event key maps to an array of `{ matcher, hooks: [{ type: "command", command: "..." }] }` entries. Input arrives on stdin as a JSON event payload; the hook prints a JSON decision on stdout (and uses exit codes for blocking vs allowing). Anthropic also supports HTTP and prompt-based hooks; ProofWeave V1 uses **command-type hooks only** because shell-piped JSON is the simplest portable contract and avoids running a local HTTP server.

**Hook events ProofWeave V1 binds to** (drawn from the Claude Code Hooks reference — full lifecycle confirmed; *exact JSON payload field names for each event marked "needs verification" below where they affect the contract*):

| Event | Why ProofWeave binds it |
|---|---|
| `SessionStart` | Authenticate the harness against `~/.proofweave/config.json`, refresh the local artifact-availability cache (cheap heuristic: project files vs. recently-published skills), and append a one-line discovery hint to the session so Claude knows it can call `proofweave search`. |
| `UserPromptSubmit` | Cheap intent classifier: if the prompt matches `/(skill|prompt|recipe|how do I (extract\|transform\|generate))/i`, emit a small additional-context block suggesting `proofweave search` before Claude commits to writing its own. **Non-blocking, advisory only.** |
| `PreToolUse` (matcher: `Bash`) | Telemetry shim. When Claude is about to run `npx proofweave …`, attach a session-correlation ID so PostToolUse can stitch results into the savings ledger. Otherwise no-op. |
| `PostToolUse` (matcher: `Bash\|Edit\|Write`) | The token-savings telemetry write. After any Bash call that invoked a paid artifact, or any Edit/Write that touched a `.claude/skills/<name>/SKILL.md` we delivered, append a usage event to the local SQLite ledger keyed on `(session_id, artifact_id, invocation_count, est_tokens_saved)`. |
| `Stop` | End-of-turn flush. Push pending usage events to the ProofWeave API (operator-attested invocation counts) and ack receipt-bound deliveries. |
| `SessionEnd` | Final flush + close SQLite handle. |

Hooks **ProofWeave V1 explicitly does not bind**: `PermissionRequest`, `PermissionDenied`, `SubagentStart/Stop`, `TaskCreated/Completed`, `PreCompact/PostCompact`, `WorktreeCreate/Remove`. Tempting but out of scope — they invite plugin-platform creep.

**Authorization model.** During `proofweave install --target claude-code` the installer (a) generates or imports a ProofWeave API key, (b) binds it to the user's existing CDP smart wallet (already provisioned by the server today — see `api/src/services/wallet.ts`), and (c) writes `{apiKey, walletAddress, env: "production"|"local"}` into `~/.proofweave/config.json` with `0600` permissions. The hook commands read this file at runtime; Claude Code never sees the key.

## End-to-end User Story

**Day 1 — install:**

```
$ npx proofweave install --target claude-code
✓ Claude Code detected at ~/.claude/
✓ Wrote 6 hook entries to ~/.claude/settings.json (backup: settings.json.pw-bak)
✓ Installed discovery skill at ~/.claude/skills/proofweave-discovery/SKILL.md
✓ ~/.proofweave/config.json created (chmod 0600)

Next: run `proofweave auth login` to bind your wallet.
```

**Mid-session — developer says *"I need a skill that extracts structured data from PDF receipts"*:**

1. `UserPromptSubmit` hook fires → matches intent regex → emits an additional-context line: *"Tip: `proofweave search "extract structured data from PDF receipts"` may have an existing skill."*
2. Claude (now aware via the discovery skill + the hook hint) calls `Bash`: `npx proofweave search "extract structured data from PDF receipts"`.
3. CLI hits the ProofWeave API; returns top 3 results as JSON (id, title, price USDC, kind, preview-available).
4. Claude shows results to user; user picks one.
5. Claude calls `Bash`: `npx proofweave preview pw_abc123`. CLI fetches a non-charged, hash-revealed preview (frontmatter + first 50 tokens of body for SKILL.md; first 3 rows for JSON datasets). $0.00 charged.
6. User approves. Claude calls `Bash`: `npx proofweave buy pw_abc123`. CLI calls the gated download endpoint with `X-API-KEY`; server's `x402Gate` charges the user's CDP smart wallet, issues an `X-Access-Receipt`, returns the asset. CLI persists the receipt to `~/.proofweave/receipts/`.
7. Claude calls `Bash`: `npx proofweave install-artifact pw_abc123`. CLI drops `./.claude/skills/extract-pdf-receipts/SKILL.md` into the project (or `~/.claude/skills/` with `--global`). Next session, Claude auto-loads it.
8. `PostToolUse` hook fires on each Bash call, writes usage events to local SQLite.

**After session — `proofweave stats`:** four reconciling columns per artifact: invocations recorded · x402 receipts collected · operator-held balance · withdrawn. The "withdrawn" column reads `—` in S0 with the line `Held by operator since [date]; self-withdraw target: [public date]`.

## CLI Command Surface

```
proofweave install   --target <claude-code|codex-v2|mcp-v2>    # install hooks
proofweave uninstall --target <claude-code|codex-v2|mcp-v2>    # clean removal
proofweave auth      login|logout|whoami                       # API key + wallet
proofweave publish   <path/to/artifact.{json,skill.md}>        # validated upload
proofweave search    <query> [--kind skill|prompt|dataset]     # search registry
proofweave preview   <id>                                       # free hash-revealed preview
proofweave buy       <id>                                       # CDP wallet → receipt
proofweave install-artifact <id> [--global]                    # drop into .claude/skills/
proofweave stats     [--creator|--buyer]                       # 4-column reconciliation
proofweave receipts  list|show <id>                            # local receipt inventory
```

Only `--target claude-code` is implemented in V1. `codex-v2` and `mcp-v2` are stubs that print "available in v1.1" so the surface is forward-stable.

## Hook Implementation Contract

Each hook handler is a separate small Node script under `node_modules/proofweave/dist/hooks/`. The shared TS contract:

```ts
// packages/proofweave/src/hooks/contract.ts
export interface HookEventInput<E extends HookEventName> {
  event: E;
  session_id: string;          // Claude Code session UUID — needs verification of exact field name
  cwd: string;
  tool_name?: string;          // present on Pre/PostToolUse
  tool_input?: unknown;        // event-specific; opaque to harness except for Bash command string
  tool_response?: unknown;     // present on PostToolUse
  user_prompt?: string;        // present on UserPromptSubmit
  // ... event-specific fields
}

export type HookDecision =
  | { continue: true }                              // no-op, default
  | { continue: true; additionalContext: string }   // inject advisory text (UserPromptSubmit)
  | { continue: false; reason: string };            // block (NOT used in V1 — observe-only)

export async function runHook<E extends HookEventName>(
  event: E,
  handler: (input: HookEventInput<E>) => Promise<HookDecision>
): Promise<void> {
  const input = JSON.parse(await readStdin());
  try {
    const decision = await handler(input);
    process.stdout.write(JSON.stringify(decision));
    process.exit(0);
  } catch (err) {
    // Fail-OPEN: never block Claude on harness failure.
    // Log to ~/.proofweave/logs/hook-errors.log and exit 0.
    logHookError(event, err);
    process.stdout.write(JSON.stringify({ continue: true }));
    process.exit(0);
  }
}
```

**Error path is fail-open by design.** A broken ProofWeave harness must never break a user's Claude Code session. All errors log locally and return `{continue: true}`. Hard failures surface only in `proofweave doctor`.

## V1 Distribution

- **OS:** macOS only (per user requirement). Linux behind a `--experimental` flag.
- **Node:** Node 20+ (matches Anthropic's published Claude Code requirement).
- **Side effects** on `proofweave install --target claude-code`:
  - Adds 6 entries to `~/.claude/settings.json` under the `hooks` key (merge, not replace; backup written to `settings.json.pw-bak.<timestamp>`)
  - Creates `~/.claude/skills/proofweave-discovery/SKILL.md` (text-only, no `allowed_tools`, follows the v1 MVP artifact constraints)
  - Creates `~/.proofweave/{config.json, receipts/, logs/, telemetry.sqlite}` with `chmod 0600` on `config.json`
- **Uninstall path** (`proofweave uninstall --target claude-code`): removes the 6 hook entries (matched by a fixed `# proofweave-managed` JSON comment / sentinel field), removes the discovery skill, restores from backup if present, leaves `~/.proofweave/` intact unless `--purge` is passed. Must produce zero zombie hooks — verified by re-running `claude settings show` and asserting absence.

## Adapter Contract (V2)

The five canonical events from synthesis section §3, area #3:

```ts
type ProofWeaveAdapterEvent =
  | { kind: "artifact.submitted"; artifactId: string; creator: string; mime: "json"|"skill.md"; bytes: number }
  | { kind: "usage.measured";     artifactId: string; sessionId: string; invocations: number; tokensEstSaved: number }
  | { kind: "quote.accepted";     quoteId: string;    artifactId: string; buyer: string; amountUsdc: string }
  | { kind: "receipt.stored";     receiptId: string;  artifactId: string; buyer: string; hmac: string }
  | { kind: "delivery.recorded";  receiptId: string;  artifactId: string; deliveredAt: string; checksum: string };
```

A future MCP adapter listens for these on a local UNIX socket; a future Codex adapter consumes the same shape via its plugin host. V1 emits all five from the Claude Code harness so the contract is exercised before it's claimed as portable.

## Implementation Tasks

1. **Hook installer & uninstaller** — `src/installer/claude-code.ts`. Idempotent merge into `~/.claude/settings.json` with sentinel comments, atomic write + backup, full uninstall round-trip test. *Profile: backend/CLI. Parallelizable. Blockers: none. Acceptance: install then uninstall leaves `settings.json` byte-identical to original.*

2. **CLI core commands** — `src/cli/{search,preview,buy,install-artifact,stats,auth,publish,receipts}.ts`. Plumb to existing API routes (`/attestations`, `/attest`, x402 download). *Profile: backend/CLI. Parallelizable per command. Blockers: task 5 for `buy`. Acceptance: each command has a unit test against a mocked API and an e2e test against `api/` local server.*

3. **Hook handlers** — six small scripts: `dist/hooks/{session-start,user-prompt-submit,pre-tool-use,post-tool-use,stop,session-end}.js`. *Profile: backend. Parallelizable. Blockers: task 1 for installation; task 7 for telemetry sink. Acceptance: each handler returns `{continue: true}` in <50ms p95 on a no-op path.*

4. **Discovery skill** — `templates/proofweave-discovery/SKILL.md`. Tightly validated per the MVP boundary (no `allowed_tools`, no scripts, no URL fetches). Just text explaining the CLI to Claude. *Profile: docs/PM. Parallelizable. Blockers: none. Acceptance: passes the `validateSkillMd()` function from Area #1/#7 work.*

5. **Buy flow integration** — wire `proofweave buy` to call the gated download endpoint with `X-API-KEY`, parse `X-Access-Receipt`, persist to `~/.proofweave/receipts/`. *Profile: backend. Blockers: existing `x402Gate.ts` must be honest about S0 operator-held (synthesis verdict). Acceptance: round-trip with a real CDP testnet wallet produces a verifiable receipt.*

6. **Local telemetry store** — SQLite schema for `usage_events(session_id, artifact_id, invocations, est_tokens_saved, ts)`. `stats` command queries it. *Profile: backend. Parallelizable. Blockers: none. Acceptance: 10k inserted events queryable in <50ms.*

7. **Adapter event emitter** — emit the five canonical events from the harness even though only Claude Code consumes them today. *Profile: backend. Blockers: task 3, 5. Acceptance: a test adapter on a UNIX socket receives all five event kinds during a scripted e2e buy flow.*

8. **`proofweave doctor`** — diagnostic: are hooks installed, is config readable, is the API reachable, is the CDP wallet bound, does a test buy succeed against staging. *Profile: backend/CLI. Blockers: tasks 1, 5. Acceptance: prints a pass/fail row per check and exits with the count of failures.*

## Risks

- **Claude Code hook API stability.** Anthropic could rename event payload fields, change exit-code semantics, or move the settings file. Mitigation: pin the hook-contract layer to a version probe in `SessionStart`; if probe fails, the harness disables itself and emits a one-line warning to `~/.proofweave/logs/`. *Needs verification: whether Claude Code emits a stable version string in the SessionStart payload.*
- **Wallet permission revoked mid-purchase.** If the user revokes the CDP smart wallet's spend authorization between quote and transfer, the buy must fail-safely without leaving an orphan attestation. Mitigation: the `x402Gate` reservation/consumption state machine from Area #4's acceptance fix already enforces this — the harness just surfaces the 402 cleanly.
- **Multi-project conflicts.** Two Claude Code projects sharing the same global hooks could double-charge or double-flush. Mitigation: scope SQLite telemetry by `(session_id, cwd)`; idempotency key on `quote.id` prevents server-side double charge. Prefer project-level `.claude/settings.json` for `install --scope project` users; default to user-level only with explicit `--scope user`.
- **Hook fail-open silently corrupts savings data.** Fail-open is the right safety stance for live sessions, but means a quietly-broken harness under-reports invocations and inflates the operator's apparent margin. Mitigation: `proofweave doctor` runs nightly via launchd; persistent failures alert in `stats`.

## Open Questions

- **Discovery-skill staleness:** when a new ProofWeave artifact ships, do we re-write the discovery `SKILL.md` automatically, or push a notification at `SessionStart`? *Recommend the latter: skills shouldn't churn under the user's feet.*
- **Project-vs-user hook scope:** should `--target claude-code` default to user-level (`~/.claude/`) or project-level (`./.claude/`)? Project-level is safer for uninstall but hurts the "always-on" feel. *Recommend user-level + `--scope project` flag.*
- **Anthropic Skills marketplace overlap:** if Anthropic ships their own paid-skills marketplace, the harness becomes a competing distribution surface inside their app. *Position defensively: ProofWeave's moat is provenance + on-chain settlement, not distribution.* Flag for product strategy.
- **Verification gap:** the exact JSON field names in each hook event payload (`session_id` vs `sessionId`, etc.) and the exact decision-object schema (`continue` vs `decision: "block"|"approve"`) need to be confirmed against a live Claude Code session before task 3 ships. The Hooks reference page was content-capped during the planning fetch.
