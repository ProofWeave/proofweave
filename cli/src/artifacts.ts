import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

export type ArtifactKind = "json" | "skill" | "prompt";

export interface NormalizedArtifact {
  data: Record<string, unknown>;
  artifactKind: ArtifactKind;
  sourcePath: string;
  byteLength: number;
}

function parseFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
  if (!content.startsWith("---\n")) return { metadata: {}, body: content };
  const end = content.indexOf("\n---", 4);
  if (end === -1) return { metadata: {}, body: content };

  const metadata: Record<string, string> = {};
  const raw = content.slice(4, end).split("\n");
  for (const line of raw) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (key) metadata[key] = value;
  }

  return { metadata, body: content.slice(end + 5).replace(/^\n/, "") };
}

function inferMarkdownKind(path: string): ArtifactKind {
  const name = basename(path).toLowerCase();
  if (name === "skill.md" || name.endsWith(".skill.md")) return "skill";
  return "prompt";
}

function titleFromPath(path: string): string {
  return basename(path).replace(/\.[^.]+$/, "").replace(/[._-]+/g, " ").trim() || "ProofWeave artifact";
}

export function normalizeArtifact(inputPath: string): NormalizedArtifact {
  const sourcePath = resolve(inputPath);
  const content = readFileSync(sourcePath, "utf8");
  const byteLength = Buffer.byteLength(content, "utf8");
  const extension = extname(sourcePath).toLowerCase();

  if (extension === ".json") {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON artifacts must contain an object at the top level");
    }
    return {
      data: parsed as Record<string, unknown>,
      artifactKind: "json",
      sourcePath,
      byteLength,
    };
  }

  if (extension !== ".md" && extension !== ".txt" && extension !== ".prompt") {
    throw new Error("Unsupported artifact type. Use .json, SKILL.md, .md, .txt, or .prompt");
  }

  const artifactKind = inferMarkdownKind(sourcePath);
  const { metadata, body } = parseFrontmatter(content);
  const title = metadata.title || titleFromPath(sourcePath);

  return {
    data: {
      artifactKind,
      metadata: { title, ...metadata },
      content: body,
      sourcePath,
      generatedAt: new Date().toISOString(),
    },
    artifactKind,
    sourcePath,
    byteLength,
  };
}

export function buildAttestPayload(
  artifact: NormalizedArtifact,
  options: { aiModel: string; priceUsdMicros?: number; usageEventId?: string }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    data: artifact.data,
    aiModel: options.aiModel,
  };
  if (options.priceUsdMicros !== undefined) payload.priceUsdMicros = options.priceUsdMicros;
  if (options.usageEventId) payload.usageEventId = options.usageEventId;
  return payload;
}
