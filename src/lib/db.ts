// src/lib/db.ts
import { Pool } from "pg";
import type { QueryResult } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT) || 2000,
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT) || 10000,
});

pool.on("error", (err) => {
  console.error("🚨 Unexpected error on idle database client:", err.message || err);
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

/**
 * Execute queries in a transaction block. Automatically handles BEGIN, COMMIT, and ROLLBACK.
 */
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
