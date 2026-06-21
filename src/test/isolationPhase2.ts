// src/test/isolationPhase2.ts
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

async function runIsolationTests() {
  console.log("🚀 Starting Phase 2 Tenant Isolation Penetration Tests...");
  const base = "http://localhost:4000";

  // 1. Register Tenant A
  console.log("1. Registering Tenant A...");
  const regARes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      companyName: "Tenant A Corp",
      userName: "Owner A",
      email: "ownera@tenant-iso.com",
      password: "Password123"
    })
  });
  const cookieA = getCookies(regARes.headers);
  const dataA = await regARes.json() as any;
  const tenantIdA = dataA.user.tenantId;

  // 2. Register Tenant B
  console.log("2. Registering Tenant B...");
  const regBRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      companyName: "Tenant B Corp",
      userName: "Owner B",
      email: "ownerb@tenant-iso.com",
      password: "Password123"
    })
  });
  const cookieB = getCookies(regBRes.headers);
  const dataB = await regBRes.json() as any;
  const tenantIdB = dataB.user.tenantId;

  // 3. Create Candidate under Tenant B
  console.log("3. Creating candidate under Tenant B...");
  const candidateIdB = "cand-iso-b";
  await fetch(`${base}/api/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieB, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      id: candidateIdB,
      name: "Alice Isolation",
      email: "alice@isolation.com",
      role: "Sales Engineer",
      score: 80
    })
  });

  // 4. Create Note under Tenant B
  console.log("4. Creating note on Candidate B using Tenant B's cookies...");
  const noteBRes = await fetch(`${base}/api/candidates/${candidateIdB}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieB, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ noteText: "Private internal tag/note" })
  });
  const noteBData = await noteBRes.json() as any;
  const noteIdB = noteBData.noteId;
  console.log("Note B Created status:", noteBRes.status, "ID:", noteIdB);

  // 5. Penetration Attempt: Read Notes of Candidate B using Tenant A's cookies
  console.log("\n5. Penetration Attempt: Reading Tenant B's Candidate Notes from Tenant A...");
  const getNotesRes = await fetch(`${base}/api/candidates/${candidateIdB}/notes`, {
    headers: { "Cookie": cookieA, "Origin": "http://localhost:3000" }
  });
  console.log("Access status:", getNotesRes.status); // Expected: 404 (Not Found, candidate not resolved)
  const getNotesData = await getNotesRes.json() as any;
  console.log("Response payload:", getNotesData);

  // 6. Penetration Attempt: Append Note to Candidate B using Tenant A's cookies
  console.log("\n6. Penetration Attempt: Posting Note on Tenant B's Candidate from Tenant A...");
  const postNotesRes = await fetch(`${base}/api/candidates/${candidateIdB}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieA, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ noteText: "Hacked comment" })
  });
  console.log("Access status:", postNotesRes.status); // Expected: 404
  const postNotesData = await postNotesRes.json() as any;
  console.log("Response payload:", postNotesData);

  // 7. Penetration Attempt: Pin Note of Candidate B using Tenant A's cookies
  console.log("\n7. Penetration Attempt: Pinning Tenant B's Note from Tenant A...");
  const pinRes = await fetch(`${base}/api/candidates/${candidateIdB}/notes/${noteIdB}/pin`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Cookie": cookieA, "Origin": "http://localhost:3000" },
    body: JSON.stringify({ isPinned: true })
  });
  console.log("Access status:", pinRes.status); // Expected: 404
  const pinData = await pinRes.json() as any;
  console.log("Response payload:", pinData);

  // 8. Clean up test DB data
  console.log("\n8. Cleaning up isolation test data...");
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM tenants WHERE id IN ($1, $2);", [tenantIdA, tenantIdB]);
    console.log("Cleanup finished.");
  } finally {
    client.release();
    await pool.end();
  }

  console.log("\n🎉 All Phase 2 Tenant Isolation tests completed successfully!");
  process.exit(0);
}

runIsolationTests().catch(err => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
