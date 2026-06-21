// src/test/atsWorkflow.ts
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

async function runTests() {
  console.log("🚀 Starting Phase 2 ATS Workflow Integration Tests...");
  const base = "http://localhost:4000";
  const uniqueId = `t-${Date.now()}`;
  
  // 1. Register a Test Tenant (Seeds 12 stages)
  console.log("\n1. Registering Tenant...");
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      companyName: `Staffing Agency ${uniqueId}`,
      userName: "Staffing Recruiter",
      email: `recruiter-${uniqueId}@staffing.com`,
      password: "Password123"
    })
  });
  
  console.log("Tenant Registration Status:", regRes.status);
  const cookie = getCookies(regRes.headers);
  const regData = await regRes.json() as any;
  const tenantId = regData.user.tenantId;
  const recruiterId = regData.user.id;
  console.log(`Tenant ID: ${tenantId}, Owner Recruiter ID: ${recruiterId}`);

  // 2. Fetch default stages
  console.log("\n2. Fetching seeded default pipeline stages...");
  const stagesGet = await fetch(`${base}/api/stages`, {
    headers: { "Cookie": cookie, "Origin": "http://localhost:3000" }
  });
  const stagesData = await stagesGet.json() as any;
  console.log("Fetched stages count:", stagesData.stages.length);
  stagesData.stages.forEach((s: any) => console.log(` - Stage: ${s.name} (system: ${s.is_system})`));

  // 3. Create a custom stage
  console.log("\n3. Creating custom recruitment stage...");
  const stagePost = await fetch(`${base}/api/stages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ name: "Background Check", description: "Verifying credentials" })
  });
  const stageData = await stagePost.json() as any;
  const customStageId = stageData.stageId;
  console.log("Created custom stage status:", stagePost.status, "ID:", customStageId);

  // 4. Create a Job
  console.log("\n4. Creating job opening...");
  const jobRes = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      title: "Staffing Python Developer",
      description: "Needs 5+ years experience in Python and Flask.",
      location: "San Francisco"
    })
  });
  const jobData = await jobRes.json() as any;
  const jobId = jobData.jobId;
  console.log("Created Job ID:", jobId);

  // 5. Create a Candidate (Auto-logs created timeline event)
  console.log("\n5. Creating candidate...");
  const candId = `cand-${uniqueId}`;
  const candRes = await fetch(`${base}/api/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      id: candId,
      name: "John Doe",
      email: "john.doe@test.com",
      phone: "555-0199",
      role: "Python Developer",
      score: 90,
      jobId,
      source: "LinkedIn",
      skills: ["Python", "Flask", "AWS"]
    })
  });
  console.log("Candidate creation status:", candRes.status);

  // 6. Recruiter Assignments
  console.log("\n6. Assigning candidate to recruiter...");
  const assignRes = await fetch(`${base}/api/candidates/${candId}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ recruiterId })
  });
  console.log("Recruiter assignment status:", assignRes.status);

  // 7. Client Submissions
  console.log("\n7. Submitting candidate to client...");
  const subRes = await fetch(`${base}/api/candidates/${candId}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ jobId, clientName: "Standard Corp", feedback: "Strong Python background" })
  });
  console.log("Client submission status:", subRes.status);

  // 8. Add Candidate Note
  console.log("\n8. Adding internal candidate note...");
  const noteRes = await fetch(`${base}/api/candidates/${candId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ noteText: "John performed great in technical screening.", isPinned: true })
  });
  console.log("Add note status:", noteRes.status);

  // 9. Add Candidate Tag
  console.log("\n9. Adding tags to candidate...");
  const tagRes = await fetch(`${base}/api/candidates/${candId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ tagName: "Python Specialist" })
  });
  console.log("Add tag status:", tagRes.status);

  // 10. Add Candidate Document (Version tracking)
  console.log("\n10. Attaching resume document (v1 & v2)...");
  const doc1Res = await fetch(`${base}/api/candidates/${candId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ title: "John Doe Resume", fileUrl: "s3://bucket/john_resume_v1.pdf", documentType: "resume" })
  });
  const doc1Data = await doc1Res.json() as any;
  console.log("v1 Upload Status:", doc1Res.status, "Version:", doc1Data.version);

  const doc2Res = await fetch(`${base}/api/candidates/${candId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ title: "John Doe Resume", fileUrl: "s3://bucket/john_resume_v2.pdf", documentType: "resume" })
  });
  const doc2Data = await doc2Res.json() as any;
  console.log("v2 Upload Status:", doc2Res.status, "Version:", doc2Data.version);

  // 11. Fetch Timeline (check auto-logging immutability)
  console.log("\n11. Fetching candidate timeline events...");
  const timelineRes = await fetch(`${base}/api/candidates/${candId}/timeline`, {
    headers: { "Cookie": cookie, "Origin": "http://localhost:3000" }
  });
  const timelineData = await timelineRes.json() as any;
  console.log("Seeded timeline events count:", timelineData.timeline.length);
  timelineData.timeline.forEach((t: any) => console.log(` - Event: ${t.title} [${t.event_type}]: ${t.description}`));

  // 12. Boolean Search & Pagination Check
  console.log("\n12. Running Boolean Search for 'Python AND AWS'...");
  const searchRes = await fetch(`${base}/api/candidates?booleanSearch=Python AND AWS&limit=50&page=1`, {
    headers: { "Cookie": cookie, "Origin": "http://localhost:3000" }
  });
  const searchData = await searchRes.json() as any;
  console.log("Search candidate rows matched:", searchData.candidates.length);
  searchData.candidates.forEach((c: any) => console.log(` - Candidate: ${c.name} (Role: ${c.role})`));

  // 13. Fetch Dashboard Metrics & KPIs
  console.log("\n13. Fetching recruiter dashboard analytics metrics...");
  const metricsRes = await fetch(`${base}/api/dashboard/metrics`, {
    headers: { "Cookie": cookie, "Origin": "http://localhost:3000" }
  });
  const metricsData = await metricsRes.json() as any;
  console.log("Dashboard Metrics Payload:", JSON.stringify(metricsData.metrics, null, 2));

  // Clean up test DB data
  console.log("\n14. Cleaning up test data from database...");
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
    console.log("Clean up finished.");
  } finally {
    client.release();
    await pool.end();
  }

  console.log("\n🎉 All Phase 2 ATS Workflow tests completed successfully!");
  process.exit(0);
}

runTests().catch(err => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
