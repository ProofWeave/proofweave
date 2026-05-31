# Plan 2 - Creator Claim Feature With Claude ultracode

## Purpose

현재 구현된 vault settlement 흐름을 정리하고, 그 위에 creator claim 기능을 API와 UI에 연결한다.

이 작업은 새 settlement architecture를 다시 만드는 작업이 아니다. 이미 구현된 claim/vault 코드를 정확히 inventory한 뒤, backend와 UI에서 어디까지 만질지 결정하는 작업이다.

## Owner

Primary planning/review: Claude ultracode

Implementation after plan approval: Codex or Claude ultracode

UI integration: Codex or OpenCode

Final verification: Codex

## Current Assumption

Payment, migration, deployment are already handled by the user.

Remaining claim work:

- 현재 구현 정리
- source of truth 정리
- backend claim status endpoint 설계
- web claim UI 설계
- creator가 직접 claim tx를 sign하는 방식 확정
- edge case와 tests 정리

## Existing Pieces To Inventory

Known implemented pieces:

- `AttestationRegistry.claimCreatorBalance(amount, to)`
- `AttestationRegistry.claimableBalance(creator)`
- `AttestationRegistry.depositForAttestation(...)`
- creator별 on-chain claimable vault balance
- `access_receipts.creator_address`
- `access_receipts.vault_address`
- `access_receipts.vault_tx_hash`
- `access_receipts.vault_receipt_ref`
- `access_receipts.claimable_amount_usd_micros`
- `payments_ledger` vault settlement fields
- `VAULT_ADDRESS`
- `USDC_CONTRACT_ADDRESS`
- vault reconciliation service

Likely missing pieces:

- creator가 web에서 claimable balance를 보는 surface
- authenticated user와 creator address의 정확한 연결
- API claim status endpoint
- claim transaction prepare payload
- direct wallet write UX
- claim tx tracking
- partial claim UX
- wrong wallet/wrong network UX
- DB gross earned vs on-chain claimable mismatch handling

## Critical Architecture Decision

Backend must not claim creator funds on behalf of the creator.

Preferred MVP:

```text
API:
  read claim status
  aggregate DB gross earned
  read on-chain claimableBalance(creator)
  optionally return prepared contract call payload

Web:
  connected creator wallet signs claimCreatorBalance(amount, to)
  submit tx through wagmi/viem
  display pending/success/error
  refresh claimableBalance after tx

Contract:
  existing claimCreatorBalance(amount, to)
```

Do not implement backend-custodied claim signing unless the user explicitly changes the security model.

## Files To Read First

Claude ultracode should read these first:

- `src/AttestationRegistry.sol`
- `api/src/contracts/abi.ts`
- `api/src/contracts/attestationRegistry.ts`
- `api/src/config/env.ts`
- `api/src/services/ledger.ts`
- `api/src/services/receipt.ts`
- `api/src/services/vaultReconciliation.ts`
- `api/src/middleware/x402Gate.ts`
- `api/src/routes/purchases.ts`
- `api/src/routes/wallet.ts`
- `web/src/config/wagmi.ts`
- `web/src/App.tsx`
- `web/src/pages/SettingsPage.tsx`
- `web/src/contexts/AuthContext.tsx`
- `web/src/lib/api.ts`

## Phase 1 - Implementation Inventory

Claude ultracode must produce:

- contract claim functions and ABI availability
- source of creator address
- source of authenticated API owner
- smart wallet vs EOA vs creator distinction
- DB tables/columns involved in creator earnings
- on-chain read path
- current web wallet config
- safest page/route to attach claim UI

Questions to answer:

- Is `req.apiKeyOwner` a wallet address, web user identifier, or mixed?
- Is creator address stored in `attestations.creator`, `pricing_policies.creator_address`, or both?
- Should claim status be keyed by `apiKeyOwner`, `smartWalletAddress`, `eoa_address`, or explicit connected wallet?
- Is creator payout based on `payments_ledger.creator_address` or on-chain `claimableBalance`?
- How should mismatch between DB and on-chain claimable be displayed?

## Phase 2 - API Design

Recommended endpoint:

```text
GET /claims/me
```

Response draft:

```json
{
  "creator": "0x...",
  "network": "base-sepolia",
  "chainId": 84532,
  "vaultAddress": "0x...",
  "usdcAddress": "0x...",
  "onchainClaimableAmount": "1230000",
  "onchainClaimableUsd": "1.230000",
  "dbGrossEarnedUsdMicros": 1230000,
  "dbReceiptCount": 7,
  "dbLatestVaultTxHash": "0x...",
  "dbLatestReceiptAt": "2026-06-01T00:00:00.000Z",
  "reconciled": true,
  "warnings": []
}
```

Optional endpoint:

```text
POST /claims/prepare
```

Request:

```json
{
  "amount": "1230000",
  "to": "0x..."
}
```

Response:

