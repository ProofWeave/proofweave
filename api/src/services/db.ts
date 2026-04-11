import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

/** DB 연결 테스트 */
export async function testDbConnection(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT NOW()");
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
