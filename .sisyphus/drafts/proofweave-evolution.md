# Draft: ProofWeave Evolution Plan (Hyperplan Session)

## Source: User Request (7 areas)
1. Token efficiency testing — broader data sets, per-model/per-call/per-prompt aggregation, real purchase scenarios
2. Prompt guard — **EXCLUDED from implementation plan** (담당 팀원이 서버에 미반영). Critique can still mention, but plan does not implement.
3. CLI + LLM-web integration — terminal npm package (macOS first), embed inside Claude Code/Codex/LLM web (not LLM apps)
4. Payment system upgrade — price-on-upload, session payment, agent payment
5. User settlement contract — claim system + smart wallet send capability
6. Security — encryption process + front/back/server attack surface verification & code fixes
7. Niche-data feedback — **DIRECTION-ONLY in plan** (not implementation). Plan must answer "how could we approach this?" with concrete options/experiments.

## Scope Decision (USER-CONFIRMED)
- **Implementation tasks**: #1, #3, #4, #5, #6
- **Excluded**: #2
- **Originally directional**: #7 — UPGRADED to implementation track (merged with reputation)

## User Pivots (from blocker answers)
- (a) **Vault-direct claim**: skip operator-custodial S0/S1. x402 payment receiver = Vault contract on Base Sepolia. Creators claim from vault. Smart wallet outbound transfer also enabled.
- (b) **Payment naming**: keep current x402 + CDP smart wallet naming (current flow works; only receiver swap).
- (c) **CLI = Claude Code hook harness**: not a standalone product, plugs into existing agent tooling (skills/MCP-style). First target = Claude Code hooks. Codex/MCP deferred to V2.
- (d) **Composite reputation**: EIP-8004 onchain agent reputation ⊕ web user ratings → single data ranking signal. Merges with #7 niche-data thesis into a unified implementation track.

## Defaults Applied (user did not answer; can override)
- (4) MVP artifact boundary: **JSON + non-executable SKILL.md/prompt documents** for new uploads. Legacy raw-artifact path remains but marked deprecated.
- (5) Beta terms: PHI/PII/secrets forbidden; takedown/quarantine rights; vault balance labelled "creator vault balance — claimable" (no S2 hedge needed since user chose vault-direct).

## Team Run
- teamRunId: a7c72139-3e11-4505-a0b9-b2c08bea85bb
- Lead: lead (ultrabrain)
- Critics: low-skeptic, high-skeptic, ultra-logic, artistry, deep

## Adversarial Critiques (Phase 3-4)
_(filled in as members report back)_

## Synthesized Findings (Phase 5)
_(filled after cross-critique)_

## Open Questions
_(filled as critiques surface them)_
