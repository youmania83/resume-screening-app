// src/lib/initDb.js
const { pool } = require("./db");

(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS resume_texts (
        batch_id VARCHAR PRIMARY KEY,
        s3_key VARCHAR,
        raw_text TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_scores (
        batch_id VARCHAR NOT NULL,
        job_id VARCHAR NOT NULL,
        overall INT NOT NULL,
        criteria JSONB NOT NULL,
        PRIMARY KEY (batch_id, job_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_usage_logs (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR NOT NULL,
        event_type VARCHAR NOT NULL,
        credits_used INT NOT NULL,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database tables ensured.");
  } finally {
    client.release();
    await pool.end();
  }
})();
