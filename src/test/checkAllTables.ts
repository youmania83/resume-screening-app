// src/test/checkAllTables.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("Checking applications, archive_candidates, candidate_scores...");

  const appRes = await queryGlobal(`SELECT COUNT(*) FROM applications;`);
  console.log("applications count:", appRes.rows);

  const archiveRes = await queryGlobal(`SELECT COUNT(*) FROM archive_candidates;`);
  console.log("archive_candidates count:", archiveRes.rows);

  const scoreRes = await queryGlobal(`SELECT COUNT(*) FROM candidate_scores;`);
  console.log("candidate_scores count:", scoreRes.rows);

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
