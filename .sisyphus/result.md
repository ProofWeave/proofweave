# ProofWeave ultrawork 완료 보고서

이번 작업은 ProofWeave의 유료 접근 결제 경로를 creator claim vault 방식으로 바꾸고, Claude Code에서 산출물을 빠르게 attestation으로 보낼 수 있는 npm CLI 하네스를 추가한 구현이다. 루트 `result.md`와 `.sisyphus/result.md`는 같은 내용으로 작성했다.

## 1. 수정된 코드 범위

컨트랙트 쪽은 `src/AttestationRegistry.sol`에 vault 정산 저장소와 함수를 추가했다. 기존 UUPS 저장소 뒤에 `usdc`, creator별 `_claimable`, `_receiptCredited`, `_vaultEntered`를 붙여 저장소 순서 변경을 피했고, `initializeVault(address usdcToken)`는 `reinitializer(2)`로 분리했다. 새 결제 진입점은 `depositForAttestation(attestationId, creator, amount, receiptRef)`이고, creator 출금 진입점은 `claimCreatorBalance(amount, to)`다. `test/unit/Vault.t.sol`에는 creator 적립, 중복 receiptRef 차단, creator 직접 claim, 비 creator 탈취 실패, vault 초기화 후 기존 attest와 verify 유지 테스트가 들어갔다.

API 쪽은 `api/src/middleware/x402Gate.ts`, `api/src/services/wallet.ts`, `api/src/services/receipt.ts`, `api/src/services/ledger.ts`, `api/src/db/migrate.ts`, `api/src/types/payment.ts`가 바뀌었다. 유료 접근에서 receipt 재사용과 무료 경로는 유지하고, 잔고가 충분한 smart wallet 결제 경로만 vault deposit 정산으로 바꿨다. receipt와 ledger에는 `creatorAddress`, `vaultAddress`, `vaultTxHash`, `vaultReceiptRef`, `claimableAmountUsdMicros` 계열 필드가 추가되어 온체인 vault 입금과 API 영수증을 대조할 수 있다.

CLI 쪽은 `cli/package.json`, `cli/src/index.ts`, `cli/src/artifacts.ts`, `cli/src/claudeHooks.ts`, `cli/README.md`를 통해 `proofweave` 바이너리 패키지를 추가했다. Node 20 이상, TypeScript 빌드, 런타임 의존성 없는 표준 라이브러리와 fetch 기반 구조다. 명령은 Claude Code hook 설치와 제거, auth, publish, search, preview, buy, install-artifact, stats, hook 이벤트 수신을 포함한다.

## 2. UI와 UX 변경

웹 UI는 `web/src/components/AttestationPurchaseModal.tsx`와 `web/src/index.css`에서 구매/조회 모달에 결제 진행 상태, 저장된 receipt, Basescan 링크, reputation 제출/집계 영역을 노출하도록 확장했다. 기존 Explorer 카드와 모달 흐름은 유지하고, 성공 상태 이후에만 평가 제출 UI가 나타난다.

변경된 UX는 터미널과 Claude Code 하네스 UX다. 사용자는 `proofweave install --target claude-code`로 Claude Code command hook을 설치할 수 있고, `--scope project`를 쓰면 프로젝트의 `./.claude/settings.json`을 대상으로 한다. dry run은 실제 파일을 쓰지 않고 결정적인 settings JSON을 출력한다. 설치되는 hook은 `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`에 대한 `proofweave hook ...` command 항목이며, API key나 secret은 Claude settings에 들어가지 않는다. 인증 정보는 `~/.proofweave/config.json`에서 읽는다.

산출물 발행 UX도 웹 업로드가 아니라 CLI 한 번 호출로 정리했다. `proofweave publish ./artifact.json --ai-model ... --price-usd-micros ... --usage-event-id ...` 또는 `proofweave publish ./SKILL.md --dry-run`처럼 실행하면, CLI가 로컬 파일을 작은 JSON payload로 정규화해서 기존 `POST /attest`로 보낸다.

## 3. 백엔드 결제 로직 변경

