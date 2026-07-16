// src/test/checkInboxTenants.ts
import { pool } from "../lib/db.js";

async function checkInbox() {
  try {
    console.log("Checking all entries in resume_inbox...");
    const res = await pool.query(
      "SELECT ri.id, ri.tenant_id, ri.file_name, ri.status, t.name as tenant_name FROM resume_inbox ri LEFT JOIN tenants t ON ri.tenant_id = t.id ORDER BY ri.created_at DESC;"
    );
    
    console.log(`\nFound ${res.rowCount} total entries:`);
    res.rows.forEach(row => {
      console.log(`- File: ${row.file_name}, Status: ${row.status}, TenantID: ${row.tenant_id}, TenantName: ${row.tenant_name}`);
    });

  } catch (err: any) {
    console.error("Error:", err.message || err);
  } finally {
    await pool.end();
  }
}

checkInbox();
