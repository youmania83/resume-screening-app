// src/test/loadTestPhase3.ts
import { pool } from "../lib/db.js";
import { performance } from "perf_hooks";

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

async function bulkInsertRecruiters(client: any, tenantId: string, count: number) {
  const rows: string[] = [];
  const params: any[] = [];
  
  for (let idx = 0; idx < count; idx++) {
    const uId = `user-load-${idx}-${tenantId.substring(0, 8)}`;
    const name = `Recruiter Load ${idx}`;
    const email = `recruiter.load.${idx}.${Date.now()}@staffload.com`;
    const passwordHash = "$2b$10$dummyhashplaceholderforloadtestingonly";
    const role = "recruiter";
    
    const pIdx = params.length;
    params.push(uId, tenantId, name, email, passwordHash, role);
    rows.push(`($${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6})`);
  }
  
  const query = `
    INSERT INTO users (id, tenant_id, name, email, password_hash, role)
    VALUES ${rows.join(', ')};
  `;
  await client.query(query, params);
}

async function bulkInsertJobs(client: any, tenantId: string, count: number) {
  const batchSize = 250;
  for (let i = 0; i < count; i += batchSize) {
    const rows: string[] = [];
    const params: any[] = [];
    const currentBatchSize = Math.min(batchSize, count - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const idx = i + j;
      const jId = `job-load-${idx}-${tenantId.substring(0, 8)}`;
      const title = idx % 2 === 0 ? "Node.js Developer" : "Python Developer";
      const description = `We are looking for a ${title} with proficiency in modern frameworks like React, Express, and databases.`;
      const dept = "Engineering";
      const loc = idx % 2 === 0 ? "San Francisco" : "Remote";
      const expReq = `${2 + (idx % 8)} years`;
      
      const pIdx = params.length;
      params.push(jId, tenantId, title, description, dept, loc, expReq);
      rows.push(`($${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7})`);
    }
    const query = `
      INSERT INTO jobs (id, tenant_id, title, description, department, location, experience_required)
      VALUES ${rows.join(', ')};
    `;
    await client.query(query, params);
  }
}

async function bulkInsertCandidates(client: any, tenantId: string, count: number, firstJobId: string) {
  const batchSize = 1000;
  for (let i = 0; i < count; i += batchSize) {
    const rows: string[] = [];
    const params: any[] = [];
    const currentBatchSize = Math.min(batchSize, count - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const idx = i + j;
      const cId = `cand-load-${idx}-${tenantId.substring(0, 8)}`;
      const name = `Load Candidate ${idx}`;
      const email = `cand.load.${idx}@loadcorp.com`;
      const phone = `555-01${idx.toString().padStart(4, '0')}`;
      const role = idx % 2 === 0 ? "Node.js Developer" : "Python Developer";
      const score = 60 + (idx % 41); // 60 to 100
      const matchPercent = score;
      const expYears = 1 + (idx % 15);
      const status = idx % 10 === 0 ? "Applied" : (idx % 10 === 1 ? "Shortlisted" : "Applied");
      const appSource = idx % 3 === 0 ? "LinkedIn" : (idx % 3 === 1 ? "Indeed" : "Manual");
      const appliedDate = "2026-06-01";
      
      const pIdx = params.length;
      params.push(cId, tenantId, name, email, phone, role, score, matchPercent, expYears, status, appSource, appliedDate, firstJobId);
      
      rows.push(`($${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7}, $${pIdx+8}, $${pIdx+9}, $${pIdx+10}, $${pIdx+11}, $${pIdx+12}, $${pIdx+13})`);
    }
    
    const query = `
      INSERT INTO candidates (id, tenant_id, name, email, phone, role, score, match_percent, experience_years, status, application_source, applied_date, job_id)
      VALUES ${rows.join(', ')};
    `;
    await client.query(query, params);
  }
}

