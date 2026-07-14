// src/test/cleanJunkFiles.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

const BLACKLIST_KEYWORDS = [
  "payslip", "pay slip", "pay_slip", "salary",
  "challan", "ecr", "gst", "tax", "audit", "balance",
  "ticket", "boarding", "flight", "booking", "travel", "paid",
  "invoice", "receipt", "bill", "payment", "transaction", "voucher", "statement", "ledger", "wallet", "bank", "account details",
  "scan", "mri", "xray", "medical", "prescription",
  "tender", "agreement", "contract", "proposal",
  "issue", "incident", "log", "report", "reports",
  "program", "training", "certificate", "course"
];

async function main() {
  console.log("=== RUNNING JUNK DOCUMENTS CLEANUP ON DATABASE ===");

  // Fetch all inbox files
  const res = await queryGlobal("SELECT id, candidate_id, file_name, file_url FROM resume_inbox;");
  console.log(`Analyzing ${res.rowCount} total records in resume_inbox...`);

  const junkInboxIds: string[] = [];
  const junkCandidateIds: string[] = [];
  const deletedFiles: string[] = [];

  for (const row of res.rows) {
    const fileName = (row.file_name || "").toLowerCase();
    
    // Check if filename contains any blacklist keyword
    let isJunk = false;
    for (const keyword of BLACKLIST_KEYWORDS) {
      if (fileName.includes(keyword)) {
        isJunk = true;
        break;
      }
    }

    if (fileName.includes(" to ")) {
      isJunk = true;
    }

    if (isJunk) {
      console.log(`📍 Found junk record: "${row.file_name}" (ID: ${row.id})`);
      junkInboxIds.push(row.id);
      deletedFiles.push(row.file_name);
      if (row.candidate_id) {
        junkCandidateIds.push(row.candidate_id);
      }
    }
  }

  if (junkInboxIds.length === 0) {
    console.log("No junk records found. Database is already clean!");
    return;
  }

  console.log(`\nPurging ${junkInboxIds.length} junk records and ${junkCandidateIds.length} candidates...`);

  if (junkCandidateIds.length > 0) {
    await queryGlobal(`DELETE FROM candidate_activity_logs WHERE candidate_id = ANY($1);`, [junkCandidateIds]);
    await queryGlobal(`DELETE FROM candidates WHERE id = ANY($1);`, [junkCandidateIds]);
  }
  await queryGlobal(`DELETE FROM resume_inbox WHERE id = ANY($1);`, [junkInboxIds]);

  console.log("\nCleanup successfully completed!");
  console.log("Purged files:", deletedFiles);
}

main().catch(err => {
  console.error("Cleanup failed:", err);
});
