/**
 * 타임라인 차트용 시드 데이터 생성 (Node.js 순수 스크립트)
 *
 * 실행: node api/scripts/seed-timeline.mjs
 * 삭제: node api/scripts/seed-timeline.mjs --clean
 */
import pg from "pg";
import * as crypto from "crypto";
import { readFileSync } from "fs";

// .env 파싱
const envContent = readFileSync("api/.env", "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
}

const { Pool } = pg;
const pool = new Pool({ connectionString: envVars.DATABASE_URL });

const SEED_PREFIX = "0xseed_";

const DOMAINS = [
  "defi", "smart_contract", "security", "blockchain", "cryptocurrency",
  "ai_ml", "data_science", "infrastructure", "education", "general",
];

const PROBLEM_TYPES = [
  "security_analysis", "code_review", "summarization",
  "data_analysis", "research", "tutorial", "general",
];

const MODELS = [
  "gpt-4o", "gemini-2.5-flash", "gemini-2.5-flash-lite",
  "claude-sonnet-4", "gemini-3.1-pro-preview",
];

const TITLES = {
  defi: ["DeFi 유동성 풀 최적화 전략", "탈중앙 거래소 슬리피지 분석", "DeFi 프로토콜 보안 감사 보고서"],
  smart_contract: ["스마트 컨트랙트 취약점 패턴 분류", "ERC-721 토큰 구현 가이드", "업그레이더블 프록시 패턴"],
  security: ["블록체인 보안 위협 동향 분석", "재진입 공격 방어 패턴", "플래시론 공격 벡터 연구"],
  blockchain: ["블록체인 플랫폼 개요", "합의 알고리즘 비교 연구", "레이어2 확장성 솔루션 분석"],
  cryptocurrency: ["암호화폐 기본 개념 설명", "비트코인 반감기 영향 분석", "스테이블코인 메커니즘 비교"],
  ai_ml: ["LLM 파인튜닝 최적화", "AI 기반 코드 리뷰 자동화", "트랜스포머 아키텍처 분석"],
  data_science: ["온체인 데이터 분석 방법론", "토큰 가격 예측 모델 비교", "사용자 행동 패턴 클러스터링"],
  infrastructure: ["분산 스토리지 접근성 분석", "IPFS 노드 운영 가이드", "RPC 노드 성능 벤치마크"],
  education: ["블록체인 입문 교육 자료", "Web3 개발 학습 로드맵", "솔리디티 기초 문법 정리"],
  general: ["수면 품질 개선 방법", "프로젝트 관리 베스트 프랙티스", "원격 근무 생산성 분석"],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndHash = () => "0x" + crypto.randomBytes(32).toString("hex");

async function seed() {
  const isClean = process.argv.includes("--clean");

  if (isClean) {
    const result = await pool.query(
      `DELETE FROM attestations WHERE attestation_id LIKE $1`,
      [`${SEED_PREFIX}%`]
    );
    console.log(`🗑️  Deleted ${result.rowCount} seed rows.`);
    await pool.end();
    return;
  }

  const now = new Date();
  let inserted = 0;

  for (let daysAgo = 28; daysAgo >= 0; daysAgo--) {
    const baseCount = daysAgo < 7 ? 4 : daysAgo < 14 ? 3 : daysAgo < 21 ? 2 : 1;
    const count = baseCount + Math.floor(Math.random() * 3);

    for (let j = 0; j < count; j++) {
      const domain = pick(DOMAINS);
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(Math.floor(Math.random() * 18) + 6, Math.floor(Math.random() * 60));

      const title = pick(TITLES[domain] || TITLES.general);
      const aiModel = pick(MODELS);
      const problemType = pick(PROBLEM_TYPES);
      const attestationId = `${SEED_PREFIX}${crypto.randomBytes(28).toString("hex")}`;

      const metadata = JSON.stringify({
        title, domain, problemType,
        abstract: `이 데이터는 ${title}에 대한 분석 내용을 다룹니다.`,
        language: "ko", metadataStatus: "ready",
      });

      try {
        await pool.query(
          `INSERT INTO attestations
            (attestation_id, content_hash, creator, ai_model, offchain_ref,
             block_number, block_timestamp, tx_hash, ipfs_cid, encryption_salt,
             encryption_version, metadata, keywords, metadata_status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (attestation_id) DO NOTHING`,
          [
            attestationId, rndHash(), "0x0000000000000000000000000000000000000000",
            aiModel, "seed-ref", 0, d.toISOString(), rndHash(),
            "seed-ipfs", "seed-salt", 1, metadata,
            [domain, problemType, "seed-data"], "ready", d.toISOString(),
          ]
        );
        inserted++;
      } catch (err) {
        console.warn(`⚠️  Skip:`, err.message);
      }
    }
  }

  console.log(`✅ Inserted ${inserted} seed attestations across 29 days.`);
  console.log(`   To remove: node api/scripts/seed-timeline.mjs --clean`);
  await pool.end();
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
