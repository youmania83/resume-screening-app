const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    const logs = await pool.query(`SELECT * FROM candidate_activity_logs WHERE message ILIKE '%sharma%' OR message ILIKE '%rajesh%' OR message ILIKE '%cfo%'`);
    console.log("=== CANDIDATE ACTIVITY LOGS (" + logs.rows.length + ") ===");
    console.log(JSON.stringify(logs.rows, null, 2));

    const webhooks = await pool.query(`SELECT * FROM webhook_events WHERE payload::text ILIKE '%sharma%' OR payload::text ILIKE '%rajesh%' OR payload::text ILIKE '%cfo%'`);
    console.log("=== WEBHOOK EVENTS (" + webhooks.rows.length + ") ===");
    console.log(JSON.stringify(webhooks.rows, null, 2));

    const dupes = await pool.query(`SELECT * FROM duplicate_candidates`);
    console.log("=== DUPLICATE CANDIDATES (" + dupes.rows.length + ") ===");
    console.log(JSON.stringify(dupes.rows, null, 2));

    const emails = await pool.query(`SELECT * FROM email_communication_history WHERE recipient_email ILIKE '%sharma%' OR recipient_email ILIKE '%rajesh%' OR body_preview ILIKE '%sharma%' OR body_preview ILIKE '%rajesh%'`);
    console.log("=== EMAIL HISTORY (" + emails.rows.length + ") ===");
    console.log(JSON.stringify(emails.rows, null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

main();
