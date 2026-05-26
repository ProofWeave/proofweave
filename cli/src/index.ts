#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, flag, booleanFlag, numberFlag, type ParsedArgs } from "./args.js";
import { buildAttestPayload, normalizeArtifact } from "./artifacts.js";
import {
  artifactsDir,
  configPath,
  ensureProofWeaveHome,
  loadConfig,
  receiptsDir,
  redact,
  saveConfig,
} from "./config.js";
import { apiRequest } from "./http.js";
import { installClaudeHooks, runHook, uninstallClaudeHooks } from "./claudeHooks.js";

const help = `ProofWeave CLI harness

Usage:
  proofweave install --target claude-code [--scope user|project] [--dry-run]
  proofweave uninstall --target claude-code [--scope user|project] [--dry-run]
  proofweave auth login --api-key <key> [--api-base-url <url>] [--default-ai-model <model>]
  proofweave auth logout|whoami
  proofweave auth register --address <0x...> --message <msg> --signature <sig>
  proofweave publish <artifact.json|SKILL.md|prompt.md> [--ai-model <model>] [--price-usd-micros <n>] [--usage-event-id <id>] [--dry-run]
  proofweave search <query> [--limit <n>] [--domain <name>] [--problem-type <name>]
  proofweave preview <attestation-id>
  proofweave buy <attestation-id>
  proofweave install-artifact <attestation-id> [--global]
  proofweave stats [--analytics] [--range 30d]
  proofweave doctor

Hooks:
  proofweave hook session-start|user-prompt-submit|pre-tool-use|post-tool-use
`;

function target(args: ParsedArgs): string {
  return flag(args, "target") || args.subcommand || "claude-code";
}

function assertClaudeTarget(args: ParsedArgs): void {
  const selected = target(args);
  if (selected !== "claude-code") {
    console.log(`${selected} adapter is documented as future work; only --target claude-code is implemented in this harness.`);
    process.exit(0);
  }
}

async function commandInstall(args: ParsedArgs): Promise<void> {
  assertClaudeTarget(args);
  installClaudeHooks({ scope: flag(args, "scope", "user"), dryRun: booleanFlag(args, "dry-run") });
}

async function commandUninstall(args: ParsedArgs): Promise<void> {
  assertClaudeTarget(args);
  uninstallClaudeHooks({ scope: flag(args, "scope", "user"), dryRun: booleanFlag(args, "dry-run") });
}

async function commandAuth(args: ParsedArgs): Promise<void> {
  const action = args.subcommand;
  if (action === "login") {
    const apiKey = flag(args, "api-key");
    if (!apiKey) throw new Error("auth login requires --api-key <key>");
    const current = loadConfig();
    saveConfig({
      apiBaseUrl: flag(args, "api-base-url", flag(args, "api-url", current.apiBaseUrl)) ?? current.apiBaseUrl,
      apiKey,
      defaultAiModel: flag(args, "default-ai-model", current.defaultAiModel),
    });
    console.log(`Saved ProofWeave config to ${configPath()} with API key ${redact(apiKey)}.`);
    return;
  }

  if (action === "logout") {
    const current = loadConfig();
    saveConfig({ apiBaseUrl: current.apiBaseUrl, defaultAiModel: current.defaultAiModel });
    console.log(`Removed API key from ${configPath()}.`);
    return;
  }

  if (action === "whoami") {
    const current = loadConfig();
    console.log(JSON.stringify({ apiBaseUrl: current.apiBaseUrl, apiKey: redact(current.apiKey), configPath: configPath() }, null, 2));
    return;
  }

  if (action === "register") {
    const address = flag(args, "address");
    const message = flag(args, "message");
    const signature = flag(args, "signature");
    if (!address || !message || !signature) throw new Error("auth register requires --address, --message, and --signature");
    const current = loadConfig();
    const response = await apiRequest<{ apiKey: string; smartWalletAddress?: string; message: string }>(current, "POST", "/auth/register", {
      auth: false,
      body: { address, message, signature },
    });
    saveConfig({ apiBaseUrl: current.apiBaseUrl, apiKey: response.data.apiKey, defaultAiModel: current.defaultAiModel });
    console.log(JSON.stringify({ ...response.data, apiKey: redact(response.data.apiKey), configPath: configPath() }, null, 2));
    return;
  }

  console.log(help);
}

