import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { proofweaveHome } from "./config.js";

type Hook = { type: "command"; command: string };
type HookEntry = { matcher?: string; hooks?: Hook[] };
type ClaudeSettings = Record<string, unknown>;
type HookSettings = Record<string, unknown>;

const proofweaveEvents = [
  { event: "SessionStart", matcher: "*", command: "proofweave hook session-start" },
  { event: "UserPromptSubmit", matcher: "*", command: "proofweave hook user-prompt-submit" },
  { event: "PreToolUse", matcher: "Bash", command: "proofweave hook pre-tool-use" },
  { event: "PostToolUse", matcher: "Bash|Edit|Write", command: "proofweave hook post-tool-use" },
];

export function claudeSettingsPath(scope: string | undefined): string {
  if (scope === "project") return join(process.cwd(), ".claude", "settings.json");
  return join(homedir(), ".claude", "settings.json");
}

function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
}

function isProofWeaveHook(hook: unknown): boolean {
  return isRecord(hook) && hook.type === "command" && typeof hook.command === "string" && hook.command.startsWith("proofweave hook ");
}

function withoutProofWeave(entries: unknown): HookEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as HookEntry;
    const hooks = Array.isArray(candidate.hooks)
      ? candidate.hooks.filter((hook) => !isProofWeaveHook(hook))
      : [];
    if (hooks.length === 0) return [];
    return [{ ...candidate, hooks }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hookSettings(settings: ClaudeSettings): HookSettings {
  return isRecord(settings.hooks) ? { ...settings.hooks } : {};
}

function removeLegacyTopLevelHooks(settings: ClaudeSettings): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  for (const event of proofweaveEvents) {
    const cleaned = withoutProofWeave(next[event.event]);
    if (cleaned.length === 0) delete next[event.event];
    else next[event.event] = cleaned;
  }
  return next;
}

function addProofWeaveHooks(settings: ClaudeSettings): ClaudeSettings {
  const next = removeLegacyTopLevelHooks(settings);
  const hooks = hookSettings(next);
  for (const event of proofweaveEvents) {
    hooks[event.event] = [
      ...withoutProofWeave(hooks[event.event]),
      { matcher: event.matcher, hooks: [{ type: "command", command: event.command }] },
    ];
  }
  next.hooks = hooks;
  return next;
}

function removeProofWeaveHooks(settings: ClaudeSettings): ClaudeSettings {
  const next = removeLegacyTopLevelHooks(settings);
  const hooks = hookSettings(next);
  for (const event of proofweaveEvents) {
    const cleaned = withoutProofWeave(hooks[event.event]);
    if (cleaned.length === 0) delete hooks[event.event];
    else hooks[event.event] = cleaned;
  }
  if (Object.keys(hooks).length === 0) delete next.hooks;
  else next.hooks = hooks;
  return next;
}

export function installClaudeHooks(options: { scope?: string; dryRun?: boolean }): void {
  const path = claudeSettingsPath(options.scope);
  const current = readSettings(path);
  const next = addProofWeaveHooks(current);

  if (options.dryRun) {
    console.log(JSON.stringify({ target: "claude-code", settingsPath: path, hooks: proofweaveEvents, nextSettings: next }, null, 2));
    console.log("Dry run: would write deterministic command-type hooks only. No API key or secret is embedded; hooks call proofweave, which reads ~/.proofweave/config.json.");
    return;
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  console.log(`Installed ProofWeave Claude Code hooks at ${path}`);
  console.log("Repeated installs overwrite the ProofWeave hook entries instead of duplicating them.");
}

export function uninstallClaudeHooks(options: { scope?: string; dryRun?: boolean }): void {
  const path = claudeSettingsPath(options.scope);
  const current = readSettings(path);
  const next = removeProofWeaveHooks(current);

  if (options.dryRun) {
    console.log(JSON.stringify({ target: "claude-code", settingsPath: path, nextSettings: next }, null, 2));
    console.log("Dry run: would remove only ProofWeave command hooks and preserve other Claude Code settings.");
    return;
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  console.log(`Removed ProofWeave Claude Code hooks from ${path}`);
}

async function readStdin(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const input = Buffer.concat(chunks).toString("utf8").trim();
  if (!input) return {};
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return { raw: input };
  }
}

function hookDecision(additionalContext?: string): Record<string, unknown> {
  return additionalContext
    ? { continue: true, hookSpecificOutput: { additionalContext } }
    : { continue: true };
}

function payloadText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  return String(record.prompt ?? record.message ?? record.input ?? record.text ?? "");
}

export async function runHook(name: string | undefined): Promise<void> {
  const payload = await readStdin();
  if (name === "session-start") {
    console.log(JSON.stringify(hookDecision("ProofWeave harness is available. Use `proofweave search <query>` before recreating reusable skills or prompts.")));
    return;
  }

  if (name === "user-prompt-submit") {
    const text = payloadText(payload);
    const shouldHint = /(skill|prompt|recipe|how do i (extract|transform|generate))/i.test(text);
    console.log(JSON.stringify(hookDecision(shouldHint ? "Tip: `proofweave search \"<what you need>\"` may find an existing paid or free artifact before you rebuild it." : undefined)));
    return;
  }

  if (name === "pre-tool-use" || name === "post-tool-use") {
    mkdirSync(proofweaveHome(), { recursive: true, mode: 0o700 });
    const line = JSON.stringify({ event: name, observedAt: new Date().toISOString(), payload: summarizeHookPayload(payload) });
    writeFileSync(join(proofweaveHome(), "events.jsonl"), `${line}\n`, { flag: "a", mode: 0o600 });
    console.log(JSON.stringify(hookDecision()));
    return;
  }

  console.log(JSON.stringify(hookDecision()));
}

function summarizeHookPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return { kind: typeof payload };
  const toolName = stringField(payload, "tool_name") ?? stringField(payload, "toolName") ?? stringField(payload, "tool");
  const decision = stringField(payload, "decision");
  const status = stringField(payload, "status");
  return {
    kind: "object",
    keys: Object.keys(payload).sort(),
    toolName,
    decision,
    status,
    textLength: payloadText(payload).length,
  };
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}
