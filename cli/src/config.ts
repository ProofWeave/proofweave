import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ProofWeaveConfig {
  apiBaseUrl: string;
  apiKey?: string;
  defaultAiModel?: string;
}

export const defaultApiBaseUrl = "http://localhost:3001";

export function proofweaveHome(): string {
  return join(homedir(), ".proofweave");
}

export function configPath(): string {
  return join(proofweaveHome(), "config.json");
}

export function receiptsDir(): string {
  return join(proofweaveHome(), "receipts");
}

export function artifactsDir(): string {
  return join(proofweaveHome(), "artifacts");
}

export function ensureProofWeaveHome(): void {
  mkdirSync(proofweaveHome(), { recursive: true, mode: 0o700 });
  mkdirSync(receiptsDir(), { recursive: true, mode: 0o700 });
  mkdirSync(artifactsDir(), { recursive: true, mode: 0o700 });
}

export function loadConfig(): ProofWeaveConfig {
  const path = configPath();
  if (!existsSync(path)) return { apiBaseUrl: defaultApiBaseUrl };

  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ProofWeaveConfig>;
  return {
    apiBaseUrl: parsed.apiBaseUrl || defaultApiBaseUrl,
    apiKey: parsed.apiKey,
    defaultAiModel: parsed.defaultAiModel,
  };
}

export function saveConfig(config: ProofWeaveConfig): void {
  ensureProofWeaveHome();
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function requireApiKey(config: ProofWeaveConfig): string {
  if (!config.apiKey) {
    throw new Error(`No API key configured. Run: proofweave auth login --api-key <key>`);
  }
  return config.apiKey;
}

export function redact(value: string | undefined): string {
  if (!value) return "not configured";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
