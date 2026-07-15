// src/test/cleanRejectedCandidates.ts
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("=== RUNNING REJECTED CANDIDATES & RESUMES CLEANUP ===");

  const uploadDir = path.join(process.cwd(), "uploads");
  console.log(`Uploads folder path: ${uploadDir}`);

  // 1. Fetch all candidates with status 'Rejected' (case-insensitive)
  const rejectedRes = await queryGlobal(`
    SELECT id, name, email, status FROM candidates 
    WHERE status ILIKE 'rejected';
  `);

  const rejectedCandidates = rejectedRes.rows;
  console.log(`Found ${rejectedCandidates.length} rejected candidate(s) in database.`);

  if (rejectedCandidates.length === 0) {
    console.log("No rejected candidates found to clean up.");
    return;
  }

  const candidateIds = rejectedCandidates.map(c => c.id);

  // 2. Fetch all linked document files for these candidates
  const docsRes = await queryGlobal(`
    SELECT id, candidate_id, file_url, title FROM candidate_documents
    WHERE candidate_id = ANY($1);
  `, [candidateIds]);

  console.log(`Found ${docsRes.rowCount} document(s) associated with these rejected candidates.`);

  // 3. Delete files from physical disk
  let deletedFilesCount = 0;
  for (const doc of docsRes.rows) {
    if (doc.file_url) {
      const fileName = path.basename(doc.file_url);
      const filePath = path.join(uploadDir, fileName);

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted file: ${fileName}`);
          deletedFilesCount++;
        } catch (err: any) {
          console.error(`❌ Failed to delete file ${fileName}:`, err.message);
        }
      } else {
        console.log(`ℹ️ File not found on disk (already deleted): ${fileName}`);
      }
    }
  }

  console.log(`\nDisk cleanup complete. Deleted ${deletedFilesCount} file(s) from 'uploads/'.`);

  // 4. Purge all records from database tables
  console.log("\nPurging candidate records from the database...");

  // Delete from child tables first to avoid foreign key violations (some might not have cascade delete)
  await queryGlobal(`DELETE FROM candidate_timeline WHERE candidate_id = ANY($1);`, [candidateIds]);
  await queryGlobal(`DELETE FROM candidate_activity_logs WHERE candidate_id = ANY($1);`, [candidateIds]);
  await queryGlobal(`DELETE FROM candidate_job_matches WHERE candidate_id = ANY($1);`, [candidateIds]);
  await queryGlobal(`DELETE FROM candidate_match_history WHERE candidate_id = ANY($1);`, [candidateIds]);
  await queryGlobal(`DELETE FROM candidate_documents WHERE candidate_id = ANY($1);`, [candidateIds]);
  await queryGlobal(`DELETE FROM assessment_attempts WHERE candidate_id = ANY($1);`, [candidateIds]);
  await queryGlobal(`DELETE FROM interviews WHERE candidate_id = ANY($1);`, [candidateIds]);
  await queryGlobal(`DELETE FROM offers WHERE candidate_id = ANY($1);`, [candidateIds]);
  
  // Delete from candidates table
  const deleteCandidatesRes = await queryGlobal(`DELETE FROM candidates WHERE id = ANY($1);`, [candidateIds]);

  console.log(`Successfully purged ${deleteCandidatesRes.rowCount} candidate record(s) from database.`);
  console.log("\nCleanup workflow complete!");
}

main().catch(err => {
  console.error("Cleanup script failed:", err);
});
