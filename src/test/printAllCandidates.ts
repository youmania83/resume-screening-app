// src/test/printAllCandidates.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  const res = await queryGlobal("SELECT id, name, email, role, match_percent FROM candidates ORDER BY created_at DESC;");
  console.log(`Total candidates in database: ${res.rowCount}`);
  for (const row of res.rows) {
    console.log(`- ID: ${row.id} | Name: "${row.name}" | Email: "${row.email}" | Role: "${row.role}" | Match: ${row.match_percent}%`);
  }
}

main();
