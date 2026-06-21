// src/test/ingestionPhase3.ts
import { pool } from "../lib/db.js";

function getCookies(headers: Headers): string {
  const setCookies = headers.get("set-cookie");
  if (!setCookies) return "";
  const cookiesList: string[] = [];
  const parts = setCookies.split(/,(?=[a-zA-Z0-9_]+=)/);
  for (const part of parts) {
    const clean = part.trim().split(";")[0];
    if (clean) cookiesList.push(clean);
  }
  return cookiesList.join("; ");
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runIngestionTests() {
  console.log("🚀 Starting Phase 3 Ingestion & Job matching Verification Suite...");
  const base = "http://localhost:4000";

  // 1. Register a test tenant
  console.log("1. Registering Tenant...");
  const testEmail = `recruiter-${Date.now()}@ingestcorp.com`;
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      companyName: "Ingest Corp",
      userName: "Ingest Recruiter",
      email: testEmail,
      password: "Password123"
    })
  });
  
  if (!regRes.ok) {
    const text = await regRes.text();
    throw new Error(`Registration failed: ${text}`);
  }

  const cookie = getCookies(regRes.headers);
  const regData = await regRes.json() as any;
  const tenantId = regData.user.tenantId;
  const headers = { 
    "Cookie": cookie, 
    "Origin": "http://localhost:3000",
    "x-tenant-id": tenantId
  };

  // 2. Create a test job description
  console.log("2. Creating a test job...");
  const jobRes = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Senior Node.js Developer",
      description: "We are looking for a Senior Developer with experience in Node.js, TypeScript, PostgreSQL, and Redis. Candidates must have at least 5 years experience.",
      location: "San Francisco",
      experienceRequired: "5 years"
    })
  });
  const jobData = await jobRes.json() as any;
  const jobId = jobData.jobId;
  console.log(`Job Created: ${jobId}`);

  // 3. Test Ingesting a TXT resume
  console.log("3. Uploading resume...");
  
  // Prepare a dummy multipart file upload for testing
  const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  const filename = "Ingest_Candidate_Resume.txt";
  
  // Text resume content
  const textBody = 
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `Name: Ingest Candidate\nEmail: candidate.ingest@example.com\nPhone: 1234567890\nSkills: Node.js, TypeScript, SQL, Docker, Python\nYears Experience: 6\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="jobId"\r\n\r\n` +
    `${jobId}\r\n` +
    `--${boundary}--`;

  const uploadRes = await fetch(`${base}/api/resumes/upload`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body: textBody
  });

  const uploadData = await uploadRes.json() as any;
  console.log("Upload response code:", uploadRes.status, "Payload:", uploadData);
  if (!uploadData.success || uploadData.enqueuedIds.length === 0) {
    throw new Error("Resume upload failed.");
  }
  const inboxId = uploadData.enqueuedIds[0];

  // Poll for parsing & matching completion
  console.log("Polling for queue worker parsing and matching completion...");
  let matchedItem: any = null;
  for (let i = 0; i < 20; i++) {
    await delay(1000);
    const checkRes = await fetch(`${base}/api/inbox?status=Matched`, { headers });
    const checkData = await checkRes.json() as any;
    const item = checkData.data?.find((x: any) => x.id === inboxId);
    if (item) {
      matchedItem = item;
      console.log(`✅ Resume parsing completed successfully. Status: ${item.status}`);
      break;
    }
  }

  if (!matchedItem) {
    throw new Error("Queue worker timed out or failed to process the resume.");
  }

  const candidateId = matchedItem.candidate_id;

  // 4. Test Ingesting duplicate resume (to trigger duplicate detection logic)
  console.log("4. Uploading duplicate resume...");
  const dupUploadRes = await fetch(`${base}/api/resumes/upload`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body: textBody
  });
  const dupUploadData = await dupUploadRes.json() as any;
  const dupInboxId = dupUploadData.enqueuedIds[0];

  // Poll for duplicate status
  let dupItem: any = null;
  for (let i = 0; i < 20; i++) {
    await delay(1000);
    const checkRes = await fetch(`${base}/api/inbox?status=Duplicate`, { headers });
    const checkData = await checkRes.json() as any;
    const item = checkData.data?.find((x: any) => x.id === dupInboxId);
    if (item) {
      dupItem = item;
      console.log(`✅ Duplicate detection triggered successfully. Status: ${item.status}`);
      break;
    }
  }

  if (!dupItem) {
    throw new Error("Duplicate detection failed to catch duplicate upload.");
  }

  const duplicateCandidateId = dupItem.candidate_id;

  // Add notes, documents, submissions, timeline items on the duplicate candidate to verify they survive the merge
  console.log("Adding metadata on duplicate candidate...");
  await fetch(`${base}/api/candidates/${duplicateCandidateId}/notes`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ noteText: "Important interview prep note" })
  });

  // 5. Test merging candidates
  console.log("5. Triggering recruiter duplicate candidate merge...");
  const mergeRes = await fetch(`${base}/api/inbox/merge`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      primaryCandidateId: candidateId,
      duplicateCandidateId: duplicateCandidateId,
      reason: "Merging duplicate profiles"
    })
  });
  const mergeData = await mergeRes.json() as any;
  console.log("Merge response:", mergeData);
  if (!mergeData.success) {
    throw new Error("Recruiter candidate merge failed.");
  }

  // Verify that notes are preserved on primary candidate
  const notesRes = await fetch(`${base}/api/candidates/${candidateId}/notes`, { headers });
  const notesData = await notesRes.json() as any;
  const notes = notesData.notes || [];
  console.log("Primary candidate notes count after merge:", notes.length);
  if (notes.length === 0) {
    throw new Error("Notes were lost during candidate merge!");
  }
  console.log("✅ Candidate notes preserved successfully.");

  // 6. Test stats & email connection health endpoints
  console.log("6. Fetching queue SLA stats and email health...");
  const statsRes = await fetch(`${base}/api/inbox/stats`, { headers });
  const statsData = await statsRes.json() as any;
  console.log("SLA Counts & Files:", statsData.counts, statsData.storage);

  const healthRes = await fetch(`${base}/api/inbox/email-health`, { headers });
  const healthData = await healthRes.json() as any;
  console.log("Email Providers Health:", healthData.health);

  // 7. Clean up DB records
  console.log("7. Cleaning up test data from database...");
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
    console.log("Cleanup complete.");
  } finally {
    client.release();
    await pool.end();
  }

  console.log("\n🎉 Phase 3 Ingestion & Job matching Verification Suite passed successfully!");
  process.exit(0);
}

runIngestionTests().catch(err => {
  console.error("❌ Phase 3 Ingestion test failed with exception:", err);
  process.exit(1);
});