```json
{
  "chainId": 84532,
  "contractAddress": "0x...",
  "functionName": "claimCreatorBalance",
  "args": ["1230000", "0x..."],
  "abi": [
    {
      "type": "function",
      "name": "claimCreatorBalance",
      "stateMutability": "nonpayable",
      "inputs": [
        { "name": "amount", "type": "uint256" },
        { "name": "to", "type": "address" }
      ],
      "outputs": []
    }
  ]
}
```

Implementation rules:

- `GET /claims/me` can be read-only.
- `POST /claims/prepare` must not send a transaction.
- no backend private key should sign claim tx.
- on-chain amount should be returned as string to avoid number precision loss.
- DB gross earned and on-chain claimable must be separate fields.

## Phase 3 - Web UI Design

Preferred route:

```text
/claims
```

Alternative:

```text
/settings` section named Creator Earnings
```

Because a UI/UX redesign is coming, prefer `/claims` or `/earnings` as a proper product surface.

UI must show:

- claimable USDC
- gross earned
- paid receipt count
- latest vault tx
- vault address
- current connected wallet
- expected chain
- recipient address
- claim amount input
- max button
- claim button
- pending tx
- success tx
- failure reason
- refresh action

Required states:

| State | UI behavior |
|---|---|
| not authenticated | redirect or auth required |
| no creator address | explain no creator wallet found |
| zero balance | disable claim, show empty state |
| wrong network | show Base Sepolia switch prompt |
| wallet mismatch | warn connected wallet is not creator |
| pending tx | show tx hash and disable duplicate submit |
| success | refresh claimable |
| failure | show reason and allow retry |

## Phase 4 - Edge Cases

Must handle:

- on-chain read failure
- DB ledger rows exist but on-chain claimable is zero
- on-chain claimable exists but DB summary is missing
- creator has multiple receipts
- partial claim
- amount greater than claimable
- recipient zero address
- wrong chain
- wallet disconnected
- connected wallet is not creator
- tx rejected by user
- tx reverted
- tx pending too long

## Phase 5 - Tests

API tests:

- unauthenticated request rejected
- creator with no receipts returns zero summary
- creator with receipts returns gross earned and count
- on-chain claimable read is returned as string
- on-chain read failure returns warning or controlled error
- DB and on-chain mismatch produces warning

Web checks:

- build passes
- zero balance state renders
- pending/success/error states render
- wrong network and wallet mismatch states render

Contract regression:

- vault tests still pass
- existing attest/verify tests still pass

## Verification Commands

Use current repo-specific env behavior.

```bash
forge test --offline --disable-labels
npm --prefix api run build
cd api && set -a; source .env.test; set +a; npm test
npm --prefix web run build
```

If token-efficiency files are touched accidentally:

```bash
npm --prefix experiments/token-efficiency run typecheck
```

## Prompt For Claude ultracode

```text
ProofWeave creator claim 기능 추가를 위한 구현 계획을 먼저 정리해줘.

중요:
- claim 기능은 이미 contract에 일부 구현되어 있다.
- 먼저 현재 구현된 곳을 정리하고, 그 기반으로 backend와 UI를 어디까지 만질지 나눠라.
- backend가 creator 대신 claim tx를 서명하면 안 된다.
- creator wallet이 직접 claimCreatorBalance(amount,to)를 호출하는 구조를 우선으로 봐라.

읽을 파일:
- src/AttestationRegistry.sol
- api/src/contracts/abi.ts
- api/src/contracts/attestationRegistry.ts
- api/src/services/ledger.ts
- api/src/services/receipt.ts
- api/src/services/vaultReconciliation.ts
- api/src/routes/purchases.ts
- api/src/routes/wallet.ts
- web/src/config/wagmi.ts
- web/src/pages/SettingsPage.tsx
- web/src/App.tsx

산출물:
1. 현재 claim 관련 구현 inventory
2. source of truth 정리
3. API endpoint 설계
4. web UI 변경 설계
5. tx signing 방식 결정
6. edge case 목록
7. 테스트 계획
8. 구현 순서

주의:
- creator address/auth owner/smart wallet/eoa address를 섞지 말 것
- DB gross earned와 on-chain claimable을 같은 값처럼 단정하지 말 것
- partial claim과 tx pending 상태를 고려할 것
```

## Implementation Order After Plan Approval

| Step | Task | Owner |
|---|---|---|
| 1 | Claude ultracode inventory and design | Claude ultracode |
| 2 | user confirms endpoint and UI placement | User |
| 3 | API service/route implementation | Codex or Claude |
| 4 | API tests and build | Codex |
| 5 | Web claims route/page | Codex or OpenCode |
| 6 | wallet direct write integration | Codex |
| 7 | full local verification | Codex |
| 8 | visual polish during UI redesign | OpenCode or Codex |

## Done Criteria

- claim implementation inventory exists
- creator source of truth is decided
- `GET /claims/me` or equivalent exists
- creator can see claimable balance
- DB gross earned and on-chain claimable are separate
- creator wallet can submit claim tx directly
- zero balance, wrong network, wallet mismatch states are handled
- API tests pass
- web build passes
- contract regression passes
