// src/lib/db.ts
import { Pool } from "pg";
import type { QueryResult } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Verify DB connection at startup
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ DB pool connected successfully");
    client.release();
  } catch (err) {
    console.error("❌ DB pool connection failed:", err);
  }
})();

export async function query(text: string, params?: any[]): Promise<QueryResult<any>> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

export default pool;
