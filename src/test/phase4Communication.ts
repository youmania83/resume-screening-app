// src/test/phase4Communication.ts
import { pool } from "../lib/db.js";
import crypto from "crypto";

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

async function runCommunicationTests() {
  console.log("🚀 Starting Phase 4 Communication & Scheduling Integration Tests...");
  const base = "http://localhost:4000";

  // 1. Register Recruiter Tenant
  console.log("\n--- 1. Registering Recruiter Tenant ---");
  const recruiterEmailStr = `yogesh-${Date.now()}@isonscheduling.com`;
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      companyName: "Rison Scheduling Inc",
      userName: "Yogesh Wadhwa",
      email: recruiterEmailStr,
      password: "Password123"
    })
  });
  
  if (!regRes.ok) {
    throw new Error(`Failed to register test tenant: ${await regRes.text()}`);
  }
  
  const cookie = getCookies(regRes.headers);
  const regData = await regRes.json() as any;
  const tenantId = regData.user.tenantId;
  console.log(`Registered Tenant: ${tenantId}`);

  // Create a job
  console.log("\n--- Creating Test Job ---");
  const jobId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO jobs (id, tenant_id, title, description, department, location)
     VALUES ($1, $2, 'Staff Software Engineer', 'Design calendars and portals', 'Engineering', 'Remote');`,
    [jobId, tenantId]
  );

  // Create a candidate with assessment_token
  console.log("\n--- Creating Test Candidate ---");
  const candidateId = crypto.randomUUID();
  const assessmentToken = `test-token-portal-${Date.now()}`;
  await pool.query(
    `INSERT INTO candidates (id, tenant_id, name, email, role, score, match_percent, experience_years, status, assessment_token, applied_date, job_id, final_score, application_source)
     VALUES ($1, $2, 'Bruce Wayne', 'bruce@waynecorp.com', 'Staff Software Engineer', 85, 85, 5, 'applied', $3, '2026-06-18 11:20:00', $4, 85, 'Direct Sourcing');`,
    [candidateId, tenantId, assessmentToken, jobId]
  );

  // Create a scheduled interview for candidate portal tests
  const interviewId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO interviews (id, tenant_id, candidate_id, scheduled_date, status, feedback)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day', 'scheduled', 'Initial HR chat');`,
    [interviewId, tenantId, candidateId]
  );

  // 2. Candidate Portal Tests (Unauthenticated guest endpoint check)
  console.log("\n--- 2. Candidate Portal Guest Endpoints ---");
  
  // GET /api/candidate-portal/:token
  console.log("GET Candidate Portal Status...");
  const portalGetRes = await fetch(`${base}/api/candidate-portal/${assessmentToken}`);
  console.log("Portal GET status:", portalGetRes.status);
  const portalData = await portalGetRes.json() as any;
  console.log("Candidate Name:", portalData.candidate.name);
  console.log("Job Title:", portalData.job.title);
  console.log("Interviews Count:", portalData.interviews.length);
  console.log("Branding companyName:", portalData.branding?.companyName);
  console.log("Branding primaryColor:", portalData.branding?.primaryColor);
  if (portalData.candidate.name !== "Bruce Wayne" || portalData.job.title !== "Staff Software Engineer") {
    throw new Error("Candidate Portal GET returned incorrect data.");
  }
  if (portalData.branding?.companyName !== "Rison Scheduling Inc") {
    throw new Error("Candidate Portal branding company name is incorrect.");
  }

  // POST /api/candidate-portal/:token/confirm
  console.log("POST Candidate Confirms Slot...");
  const confirmRes = await fetch(`${base}/api/candidate-portal/${assessmentToken}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({ interviewId })
  });
  console.log("Confirm status:", confirmRes.status);
  const confirmData = await confirmRes.json() as any;
  console.log("Confirm response:", confirmData);
  if (!confirmData.success) {
    throw new Error("Confirm slot endpoint failed.");
  }

  // Verify DB updated to 'confirmed'
  const intVerify1 = await pool.query("SELECT status FROM interviews WHERE id = $1;", [interviewId]);
  console.log("DB Interview Status after candidate confirmation:", intVerify1.rows[0].status);
  if (intVerify1.rows[0].status !== "confirmed") {
    throw new Error("Interview status not updated to confirmed in DB.");
  }

  // POST /api/candidate-portal/:token/reschedule
  console.log("POST Candidate Requests Reschedule...");
  const rescheduleReqRes = await fetch(`${base}/api/candidate-portal/${assessmentToken}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
    body: JSON.stringify({ interviewId, message: "Can we do Friday at 3 PM instead?" })
  });
  console.log("Reschedule request status:", rescheduleReqRes.status);
  const rescheduleReqData = await rescheduleReqRes.json() as any;
  console.log("Reschedule request response:", rescheduleReqData);
  if (!rescheduleReqData.success) {
    throw new Error("Reschedule request endpoint failed.");
  }

  // Verify DB updated to 'reschedule_requested' and message saved
  const intVerify2 = await pool.query("SELECT status, feedback FROM interviews WHERE id = $1;", [interviewId]);
  console.log("DB Interview Status after reschedule request:", intVerify2.rows[0].status);
  console.log("DB Interview Message:", intVerify2.rows[0].feedback);
  if (intVerify2.rows[0].status !== "reschedule_requested" || intVerify2.rows[0].feedback !== "Can we do Friday at 3 PM instead?") {
    throw new Error("Interview status/feedback not updated in DB.");
  }

  // 3. Email Integration Settings & Custom sending
  console.log("\n--- 3. Email Integration Settings & Sending ---");

  // GET /api/email/settings (unconfigured initially)
  const getEmailSettings1 = await fetch(`${base}/api/email/settings`, {
    headers: { "Cookie": cookie, "Origin": "http://localhost:3000" }
  });
  console.log("Initial settings status:", getEmailSettings1.status);
  const initialEmailSettings = await getEmailSettings1.json() as any;
  console.log("Initial email settings (should be empty):", initialEmailSettings.settings);

  // POST /api/email/settings
  console.log("Updating Email Settings with SMTP Configuration...");
  const updateEmailSettings = await fetch(`${base}/api/email/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      provider: "gmail",
      username: "recruiting@rison-testing.com",
      password: "my-secure-app-password-12345",
      host: "smtp.gmail.com",
      port: 587,
      fromName: "Recruiter Bruce",
      replyTo: "support@rison-testing.com"
    })
  });
  console.log("Update settings status:", updateEmailSettings.status);

  // GET /api/email/settings (verify masking)
  const getEmailSettings2 = await fetch(`${base}/api/email/settings`, {
    headers: { "Cookie": cookie, "Origin": "http://localhost:3000" }
  });
  const updatedEmailSettings = await getEmailSettings2.json() as any;
  console.log("Updated email settings (password should be masked):", updatedEmailSettings.settings);
  if (updatedEmailSettings.settings.password !== "********" || updatedEmailSettings.settings.username !== "recruiting@rison-testing.com") {
    throw new Error("Email settings saving or password masking failed.");
  }

  // POST /api/email/send
  console.log("Sending Outgoing Interview invite...");
  const sendEmailRes = await fetch(`${base}/api/email/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      candidateId,
      emailType: "invite"
    })
  });
  console.log("Send email status:", sendEmailRes.status);
  const sendEmailData = await sendEmailRes.json() as any;
  console.log("Send email response:", sendEmailData);
  if (!sendEmailData.success || !sendEmailData.historyId) {
    throw new Error("Send email endpoint failed.");
  }

  // Verify email communication log in DB
  const emailLog = await pool.query(
    "SELECT * FROM email_communication_history WHERE id = $1 AND tenant_id = $2;",
    [sendEmailData.historyId, tenantId]
  );
  console.log("Logged email from:", emailLog.rows[0].from_address);
  console.log("Logged email to:", emailLog.rows[0].to_address);
  console.log("Logged email subject:", emailLog.rows[0].subject);
  if (emailLog.rows[0].to_address !== "bruce@waynecorp.com" || emailLog.rows[0].direction !== "outgoing") {
    throw new Error("Email communication history log mismatch.");
  }

  // 4. Calendar Scheduling Settings & API Scheduling
  console.log("\n--- 4. Calendar Settings & Sync ---");

  // GET /api/calendar/settings
  const getCalSettings1 = await fetch(`${base}/api/calendar/settings`, {
    headers: { "Cookie": cookie, "Origin": "http://localhost:3000" }
  });
  const initialCalSettings = await getCalSettings1.json() as any;
  console.log("Initial Calendar Settings:", initialCalSettings.settings);

  // POST /api/calendar/settings
  console.log("Updating Calendar Settings to Google Calendar...");
  const updateCalSettings = await fetch(`${base}/api/calendar/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      provider: "google",
      credentials: { oauthToken: "oauth-google-token-456" }
    })
  });
  console.log("Update calendar settings status:", updateCalSettings.status);

  // POST /api/calendar/schedule
  console.log("Scheduling new interview on calendar...");
  const schedRes = await fetch(`${base}/api/calendar/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      candidateId,
      scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
      title: "Technical deep-dive interview",
      description: "Discuss systems design and architecture"
    })
  });
  console.log("Schedule status:", schedRes.status);
  const schedData = await schedRes.json() as any;
  console.log("Schedule response:", schedData);
  if (!schedData.success || !schedData.interviewId) {
    throw new Error("Calendar schedule endpoint failed.");
  }

  // POST /api/calendar/reschedule
  console.log("Rescheduling the interview on calendar...");
  const reschedRes = await fetch(`${base}/api/calendar/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      interviewId: schedData.interviewId,
      newDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
    })
  });
  console.log("Reschedule status:", reschedRes.status);
  const reschedData = await reschedRes.json() as any;
  console.log("Reschedule response:", reschedData);
  if (!reschedData.success) {
    throw new Error("Calendar reschedule endpoint failed.");
  }

  // POST /api/calendar/cancel
  console.log("Cancelling the scheduled interview on calendar...");
  const cancelRes = await fetch(`${base}/api/calendar/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookie, "Origin": "http://localhost:3000" },
    body: JSON.stringify({
      interviewId: schedData.interviewId
    })
  });
  console.log("Cancel status:", cancelRes.status);
  const cancelData = await cancelRes.json() as any;
  console.log("Cancel response:", cancelData);
  if (!cancelData.success) {
    throw new Error("Calendar cancel endpoint failed.");
  }

  // Verify interview status is now 'cancelled' in DB
  const intVerifyCancel = await pool.query("SELECT status FROM interviews WHERE id = $1;", [schedData.interviewId]);
  console.log("DB Interview Status after cancellation:", intVerifyCancel.rows[0].status);
  if (intVerifyCancel.rows[0].status !== "cancelled") {
    throw new Error("Interview status not updated to cancelled in DB.");
  }

  // 5. Clean up database
  console.log("\n--- 5. Cleaning Up Test Data ---");
  await pool.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
  console.log("Test tenant, candidates, jobs, and communication history deleted.");

  console.log("\n🎉 All Phase 4 Integration Tests completed successfully!");
  process.exit(0);
}

runCommunicationTests().catch(err => {
  console.error("❌ Test failed with exception:", err);
  process.exit(1);
});
