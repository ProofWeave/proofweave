import "dotenv/config";
import pg from "pg";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  const r = await pool.query(`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name='attestations' 
    AND column_name IN ('metadata','keywords','metadata_status')
    ORDER BY ordinal_position
  `);
  console.log("=== T3 컬럼 확인 ===");
  console.table(r.rows);
  
  const cnt = await pool.query(`SELECT metadata_status, COUNT(*) FROM attestations GROUP BY metadata_status`);
  console.log("\n=== metadata_status 분포 ===");
  console.table(cnt.rows);
  
  await pool.end();
}

main().catch(console.error);