async function commandPublish(args: ParsedArgs): Promise<void> {
  const inputPath = args.subcommand;
  if (!inputPath) {
    if (booleanFlag(args, "dry-run")) {
      console.log("Dry run requested, but no artifact path was supplied. Nothing would be sent to POST /attest.");
      console.log("Run `proofweave publish <artifact.json|SKILL.md|prompt.md> --dry-run` to print the exact normalized payload.");
      return;
    }
    throw new Error("publish requires an artifact path");
  }

  const config = loadConfig();
  const artifact = normalizeArtifact(inputPath);
  const aiModel = flag(args, "ai-model", config.defaultAiModel || "claude-code-harness") ?? "claude-code-harness";
  const payload = buildAttestPayload(artifact, {
    aiModel,
    priceUsdMicros: numberFlag(args, "price-usd-micros"),
    usageEventId: flag(args, "usage-event-id"),
  });

  if (booleanFlag(args, "dry-run")) {
    console.log(JSON.stringify({ endpoint: "POST /attest", artifactKind: artifact.artifactKind, sourcePath: artifact.sourcePath, byteLength: artifact.byteLength, payload }, null, 2));
    console.log("Dry run: this efficient path sends one normalized JSON body to /attest using data + aiModel, with optional priceUsdMicros and usageEventId. JSON stays structured; SKILL.md/prompt files are wrapped as metadata/content instead of uploaded as arbitrary binary blobs.");
    return;
  }

  const response = await apiRequest(config, "POST", "/attest", { body: payload });
  console.log(JSON.stringify(response.data, null, 2));
}

async function commandSearch(args: ParsedArgs): Promise<void> {
  const query = [args.subcommand, ...args.positionals].filter(Boolean).join(" ");
  if (!query) throw new Error("search requires a query");
  const params = new URLSearchParams({ q: query, limit: String(numberFlag(args, "limit") ?? 10) });
  const domain = flag(args, "domain");
  const problemType = flag(args, "problem-type", flag(args, "kind"));
  if (domain) params.set("domain", domain);
  if (problemType) params.set("problemType", problemType);
  const response = await apiRequest(loadConfig(), "GET", `/search?${params.toString()}`);
  console.log(JSON.stringify(response.data, null, 2));
}

async function commandPreview(args: ParsedArgs): Promise<void> {
  const id = args.subcommand;
  if (!id) throw new Error("preview requires an attestation id");
  const response = await apiRequest(loadConfig(), "GET", `/attestations/${encodeURIComponent(id)}`);
  console.log(JSON.stringify({ preview: response.data, note: "Free metadata preview. Use `proofweave buy <id>` to fetch receipt-gated detail." }, null, 2));
}

function receiptPath(id: string): string {
  return join(receiptsDir(), `${id}.json`);
}

function artifactPath(id: string): string {
  return join(artifactsDir(), `${id}.json`);
}

async function commandBuy(args: ParsedArgs): Promise<void> {
  const id = args.subcommand;
  if (!id) throw new Error("buy requires an attestation id");
  ensureProofWeaveHome();

  let receipt: string | undefined;
  try {
    const cached = JSON.parse(readFileSync(receiptPath(id), "utf8")) as { receipt?: string };
    receipt = cached.receipt;
  } catch {
    receipt = undefined;
  }

  const headers = receipt ? { "X-Access-Receipt": receipt } : undefined;
  const response = await apiRequest<Record<string, unknown>>(loadConfig(), "GET", `/attestations/${encodeURIComponent(id)}/detail`, { headers });
  const nextReceipt = response.receipt || receipt;
  if (nextReceipt) writeFileSync(receiptPath(id), `${JSON.stringify({ attestationId: id, receipt: nextReceipt, savedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(artifactPath(id), `${JSON.stringify(response.data, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ savedArtifact: artifactPath(id), savedReceipt: nextReceipt ? receiptPath(id) : undefined, detail: response.data }, null, 2));
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "proofweave-artifact";
}

