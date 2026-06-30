// src/test/verifyEmailRouting.ts
import { pool } from "../lib/db.js";
import { EmailSyncService } from "../integrations/email/EmailSyncService.js";
import { queryGlobal } from "../lib/tenantDb.js";
import crypto from "crypto";

async function runEmailRoutingVerification() {
  console.log("🚀 Starting Email Routing & JD/Resume Classification Verification...");

  const uniqueId = `test-email-${Date.now()}`;
  const tenantId = `tenant-${uniqueId}`;

  try {
    // 1. Setup Test Tenant
    console.log(`\n1. Setting up Test Tenant: ${tenantId}`);
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, $2);", [tenantId, `Test Email Sync Corp ${uniqueId}`]);

    // 2. Perform mailbox sync with 'mock' provider
    console.log("\n2. Syncing mock mailbox (classification, JD extraction, Resume attachment + link parsing)...");
    const count = await EmailSyncService.syncMailbox(tenantId, "mock");
    console.log(`EmailSyncService.syncMailbox returned count: ${count}`);

    // We expect:
    // Email 1: Resume application for "Python Developer" (creates 1 attachment resume_inbox record, targetJobId=null since job doesn't exist yet)
    // Email 2: Job Description for "React Architect" (creates a new Job profile "React Architect")
    // Email 3: Resume application for "Product Manager" containing resume link (creates 1 link resume_inbox record)

    // 3. Verify Job Description Intake (React Architect)
    console.log("\n3. Verifying Job Ingest (React Architect)...");
    const jobRes = await pool.query(
      "SELECT * FROM jobs WHERE tenant_id = $1 AND title = $2;",
      [tenantId, "React Architect"]
    );

    if (jobRes.rowCount === 0) {
      throw new Error("❌ FAIL: React Architect Job Description was not created in the database.");
    }
    const createdJob = jobRes.rows[0];
    console.log(`✅ SUCCESS: Job created successfully! ID: ${createdJob.id}, Location: ${createdJob.location}, Work Mode: ${createdJob.work_mode}`);

    // 4. Verify Resume Ingestion & Link Extraction
    console.log("\n4. Verifying Resume Inbox records...");
    const inboxRes = await pool.query(
      "SELECT * FROM resume_inbox WHERE tenant_id = $1 ORDER BY created_at ASC;",
      [tenantId]
    );

    if (inboxRes.rowCount !== 2) {
      throw new Error(`❌ FAIL: Expected 2 resume inbox records, but found ${inboxRes.rowCount}.`);
    }

    const rec1 = inboxRes.rows[0];
    const rec2 = inboxRes.rows[1];

    console.log(`✅ SUCCESS: Found ${inboxRes.rowCount} resume inbox records.`);
    console.log(`  - Record 1 File: ${rec1.file_name}, Status: ${rec1.status}`);
    console.log(`  - Record 2 File: ${rec2.file_name}, Status: ${rec2.status}, URL/Link: ${rec2.file_url}`);

    // Verify link detection
    if (!rec2.file_url.includes("drive.google.com")) {
      throw new Error("❌ FAIL: Bruce Wayne's Google Drive link was not extracted into the file_url field.");
    }
    console.log("✅ SUCCESS: Google Drive resume link successfully extracted from email body.");

    // Clean up
    console.log("\n5. Cleaning up test data...");
    await pool.query("DELETE FROM resume_inbox WHERE tenant_id = $1;", [tenantId]);
    await pool.query("DELETE FROM jobs WHERE tenant_id = $1;", [tenantId]);
    await pool.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
    console.log("✅ Cleanup complete.");

    console.log("\n⭐️ ALL EMAIL ROUTING VERIFICATION TASKS PASSED SUCCESSFULLY! ⭐️");
  } catch (err: any) {
    console.error("\n❌ VERIFICATION FAILED:", err.message || err);
    // Try cleaning up anyway
    try {
      await pool.query("DELETE FROM resume_inbox WHERE tenant_id = $1;", [tenantId]);
      await pool.query("DELETE FROM jobs WHERE tenant_id = $1;", [tenantId]);
      await pool.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
    } catch {}
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runEmailRoutingVerification();
