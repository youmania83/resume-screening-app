// src/test/ingestTestLink.ts
import { IngestQueue } from "../lib/queue/ingestQueue.js";
import { queryGlobal } from "../lib/tenantDb.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

async function run() {
  const url = process.argv[2];
  if (!url) {
    console.error("Please provide a resume URL. Example: npx tsx src/test/ingestTestLink.ts https://drive.google.com/.../view");
    process.exit(1);
  }

  // Get the first tenant ID
  const tenantsRes = await queryGlobal("SELECT id FROM tenants LIMIT 1;");
  if (tenantsRes.rowCount === 0) {
    console.error("No tenants found in DB.");
    process.exit(1);
  }
  const tenantId = tenantsRes.rows[0].id;
  const inboxId = crypto.randomUUID();

  console.log(`Ingesting test URL: ${url}`);
  console.log(`Tenant ID: ${tenantId}`);
  console.log(`Inbox ID: ${inboxId}`);

  // Create inbox record
  await queryGlobal(
    `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, status, error_message, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Queued', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
    [
      inboxId, 
      tenantId, 
      `Cloud_Resume_${inboxId}.url`, 
      url, 
      "Queued via test script."
    ]
  );

  // Write the temp txt metadata file
  const ext = ".txt";
  const textContent = `Resume Link: ${url}\nSender: candidate_test@example.com\nSubject: Test Cloud Link Ingestion\n\nEmail Body:\nPlease review my resume at the link.`;
  const uploadsDir = path.resolve("uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  const tempPath = path.join(uploadsDir, `${inboxId}${ext}`);
  fs.writeFileSync(tempPath, textContent);

  // Enqueue
  await IngestQueue.enqueue(tenantId, inboxId, tempPath, "text/plain");
  console.log("Successfully enqueued job. Monitor the background worker logs to see it download and parse!");
  process.exit(0);
}

run().catch((e) => {
  console.error("Ingestion failed:", e);
  process.exit(1);
});
