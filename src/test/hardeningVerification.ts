import { spawn } from "child_process";
import { pool } from "../lib/db.js";
import { StorageManager } from "../lib/storage/StorageProvider.js";

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

async function runHardeningTests() {
  console.log("🚀 Starting Phase 3 Hardening & Cost Control Verification Suite...");
  const port = "4001";
  const base = `http://localhost:${port}`;

  console.log(`Starting test server on port ${port}...`);
  const serverProcess = spawn("npx", ["tsx", "src/api/server.ts"], {
    env: {
      ...process.env,
      PORT: port,
      RATE_LIMIT_TEST: "true"
    }
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server Stdout]: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Stderr]: ${data.toString().trim()}`);
  });

  // Wait for server to boot
  await delay(4000);

  let tenantId = "";
  try {
    // 1. Register a test tenant
    console.log("1. Registering Tenant...");
    const testEmail = `recruiter-${Date.now()}@hardeningcorp.com`;
    const regRes = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
      body: JSON.stringify({
        companyName: "Hardening Corp",
        userName: "Hardening Owner",
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
    tenantId = regData.user.tenantId;
    
    console.log(`Tenant registered successfully. ID: ${tenantId}`);

    const headers = {
      "Cookie": cookie,
      "Origin": "http://localhost:3000",
      "x-tenant-id": tenantId
    };

    // -------------------------------------------------------------
    // Test 1: Verify Credit Limits Enforcement (HTTP 402)
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: Credit Limits Enforcement ---");
    console.log("Setting credit balance to 0 in database...");
    await pool.query("UPDATE tenants SET credit_balance = 0 WHERE id = $1;", [tenantId]);

    console.log("Attempting to upload a resume with 0 credits...");
    const boundary = "----WebKitFormBoundaryHardeningTest";
    const textBody = 
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="Resume.txt"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `Hardening Test Resume Content\r\n` +
      `--${boundary}--`;

    const uploadRes = await fetch(`${base}/api/resumes/upload`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: textBody
    });

    console.log("Upload HTTP status:", uploadRes.status);
    const uploadData = await uploadRes.json() as any;
    console.log("Response payload:", uploadData);

    if (uploadRes.status !== 402) {
      throw new Error(`Expected HTTP 402 for exhausted credits, got ${uploadRes.status}`);
    }
    if (!uploadData.error.includes("Upgrade Plan Required")) {
      throw new Error(`Expected 'Upgrade Plan Required' message, got: ${uploadData.error}`);
    }
    console.log("✅ Credit limits enforcement verified successfully (402 Returned).");

    // -------------------------------------------------------------
    // Test 2: Verify Rate Limiting with Fail-Closed / 429
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Rate Limiting Enforcement ---");
    console.log("Sending login requests rapidly to trigger rate limiting (limit: 10 requests)...");
    let triggered429 = false;
    
    for (let i = 0; i < 15; i++) {
      const loginRes = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
        body: JSON.stringify({
          email: "nonexistent@user.com",
          password: "WrongPassword"
        })
      });
      
      if (loginRes.status === 429) {
        console.log(`Request #${i + 1} blocked. HTTP status: 429.`);
        const limitData = await loginRes.json() as any;
        console.log("Limit response:", limitData);
        triggered429 = true;
        break;
      }
    }

    if (!triggered429) {
      throw new Error("Failed to trigger rate limiting (HTTP 429) after multiple requests.");
    }
    console.log("✅ Rate limiting verified successfully (429 Returned).");

    // -------------------------------------------------------------
    // Test 3: Verify Storage Pruning & Audit Logging
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Storage Pruning & Audit Logging ---");
    console.log("Uploading an orphaned file directly to the storage provider...");
    const provider = StorageManager.getProvider();
    
    const fileMeta = await provider.uploadFile(tenantId, "orphan-test.txt", Buffer.from("Unreferenced storage file content"));
    console.log("Orphaned file uploaded key:", fileMeta.fileKey);

    console.log("Verifying file exists in storage list...");
    let files = await provider.listAllFiles(tenantId);
    const existsBefore = files.some(f => f.fileKey === fileMeta.fileKey);
    if (!existsBefore) {
      throw new Error("Orphaned file was not found in storage list before pruning.");
    }

    console.log("Triggering manual storage pruning via POST /api/health/prune-storage...");
    const pruneRes = await fetch(`${base}/api/health/prune-storage`, {
      method: "POST",
      headers
    });

    console.log("Prune response status:", pruneRes.status);
    const pruneData = await pruneRes.json() as any;
    console.log("Prune response payload:", pruneData);

    if (pruneRes.status !== 200 || !pruneData.success) {
      throw new Error(`Pruning request failed with status ${pruneRes.status}`);
    }

    console.log("Checking if file has been deleted from storage...");
    files = await provider.listAllFiles(tenantId);
    const existsAfter = files.some(f => f.fileKey === fileMeta.fileKey);
    if (existsAfter) {
      throw new Error("Orphaned file was not deleted during pruning job.");
    }
    console.log("Orphaned file successfully removed from storage.");

    console.log("Checking storage_audit_logs in database...");
    const logRes = await pool.query(
      "SELECT * FROM storage_audit_logs WHERE tenant_id = $1 AND file_key = $2 AND action = 'PRUNE';",
      [tenantId, fileMeta.fileKey]
    );
    if (logRes.rowCount === 0) {
      throw new Error("No audit log entry found for the pruned file in storage_audit_logs.");
    }
    console.log("Audit log found:", logRes.rows[0]);
    console.log("✅ Storage pruning and audit logging verified successfully.");

  } finally {
    // Kill the test server process
    console.log("Shutting down test server...");
    serverProcess.kill();

    if (tenantId) {
      console.log("\nCleaning up test data from database...");
      await pool.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
      console.log("Cleanup complete.");
    }

    await pool.end();
  }

  console.log("\n🎉 All Phase 3 Hardening Verification Tests passed successfully!");
  process.exit(0);
}

runHardeningTests().catch(async err => {
  console.error("❌ Phase 3 Hardening test failed with exception:", err);
  process.exit(1);
});