이전 구현 방향은 payer의 CDP smart wallet에서 operator 주소로 USDC를 보내는 형태였다. 이번 구현의 실제 유료 경로는 operator 수취가 아니라 `approve + vault deposit`이다. `x402Gate`는 가격 정책을 읽고 smart wallet 잔고가 충분하면 `depositUsdcToVaultFromSmartWallet(...)`를 호출한다. 이 함수는 하나의 Base Sepolia UserOperation 안에 두 call을 묶는다.

첫 번째 call은 USDC 컨트랙트에 대한 `approve(PROXY_ADDRESS, amount)`다. 두 번째 call은 vault 역할을 하는 `AttestationRegistry` 프록시에 대한 `depositForAttestation(attestationId, creator, amount, receiptRef)`다. 결제가 성공하면 API는 `issueReceipt(...)`와 `recordPayment(...)`에 settlement 필드를 넘겨 receipt와 ledger에 같은 vault reconciliation 정보를 남긴다.

관리자 settlement는 구현 경로에서 제거됐다. paid access 수익은 관리자나 operator가 정산하는 방식이 아니라 creator별 claimable balance로 쌓인다. creator는 자기 주소에서 `claimCreatorBalance(amount, to)`를 호출해야 하며, 함수는 `_claimable[msg.sender]`만 줄이고 지정한 `to`로 USDC를 전송한다. 다른 주소가 creator 잔액을 빼가려 하면 `InsufficientClaimable`로 실패한다.

## 4. claim 권한 설계와 컨트랙트 식별

`AttestationRegistry`는 attestation 생성 시 `Attestation.creator`를 온체인에 저장한다. 이 값은 `attest(contentHash, creator, aiModel, offchainRef)`에서 operator가 전달하지만, 저장된 뒤에는 `attestationId` 기준으로 컨트랙트가 직접 참조한다.

vault 입금 함수는 `depositForAttestation(attestationId, creator, amount, receiptRef)` 형태다. 함수 내부에서 `_attestations[attestationId]`를 읽고, `att.creator == creator`인지 검사한다. attestation이 없으면 `AttestationNotFound`, DB의 creator 값이 오래됐거나 조작되어 온체인 creator와 다르면 `CreatorMismatch(expected, actual)`로 실패한다. 따라서 API가 `pricing_policies.creator_address`를 넘기더라도 최종 claim 권리는 컨트랙트 레벨에서 attestation creator에게만 배정된다.

중복 결제 방지는 두 겹이다. 컨트랙트는 `_receiptCredited[receiptRef]`로 같은 vault receipt reference가 다시 적립되는 것을 막고, DB는 `access_receipts.vault_receipt_ref`와 `payments_ledger.vault_receipt_ref`에 nullable partial unique index를 둔다.

## 5. Supabase와 DB 스키마 호환성

DB 변경은 추가형 nullable 컬럼과 guarded migration으로 작성됐다. `api/src/db/migrate.ts`는 `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`을 `DO $$ BEGIN ... EXCEPTION WHEN duplicate_column THEN NULL; END $$;` 패턴으로 감싸고 있다. 새 컬럼은 receipt와 ledger의 vault reconciliation 필드이며, 기존 row에 즉시 값을 요구하지 않는 nullable 컬럼이다. 기존 receipt 조회, HMAC 검증, 무료 access path는 그대로 유지된다.

파괴적 migration은 없다. 기존 컬럼 삭제, type 강제 변경, 기존 row 재작성 같은 작업은 하지 않았다. 다만 이번 세션에서는 live Supabase migration을 실행하지 않았다. 명시적인 DB 배포 단계 없이 원격 Supabase에 `ALTER TABLE`을 날려 의도치 않은 스키마 변경을 만들지 않기 위해서다. Atlas 또는 배포 담당자는 배포 단계에서 같은 migration을 적용하면 된다.

API compatibility 관점에서는 `AccessReceipt`와 `LedgerEntry`에 필드가 추가됐지만 기존 receipt와 free path는 보존됐다. `x402Gate`의 순서는 기존처럼 receipt header 검증, 서버 내부 receipt 조회, 무료 가격 통과, 유료 결제 순서다. 새 settlement 필드는 결제가 vault 경로로 성공했을 때 채워지고, 기존 영수증이나 무료 접근에서는 null로 남을 수 있다.

## 6. 효율적인 harness attestation 전략

