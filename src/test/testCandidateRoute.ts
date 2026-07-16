import dotenv from "dotenv";
dotenv.config();

import { queryTenant } from "../lib/tenantDb.js";

async function main() {
  const candidatesRes = await queryTenant(
    `SELECT candidates.*, j.title as job_title, j.location as job_location, j.job_code as job_code
     FROM candidates
     LEFT JOIN jobs j ON candidates.job_id = j.id
     WHERE candidates.tenant_id = :tenant_id
     ORDER BY candidates.created_at DESC
     LIMIT 50 OFFSET 0;`
  );
  console.log("Candidates found under context:", candidatesRes.rows.length);
  console.log(candidatesRes.rows.map(r => r.name));
}

main().catch(console.error);
