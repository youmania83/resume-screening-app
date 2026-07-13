// src/test/reprocessAllCloudResumes.ts
import { IngestQueue } from "../lib/queue/ingestQueue.js";
import { queryGlobal } from "../lib/tenantDb.js";
import fs from "fs";
import path from "path";

async function run() {
  // Query all cloud resumes
  const res = await queryGlobal(
    `SELECT id, tenant_id, file_name, file_url 
     FROM resume_inbox 
     WHERE file_name LIKE 'Cloud_Resume_%.url';`
  );

  console.log(`[Reprocessor] Found ${res.rowCount} cloud resume(s) to reprocess.`);

  for (const row of res.rows) {
    const inboxId = row.id;
    const tenantId = row.tenant_id;
    const url = row.file_url;

    console.log(`[Reprocessor] Re-queueing inbox item ${inboxId} with URL: ${url}`);

    // Update inbox status back to Queued
    await queryGlobal(
      `UPDATE resume_inbox 
       SET status = 'Queued', error_message = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1;`,
      [inboxId]
    );

    // Re-create the temporary metadata txt file
    const ext = ".txt";
    const textContent = `Resume Link: ${url}\nSender: candidate_reprocess@example.com\nSubject: Reprocessing Cloud Link\n\nEmail Body:\nPlease review my resume at: ${url}`;
    const uploadsDir = path.resolve("uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
    const tempPath = path.join(uploadsDir, `${inboxId}${ext}`);
    fs.writeFileSync(tempPath, textContent);

    // Enqueue back into BullMQ
    await IngestQueue.enqueue(tenantId, inboxId, tempPath, "text/plain");
  }

  console.log("[Reprocessor] All cloud resumes enqueued successfully. Monitor worker logs to verify.");
  process.exit(0);
}

run().catch((e) => {
  console.error("[Reprocessor] Reprocessing failed:", e);
  process.exit(1);
});