async function bulkInsertMatches(client: any, tenantId: string, count: number) {
  const batchSize = 1000;
  for (let i = 0; i < count; i += batchSize) {
    const rows: string[] = [];
    const params: any[] = [];
    const currentBatchSize = Math.min(batchSize, count - i);
    
    for (let j = 0; j < currentBatchSize; j++) {
      const idx = i + j;
      const cId = `cand-load-${idx}-${tenantId.substring(0, 8)}`;
      const jId = `job-load-${idx % 10}-${tenantId.substring(0, 8)}`;
      const matchScore = 60 + (idx % 41);
      
      const pIdx = params.length;
      params.push(tenantId, cId, jId, matchScore);
      rows.push(`($${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4})`);
    }
    const query = `
      INSERT INTO candidate_job_matches (tenant_id, candidate_id, job_id, match_score)
      VALUES ${rows.join(', ')}
      ON CONFLICT (candidate_id, job_id) DO NOTHING;
    `;
    await client.query(query, params);
  }
}

async function runLoadTest() {
  console.log("🔥 Initiating Phase 3 Scale & Performance Load Test...");
  const base = "http://localhost:4000";
  const uniqueId = `load-${Date.now()}`;

  // 1. Register Tenant (Gets cookies/headers)
  console.log("1. Creating load test Tenant...");
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      companyName: `Scale Corporation ${uniqueId}`,
      userName: "Scale Manager",
      email: `manager-${uniqueId}@scalecorp.com`,
      password: "Password123"
    })
  });

  if (!regRes.ok) {
    throw new Error(`Tenant registration failed with status ${regRes.status}`);
  }

  const cookie = getCookies(regRes.headers);
  const regData = await regRes.json() as any;
  const tenantId = regData.user.tenantId;
  const headers = { 
    "Cookie": cookie,
    "Origin": "http://localhost:3000",
    "x-tenant-id": tenantId 
  };

  console.log(`Tenant registered successfully. ID: ${tenantId}`);

  // Connect directly to populate DB at scale
  const client = await pool.connect();
  try {
    // 2. Generate 500 Recruiters
    console.log("2. Populating 500 recruiters...");
    const tRecStart = performance.now();
    await bulkInsertRecruiters(client, tenantId, 500);
    console.log(`Recruiters inserted in ${(performance.now() - tRecStart).toFixed(2)}ms`);

    // 3. Generate 5,000 Jobs
    console.log("3. Populating 5,000 jobs...");
    const tJobStart = performance.now();
    await bulkInsertJobs(client, tenantId, 5000);
    console.log(`Jobs inserted in ${(performance.now() - tJobStart).toFixed(2)}ms`);

    const firstJobId = `job-load-0-${tenantId.substring(0, 8)}`;

    // 4. Generate 50,000 Candidates
    console.log("4. Populating 50,000 candidates...");
    const tCandStart = performance.now();
    await bulkInsertCandidates(client, tenantId, 50000, firstJobId);
    console.log(`Candidates inserted in ${(performance.now() - tCandStart).toFixed(2)}ms`);

    // 5. Generate 50,000 Candidate-Job Matches
    console.log("5. Populating 50,000 candidate-job matches...");
    const tMatchStart = performance.now();
    await bulkInsertMatches(client, tenantId, 50000);
    console.log(`Matches inserted in ${(performance.now() - tMatchStart).toFixed(2)}ms`);

    console.log("\n🚀 DB Scale Population completed. Commencing latency measurements...");

    // 6. Measure Search Speed
    console.log("\n--- Latency Test 1: Search Speed ---");
    const tSearchStart = performance.now();
    const searchRes = await fetch(`${base}/api/candidates?search=Candidate 5000&limit=50`, { headers });
    const searchData = await searchRes.json() as any;
    const tSearchEnd = performance.now() - tSearchStart;
    console.log(`- Normal Search API latency: ${tSearchEnd.toFixed(2)}ms (Found: ${searchData.candidates?.length || 0} rows)`);

    const tBoolStart = performance.now();
    const boolRes = await fetch(`${base}/api/candidates?booleanSearch=Node.js AND Developer&limit=50`, { headers });
    const boolData = await boolRes.json() as any;
    const tBoolEnd = performance.now() - tBoolStart;
    console.log(`- Boolean Search API latency: ${tBoolEnd.toFixed(2)}ms (Found: ${boolData.candidates?.length || 0} rows)`);

    // 7. Measure Dashboard Speed
    console.log("\n--- Latency Test 2: Dashboard Speed ---");
    const tDashStart = performance.now();
    const dashRes = await fetch(`${base}/api/dashboard/metrics`, { headers });
    const _dashData = await dashRes.json() as any;
    const tDashEnd = performance.now() - tDashStart;
    console.log(`- Recruiter Dashboard Metrics latency: ${tDashEnd.toFixed(2)}ms`);

    // 8. Measure Candidate Profile Speed
    console.log("\n--- Latency Test 3: Candidate Profile Loading ---");
    const tProfileStart = performance.now();
    const candId = `cand-load-5000-${tenantId.substring(0, 8)}`;
    const profileRes = await fetch(`${base}/api/candidates/${candId}`, { headers });
    const profileData = await profileRes.json() as any;
    const tProfileEnd = performance.now() - tProfileStart;
    console.log(`- Candidate Profile API latency: ${tProfileEnd.toFixed(2)}ms (Name: ${profileData.candidate?.name || 'none'})`);

    // 9. Measure Queue Ingestion Throughput (upload API response time)
    console.log("\n--- Latency Test 4: Queue Throughput Ingestion ---");
    const boundary = "----WebKitFormBoundaryLoadBoundary789";
    const filename = "Load_Test_Candidate.txt";
    const textBody = 
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `Name: Load Candidate\nEmail: cand.load.test.queue@example.com\nPhone: 1234567890\nSkills: React, Node.js\r\n` +
      `--${boundary}--`;

    const tQueueStart = performance.now();
    const uploadRes = await fetch(`${base}/api/resumes/upload`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: textBody
    });
    const uploadData = await uploadRes.json() as any;
    const tQueueEnd = performance.now() - tQueueStart;
    console.log(`- Async Ingest Queue upload API response latency: ${tQueueEnd.toFixed(2)}ms (Enqueued IDs: ${uploadData.enqueuedIds?.length || 0})`);

    // Latency validations
    console.log("\n--- Latency Performance Target Verifications ---");
    let targetPassed = true;
    
    if (tSearchEnd < 1000) {
      console.log(`✅ Search Speed: ${tSearchEnd.toFixed(2)}ms (Target: < 1000ms)`);
    } else {
      console.error(`❌ Search Speed: ${tSearchEnd.toFixed(2)}ms (Target: < 1000ms)`);
      targetPassed = false;
    }

    if (tDashEnd < 2000) {
      console.log(`✅ Dashboard Speed: ${tDashEnd.toFixed(2)}ms (Target: < 2000ms)`);
    } else {
      console.error(`❌ Dashboard Speed: ${tDashEnd.toFixed(2)}ms (Target: < 2000ms)`);
      targetPassed = false;
    }

    if (tProfileEnd < 1000) {
      console.log(`✅ Candidate Profile Speed: ${tProfileEnd.toFixed(2)}ms (Target: < 1000ms)`);
    } else {
      console.error(`❌ Candidate Profile Speed: ${tProfileEnd.toFixed(2)}ms (Target: < 1000ms)`);
      targetPassed = false;
    }

    if (targetPassed) {
      console.log("\n🎉 ALL PHASE 3 PERFORMANCE LATENCY TARGETS PASSED SUCCESSFULLY!");
    } else {
      console.error("\n❌ SOME LATENCY TARGETS FAILED THE REQUIRED SLA CRITERIA.");
      process.exit(1);
    }

  } finally {
    // 10. Teardown
    console.log("\n10. Cleaning up load test data (Cascading delete)...");
    await client.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
    console.log("Cleanup complete.");
    client.release();
    await pool.end();
  }
}

runLoadTest().catch(err => {
  console.error("❌ Scale & Performance Load Test failed with exception:", err);
  process.exit(1);
});
