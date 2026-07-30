// src/test/fixAllLiveCandidates.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { inferCandidateRole, isGenericRoleTitle } from "../lib/roleInference.js";

async function run() {
  console.log("🔍 Querying ALL candidates across all schemas and tenants...");

  const candRes = await queryGlobal(`SELECT id, tenant_id, name, email, role, job_id, skills, experience_years FROM candidates;`);
  console.log(`Found ${candRes.rowCount} candidate rows in database.`);

  for (const c of candRes.rows) {
    console.log(`- Candidate [${c.id}]: Name="${c.name}", Email="${c.email}", Role="${c.role}", JobID="${c.job_id}", Tenant="${c.tenant_id}"`);
  }

  // Fetch all jobs
  const jobsRes = await queryGlobal(`SELECT id, tenant_id, title, description FROM jobs;`);
  console.log(`Found ${jobsRes.rowCount} job rows in database.`);
  for (const j of jobsRes.rows) {
    console.log(`- Job [${j.id}]: Title="${j.title}", Tenant="${j.tenant_id}"`);
  }

  // Perform remapping and cleaning of any generic titles
  let updatedCount = 0;
  for (const c of candRes.rows) {
    const isGeneric = isGenericRoleTitle(c.role);
    if (isGeneric || !c.role) {
      const cleanRole = inferCandidateRole({
        skills: c.skills,
        experienceYears: c.experience_years,
        currentTitle: c.role,
        name: c.name
      });
      await queryGlobal(`UPDATE candidates SET role = $1 WHERE id = $2;`, [cleanRole, c.id]);
      console.log(`  ✨ Updated candidate "${c.name}" role from "${c.role}" -> "${cleanRole}"`);
      updatedCount++;
    }
  }

  console.log(`\nDone! Remediated ${updatedCount} candidates in PostgreSQL.`);
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
