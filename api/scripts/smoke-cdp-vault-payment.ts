#!/usr/bin/env tsx
import { pool } from "../src/services/db.js";

type SmokeArgs = {
  apiBaseUrl: string;
  apiKey: string;
  attestationId: string;
  network: string;
  requireRealTx: boolean;
};

type ReceiptRow = {
  receipt_id: string;
  vault_receipt_ref: string | null;
  vault_tx_hash: string | null;
  vault_address: string | null;
};

type LedgerRow = {
  receipt_id: string;
  vault_receipt_ref: string | null;
  vault_tx_hash: string | null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const detailUrl = `${args.apiBaseUrl.replace(/\/$/, "")}/attestations/${encodeURIComponent(args.attestationId)}/detail`;

  const response = await fetch(detailUrl, {
    headers: { "X-API-Key": args.apiKey },
  });

  const body = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) {
    throw new Error(`GET ${detailUrl} failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const receiptHeader = response.headers.get("X-Access-Receipt");
  if (!receiptHeader) {
    throw new Error("missing X-Access-Receipt header");
  }

  const receiptId = receiptHeader.split(".")[0];
  if (!receiptId) throw new Error("malformed X-Access-Receipt header");

  const receipt = await pool.query<ReceiptRow>(
    `SELECT receipt_id, vault_receipt_ref, vault_tx_hash, vault_address
     FROM access_receipts
     WHERE receipt_id = $1`,
    [receiptId]
  );
  if (receipt.rows.length === 0) throw new Error(`receipt ${receiptId} not found in access_receipts`);

  const ledger = await pool.query<LedgerRow>(
    `SELECT receipt_id, vault_receipt_ref, vault_tx_hash
     FROM payments_ledger
     WHERE receipt_id = $1`,
    [receiptId]
  );
  if (ledger.rows.length === 0) throw new Error(`receipt ${receiptId} not found in payments_ledger`);

  const receiptRow = receipt.rows[0];
  const ledgerRow = ledger.rows[0];
  if (!receiptRow.vault_receipt_ref || receiptRow.vault_receipt_ref !== ledgerRow.vault_receipt_ref) {
    throw new Error("receipt and ledger vault_receipt_ref mismatch");
  }
  if (!receiptRow.vault_tx_hash || receiptRow.vault_tx_hash !== ledgerRow.vault_tx_hash) {
    throw new Error("receipt and ledger vault_tx_hash mismatch");
  }
  if (args.requireRealTx && receiptRow.vault_tx_hash.startsWith("dev-vault-tx-")) {
    throw new Error("dev-vault-tx result is not a real onchain transaction");
  }

  console.log(JSON.stringify({
    ok: true,
    network: args.network,
    attestationId: args.attestationId,
    receiptId,
    vaultReceiptRef: receiptRow.vault_receipt_ref,
    vaultTxHash: receiptRow.vault_tx_hash,
    vaultAddress: receiptRow.vault_address,
    receiptHeaderStored: true,
  }, null, 2));
}

function parseArgs(argv: string[]): SmokeArgs {
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, true);
    }
  }

  const apiKey = stringFlag(flags, "api-key") ?? process.env.PROOFWEAVE_API_KEY;
  const attestationId = stringFlag(flags, "attestation-id");
  if (!apiKey) throw new Error("missing --api-key or PROOFWEAVE_API_KEY");
  if (!attestationId) throw new Error("missing --attestation-id");

  return {
    apiBaseUrl: stringFlag(flags, "api-base-url") ?? "http://localhost:3001",
    apiKey,
    attestationId,
    network: stringFlag(flags, "network") ?? "base-sepolia",
    requireRealTx: flags.get("allow-dev-tx") !== true,
  };
}

function stringFlag(flags: Map<string, string | boolean>, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === "string" && value.trim() ? value : undefined;
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
