// src/test/runInboxSync.ts
import dotenv from "dotenv";
import { EmailSyncService } from "../integrations/email/EmailSyncService.js";
import { pool } from "../lib/db.js";

dotenv.config();

const TARGET_TENANT_ID = "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";

async function runSync() {
  console.log(`🚀 Starting mailbox sync for tenant: ${TARGET_TENANT_ID} using Zoho IMAP...`);
  try {
    const count = await EmailSyncService.syncMailbox(TARGET_TENANT_ID, "zoho");
    console.log(`\n✅ Sync complete! Ingested/Processed count: ${count}`);

    // Let's check the resume_inbox table for any newly queued items
    const res = await pool.query(
      "SELECT id, file_name, status, error_message, created_at FROM resume_inbox WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10;",
      [TARGET_TENANT_ID]
    );

    console.log(`\n📋 Recent Items in Resume Inbox (Total: ${res.rowCount}):`);
    if (res.rowCount > 0) {
      res.rows.forEach((row, idx) => {
        console.log(`  [${idx + 1}] File: ${row.file_name}`);
        console.log(`      Status: ${row.status}`);
        console.log(`      Created: ${row.created_at.toISOString()}`);
        if (row.error_message) console.log(`      Error: ${row.error_message}`);
      });
    } else {
      console.log("  No resume applications found in the sync queue yet.");
    }
  } catch (err: any) {
    console.error("❌ Mailbox sync failed:");
    console.error(err.message || err);
  } finally {
    await pool.end();
  }
}

runSync();
