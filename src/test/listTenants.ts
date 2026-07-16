// src/test/listTenants.ts
import { pool } from "../lib/db.js";

async function listTenants() {
  try {
    const res = await pool.query("SELECT id, name FROM tenants;");
    console.log(`Found ${res.rowCount} tenants in the database:`);
    res.rows.forEach(row => {
      console.log(`- ID: ${row.id}, Name: ${row.name}`);
    });
  } catch (err: any) {
    console.error("Error:", err.message || err);
  } finally {
    await pool.end();
  }
}

listTenants();