하네스는 binary upload나 web UI 우회를 만들지 않고 기존 `POST /attest`를 한 번 호출한다. `cli/src/artifacts.ts`의 `normalizeArtifact`는 입력을 세 종류로 줄인다. JSON 파일은 top level object만 허용하고 그 객체를 그대로 `data`로 둔다. `SKILL.md`, `.skill.md`, 일반 Markdown, text, `.prompt` 파일은 `{ artifactKind, metadata, content, sourcePath, generatedAt }` 구조로 감싼다. frontmatter가 있으면 metadata로 읽고, 없으면 파일명에서 title을 만든다.

`buildAttestPayload`는 최종 body를 `{ data, aiModel }`로 만들고, 옵션이 있을 때만 `priceUsdMicros`와 `usageEventId`를 붙인다. 이 방식은 Claude Code hook이나 사용자가 만든 로컬 JSON, `SKILL.md`, prompt를 하나의 작은 JSON payload로 정규화한다. 그래서 파일을 브라우저에 올리거나, 임의 binary multipart를 만들거나, 웹 UI에서 다시 복사 붙여넣기할 필요가 없다. API 입장에서도 기존 `/attest` 계약만 처리하면 되므로 새 ingest endpoint가 필요 없다.

dry run 증거도 이 설계를 확인한다. `publish JSON --dry-run`은 `endpoint: "POST /attest"`, `artifactKind: "json"`, `sourcePath`, `byteLength`, 그리고 `payload` 안의 구조화된 `data`와 `aiModel`을 출력했다. `publish SKILL.md --dry-run`은 `artifactKind: "skill"`과 함께 `metadata`, `content`, `sourcePath`, `generatedAt`이 들어간 skill payload를 출력했다. 둘 다 실제 전송 없이 `/attest`에 보내질 JSON 형태를 확인하게 해 준다.

## 7. 검증 증거

다음 검증은 이번 구현 완료 상태에서 확인된 증거다.

* `forge test`: passed, including 5 new Vault tests and existing unit/upgrade tests.
* `cd api && npm test`: 6 files, 58 tests passed.
* `cd api && npm run build`: passed.
* `cd cli && npm run build`: passed.
* `cd web && npm run build`: passed with existing Vite large chunk warning only.
* `lsp_diagnostics` API src: 0 errors; CLI src: 0 errors.
* Manual QA: `node dist/index.js --help` printed command list; `install --target claude-code --scope project --dry-run` printed deterministic settings JSON; `publish JSON --dry-run` printed `/attest` payload; `publish SKILL.md --dry-run` printed structured skill payload.

이번 보고서 작성 중에는 추가 구현 코드를 만들지 않았고, 위 검증 증거는 제공된 완료 컨텍스트의 정확한 결과를 사용했다.

## 8. 제한 사항과 의도적으로 제외한 항목

이번 구현에는 prompt guard가 들어가지 않았다. Codex, MCP, web adapter도 실제 구현하지 않았고, CLI의 target 처리에서 Claude Code 외 adapter는 future work 문구로만 남겨져 있다. 웹 UI 변경은 구매/조회 모달의 결제 상태, receipt, reputation 표면에 한정했다.

live mainnet 배포와 audit은 수행하지 않았다. Base Sepolia 또는 mainnet에서 실제 CDP vault transaction을 실행한 것도 이번 세션 범위가 아니다. CDP 미설정 개발 모드에서는 `depositUsdcToVaultFromSmartWallet`이 `dev-vault-tx-*` 형태의 개발용 tx hash를 반환할 수 있지만, 이를 실제 온체인 입금으로 주장하지 않는다.

live Supabase migration도 실행하지 않았다. migration 파일은 호환성 있게 준비됐지만, 원격 DB ALTER는 별도의 명시적 DB 배포 절차에서 실행해야 한다.

## 9. 최종 상태

완료된 산출물은 `.sisyphus/result.md`와 루트 `result.md`이며, 두 파일은 동일한 한국어 완료 보고서를 담고 있다. 보고서는 실제 코드 변경 기준으로 vault claim 설계, API 결제 경로, DB와 Supabase 호환성, CLI 하네스 attestation 전략, 검증 증거, 제한 사항을 구분해 기록했다.
