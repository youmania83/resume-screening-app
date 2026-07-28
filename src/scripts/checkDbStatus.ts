// src/scripts/checkDbStatus.ts
import dotenv from "dotenv";
dotenv.config();
import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  const intCands = await queryGlobal("SELECT id, name, email, role, score, status, assessment_status, keka_status, created_at FROM candidates WHERE LOWER(status) IN ('interviewing', 'interview_scheduled');");
  console.log("=== CANDIDATES IN INTERVIEWING/INTERVIEW_SCHEDULED (" + intCands.rows.length + ") ===");
  console.table(intCands.rows);

  const statusDist = await queryGlobal("SELECT status, COUNT(*)::int as count FROM candidates GROUP BY status ORDER BY COUNT(*) DESC;");
  console.log("=== ALL CANDIDATE STATUS DISTRIBUTION ===");
  console.table(statusDist.rows);

  process.exit(0);
}
main();
