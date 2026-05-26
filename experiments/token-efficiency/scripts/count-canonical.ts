// CLI: tsx scripts/count-canonical.ts <path> [<path>...]
// Emits one JSON line per path with CTT (tiktoken o200k_base when js-tiktoken
// is installed, else bytes/4 fallback) and CB (UTF-8 byte length) after
// canonical normalization (LF endings, trim trailing whitespace, single
// trailing newline).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface CountResult {
  path: string;
  ctt: number;
  cb: number;
  ctt_method: "tiktoken_o200k_base" | "bytes_div_4_fallback";
  chars: number;
}

type Counter = {
  method: CountResult["ctt_method"];
  count: (text: string) => number;
};

let cachedCounter: Counter | null = null;

async function loadCounter(): Promise<Counter> {
  if (cachedCounter) return cachedCounter;
  try {
    // Optional dependency; install via `npm install js-tiktoken` to use.
    const mod: any = await import("js-tiktoken");
    const enc = mod.getEncoding ? mod.getEncoding("o200k_base") : null;
    if (enc && typeof enc.encode === "function") {
      cachedCounter = {
        method: "tiktoken_o200k_base",
        count: (text: string) => enc.encode(text).length,
      };
      return cachedCounter;
    }
  } catch {
    // fall through to fallback
  }
  cachedCounter = {
    method: "bytes_div_4_fallback",
    count: (text: string) => Math.ceil(Buffer.byteLength(text, "utf8") / 4),
  };
  return cachedCounter;
}

export function canonicalize(text: string): string {
  // Normalize CRLF/CR to LF, trim trailing spaces per line, single trailing newline.
  const lf = text.replace(/\r\n?/g, "\n");
  const trimmed = lf
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n");
  return trimmed.endsWith("\n") ? trimmed : trimmed + "\n";
}

export async function countText(text: string, label: string): Promise<CountResult> {
  const canon = canonicalize(text);
  const counter = await loadCounter();
  return {
    path: label,
    ctt: counter.count(canon),
    cb: Buffer.byteLength(canon, "utf8"),
    ctt_method: counter.method,
    chars: canon.length,
  };
}

export async function countFile(absPath: string): Promise<CountResult> {
  const text = readFileSync(absPath, "utf8");
  return countText(text, absPath);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("usage: tsx scripts/count-canonical.ts <path> [<path>...]");
    process.exit(2);
  }
  const results: CountResult[] = [];
  for (const arg of args) {
    const result = await countFile(resolve(arg));
    results.push(result);
  }
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
  if (results.length > 0 && results[0]!.ctt_method === "bytes_div_4_fallback") {
    console.error(
      "[warn] js-tiktoken not installed; using bytes/4 approximation. " +
        "Install with `npm install js-tiktoken` to use o200k_base.",
    );
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith("count-canonical.ts");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
