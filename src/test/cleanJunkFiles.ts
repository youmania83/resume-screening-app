// src/test/cleanJunkFiles.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";
import { isNonResumeFile } from "../lib/fileFilters.js";

async function main() {
  console.log("=== RUNNING JUNK DOCUMENTS CLEANUP ON DATABASE ===");

  // Fetch all inbox files with candidate details
  const res = await queryGlobal(`
    SELECT ri.id, ri.candidate_id, ri.file_name, ri.status, c.name as candidate_name
    FROM resume_inbox ri
    LEFT JOIN candidates c ON c.id = ri.candidate_id;
  `);
  console.log(`Analyzing ${res.rowCount} total records in resume_inbox...`);

  const junkInboxIds: string[] = [];
  const junkCandidateIds: string[] = [];
  const deletedFiles: string[] = [];

  for (const row of res.rows) {
    const fileName = row.file_name || "";
    const status = row.status;
    const candidateName = row.candidate_name;
    
    // Check if filename contains any blacklist keyword
    let isJunk = false;
    if (isNonResumeFile(fileName)) {
      isJunk = true;
    }
    if (status === "Failed") {
      isJunk = true;
    }
    if (candidateName && (candidateName === "Unknown Candidate" || candidateName.toLowerCase().includes("unknown"))) {
      isJunk = true;
    }

    if (isJunk) {
      console.log(`📍 Found junk record: "${row.file_name}" (ID: ${row.id}, Candidate: ${candidateName}, Status: ${status})`);
      junkInboxIds.push(row.id);
      deletedFiles.push(row.file_name);
      if (row.candidate_id && !junkCandidateIds.includes(row.candidate_id)) {
        junkCandidateIds.push(row.candidate_id);
      }
    }
  }

  // Also query orphan unknown candidates
  const orphanRes = await queryGlobal(`
    SELECT id, name FROM candidates
    WHERE name = 'Unknown Candidate'
       OR name ILIKE '%unknown%'
       OR name IS NULL
       OR name = '';
  `);
  console.log(`Found ${orphanRes.rowCount} potential orphan unknown candidates.`);
  for (const row of orphanRes.rows) {
    if (!junkCandidateIds.includes(row.id)) {
      junkCandidateIds.push(row.id);
      console.log(`📍 Found orphan unknown candidate: "${row.name}" (ID: ${row.id})`);
    }
  }

  if (junkInboxIds.length === 0 && junkCandidateIds.length === 0) {
    console.log("No junk records found. Database is already clean!");
    return;
  }

  console.log(`\nPurging ${junkInboxIds.length} junk inbox records and ${junkCandidateIds.length} candidates...`);

  if (junkCandidateIds.length > 0) {
    await queryGlobal(`DELETE FROM candidate_timeline WHERE candidate_id = ANY($1);`, [junkCandidateIds]);
    await queryGlobal(`DELETE FROM candidate_activity_logs WHERE candidate_id = ANY($1);`, [junkCandidateIds]);
    await queryGlobal(`DELETE FROM candidates WHERE id = ANY($1);`, [junkCandidateIds]);
  }
  if (junkInboxIds.length > 0) {
    await queryGlobal(`DELETE FROM resume_inbox WHERE id = ANY($1);`, [junkInboxIds]);
  }

  console.log("\nCleanup successfully completed!");
  console.log("Purged files:", deletedFiles);
}

main().catch(err => {
  console.error("Cleanup failed:", err);
});
