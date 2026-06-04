// CLI: node scripts/make-clean-contexts.mjs
//
// 품질 평가용 "정답 누출 제거(clean)" 컨텍스트를 생성한다.
// 원본 raw/artifact 파일에는 채점 정답이 그대로 박혀 있어(예: "The correct answer ...
// should mention: OHLC, trades, ..." / "Required terms ... intentionally present")
// 그대로 답하면 raw·artifact 모두 만점이 나와 품질 변별이 불가능하다.
// → 평가 전에 이 메타-누출 섹션을 제거한 clean 컨텍스트를 만들어
//   "모델이 실제 본문을 이해해 답하는가"를 보게 한다.
//
// 출력: fixtures/v2-full/clean/{source-bundles,artifacts}/<name>.md

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FX = join(ROOT, "fixtures", "v2-full");

const NAMES = [
  "kraken-ohlc-trades",
  "fatf-travel-rule",
  "openzeppelin-uups-deploy",
  "claude-code-skills",
];

// raw: "## Long Context Block" 이후 전부 제거(여기에 정답 누출 + Artifact Compression Target 포함).
//      이 섹션은 benchmark 메타 설명일 뿐 실제 source 근거가 아니다(Source URLs/Extraction
//      Notes/Raw Evidence Matrix 가 실제 근거).
function cleanRaw(text) {
  const idx = text.indexOf("\n## Long Context Block");
  const body = idx >= 0 ? text.slice(0, idx) : text;
  return body.trimEnd() + "\n";
}

// artifact: "## Quality Guardrails" 이후 제거(여기에 "Required terms ... intentionally
//      present" 누출이 있다). "## Compressed Guidance" 까지가 실제 답변 근거다.
function cleanArtifact(text) {
  const idx = text.indexOf("\n## Quality Guardrails");
  const body = idx >= 0 ? text.slice(0, idx) : text;
  return body.trimEnd() + "\n";
}

function leakCheck(text) {
  return /correct answer|should mention|intentionally present|Compression Target/i.test(text);
}

mkdirSync(join(FX, "clean", "source-bundles"), { recursive: true });
mkdirSync(join(FX, "clean", "artifacts"), { recursive: true });

let ok = true;
for (const name of NAMES) {
  const rawSrc = readFileSync(join(FX, "source-bundles", `${name}.md`), "utf8");
  const artSrc = readFileSync(join(FX, "artifacts", `${name}.md`), "utf8");
  const rawClean = cleanRaw(rawSrc);
  const artClean = cleanArtifact(artSrc);
  writeFileSync(join(FX, "clean", "source-bundles", `${name}.md`), rawClean, "utf8");
  writeFileSync(join(FX, "clean", "artifacts", `${name}.md`), artClean, "utf8");
  const rawLeak = leakCheck(rawClean);
  const artLeak = leakCheck(artClean);
  if (rawLeak || artLeak) ok = false;
  console.log(
    `${name}: raw ${rawSrc.length}→${rawClean.length}B leak=${rawLeak}  | artifact ${artSrc.length}→${artClean.length}B leak=${artLeak}`
  );
}
console.log(ok ? "\nALL CLEAN — 정답 누출 제거 완료" : "\n⚠️ 일부 파일에 누출 잔존 — 패턴 확인 필요");
