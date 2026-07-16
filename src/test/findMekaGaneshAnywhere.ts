// src/test/findMekaGaneshAnywhere.ts
import { pool } from "../lib/db.js";

async function findMeka() {
  try {
    console.log("Searching candidates for MEKA...");
    const candRes = await pool.query(
      "SELECT id, tenant_id, name, email, role, status FROM candidates WHERE name ILIKE '%MEKA%' OR email ILIKE '%MEKA%';"
    );
    console.log(`Found ${candRes.rowCount} candidate entries:`);
    candRes.rows.forEach(row => {
      console.log(JSON.stringify(row, null, 2));
    });

    console.log("\nSearching candidate_documents for MEKA...");
    const docRes = await pool.query(
      "SELECT id, tenant_id, title, candidate_id FROM candidate_documents WHERE title ILIKE '%MEKA%';"
    );
    console.log(`Found ${docRes.rowCount} document entries:`);
    docRes.rows.forEach(row => {
      console.log(JSON.stringify(row, null, 2));
    });

  } catch (err: any) {
    console.error("Error:", err.message || err);
  } finally {
    await pool.end();
  }
}

findMeka();