async function commandInstallArtifact(args: ParsedArgs): Promise<void> {
  const id = args.subcommand;
  if (!id) throw new Error("install-artifact requires an attestation id");
  ensureProofWeaveHome();

  let detail: { data?: unknown };
  try {
    detail = JSON.parse(readFileSync(artifactPath(id), "utf8")) as { data?: unknown };
  } catch {
    await commandBuy({ ...args, subcommand: id });
    detail = JSON.parse(readFileSync(artifactPath(id), "utf8")) as { data?: unknown };
  }

  const data = detail.data;
  if (!data || typeof data !== "object") throw new Error("Downloaded artifact detail does not contain object data");
  const artifact = data as Record<string, unknown>;
  const metadata = typeof artifact.metadata === "object" && artifact.metadata ? artifact.metadata as Record<string, unknown> : {};
  const title = String(metadata.title || id);
  const base = booleanFlag(args, "global") ? join(process.env.HOME || ".", ".claude", "skills") : join(process.cwd(), ".claude", "skills");
  const targetDir = join(base, slug(title));
  mkdirSync(targetDir, { recursive: true, mode: 0o700 });

  if (artifact.artifactKind === "skill" || artifact.artifactKind === "prompt") {
    const content = String(artifact.content || "");
    const path = join(targetDir, "SKILL.md");
    writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 });
    console.log(`Installed ${artifact.artifactKind} artifact ${id} to ${path}`);
    return;
  }

  const path = join(targetDir, "artifact.json");
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  console.log(`Installed JSON artifact ${id} to ${path}`);
}

async function commandStats(args: ParsedArgs): Promise<void> {
  const config = loadConfig();
  if (booleanFlag(args, "analytics")) {
    const range = flag(args, "range", "30d") ?? "30d";
    const response = await apiRequest(config, "GET", `/stats/analytics/me?range=${encodeURIComponent(range)}`);
    console.log(JSON.stringify(response.data, null, 2));
    return;
  }
  const response = await apiRequest(config, "GET", "/stats/me");
  console.log(JSON.stringify(response.data, null, 2));
}

type DoctorCheck = {
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
};

async function commandDoctor(): Promise<void> {
  const config = loadConfig();
  const checks: DoctorCheck[] = [];

  checks.push(checkLocalConfig(config));

  try {
    const response = await apiRequest<Record<string, unknown>>(config, "GET", "/health", { auth: false });
    checks.push({ name: "api", status: "PASS", detail: `${config.apiBaseUrl} responded with ${response.status}` });
  } catch (err: unknown) {
    checks.push({ name: "api", status: "FAIL", detail: err instanceof Error ? err.message : String(err) });
  }

  if (config.apiKey) {
    checks.push({ name: "auth", status: "PASS", detail: `API key configured as ${redact(config.apiKey)}` });
    try {
      const response = await apiRequest<Record<string, unknown>>(config, "GET", "/wallet/balance");
      checks.push({ name: "wallet", status: "PASS", detail: JSON.stringify(response.data) });
    } catch (err: unknown) {
      checks.push({ name: "wallet", status: "WARN", detail: err instanceof Error ? err.message : String(err) });
    }
  } else {
    checks.push({ name: "auth", status: "FAIL", detail: "No API key configured. Run `proofweave auth login --api-key <key>`." });
    checks.push({ name: "wallet", status: "WARN", detail: "Skipped because auth is not configured." });
  }

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  if (checks.some((check) => check.status === "FAIL")) process.exit(1);
}

function checkLocalConfig(config: ReturnType<typeof loadConfig>): DoctorCheck {
  const path = configPath();
  if (!existsSync(path)) {
    return { name: "config", status: "FAIL", detail: `${path} does not exist. Run auth login first.` };
  }

  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    return { name: "config", status: "FAIL", detail: `${path} permissions must not allow group/other access. Run: chmod 600 ${path}` };
  }

  return { name: "config", status: "PASS", detail: `${path} permissions ${mode.toString(8)}, apiBaseUrl ${config.apiBaseUrl}` };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "--help" || args.command === "help" || booleanFlag(args, "help") || booleanFlag(args, "h")) {
    console.log(help);
    return;
  }

  switch (args.command) {
    case "install": return commandInstall(args);
    case "uninstall": return commandUninstall(args);
    case "auth": return commandAuth(args);
    case "publish": return commandPublish(args);
    case "search": return commandSearch(args);
    case "preview": return commandPreview(args);
    case "buy": return commandBuy(args);
    case "install-artifact": return commandInstallArtifact(args);
    case "stats": return commandStats(args);
    case "doctor": return commandDoctor();
    case "hook": return runHook(args.subcommand);
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`proofweave: ${message}`);
  process.exit(1);
});
