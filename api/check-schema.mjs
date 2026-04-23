import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT attestation_id, metadata_status,
         metadata->>'title' AS title,
         metadata->>'domain' AS domain,
         metadata->>'problemType' AS problem_type,
         metadata->>'abstract' AS abstract,
         keywords,
         metadata->>'language' AS language,
         metadata->>'detectedPII' AS detected_pii
  FROM attestations
  ORDER BY created_at DESC LIMIT 3
`).then(r => {
  for (const row of r.rows) {
    console.log("\n=== attestation_id:", row.attestation_id.slice(0, 16) + "... ===");
    console.log("metadata_status:", row.metadata_status);
    console.log("title:", row.title);
    console.log("domain:", row.domain);
    console.log("problemType:", row.problem_type);
    console.log("abstract:", row.abstract);
    console.log("keywords:", row.keywords);
    console.log("language:", row.language);
    console.log("detectedPII:", row.detected_pii);
  }
  return pool.end();
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
