// src/test/verifyEmailPipelineE2E.ts
//
// End-to-end verification of the recruitment email lifecycle (acknowledgement ->
// assessment invite -> reminder -> interview -> decision), run against the real
// database (the only reachable one — there is no separate staging DB) inside a
// disposable scratch tenant that is deleted at the end.
//
// MUST be run with DRY_RUN_EMAILS=true (enforced below) so no real email is ever
// delivered, regardless of Zoho/SMTP env vars or a tenant's saved email_config.
// Every guard/log/idempotency check below is exercised for real against email_logs.
//
// Usage: DRY_RUN_EMAILS=true npx tsx src/test/verifyEmailPipelineE2E.ts

process.env.DRY_RUN_EMAILS = "true";

import { pool } from "../lib/db.js";
import crypto from "crypto";
import {
  sendApplicationAcknowledgementEmail,
  sendAssessmentInviteEmail,
  sendAssessmentReminderEmail,
  sendInterviewScheduleEmail,
  sendCandidateDecisionEmail,
  canSendEmailToCandidate,
} from "../lib/email.js";
import { isLikelyApplicationEmail } from "../lib/emailClassification.js";

let failures = 0;
function check(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failures++;
  }
}

async function countLogs(candidateId: string, template: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS c FROM email_logs WHERE candidate_id = $1 AND template = $2 AND delivery_status = 'sent';`,
    [candidateId, template]
  );
  return res.rows[0].c;
}

async function main() {
  if (process.env.DRY_RUN_EMAILS !== "true") {
    throw new Error("Refusing to run: DRY_RUN_EMAILS must be true.");
  }

  const uniqueId = `e2e-${Date.now()}`;
  const tenantId = `tenant-${uniqueId}`;
  const jobId = `job-${uniqueId}`;

  console.log(`🚀 Email pipeline E2E verification — scratch tenant ${tenantId}\n`);

  try {
    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, $2);", [tenantId, `E2E Test Corp ${uniqueId}`]);
    await pool.query(
      `INSERT INTO jobs (id, tenant_id, title, description, status) VALUES ($1, $2, $3, $4, 'active');`,
      [jobId, tenantId, "Software Engineer", "Test job description for E2E verification."]
    );

    // ── 0. isLikelyApplicationEmail unit checks (no DB) ──────────────────────
    console.log("0. Application-classification filter (Zoho OAuth spam filter)");
    check(
      isLikelyApplicationEmail("Application for Software Engineer Role", ["resume_john.pdf"]),
      "Subject matching 'application for' is classified as an application"
    );
    check(
      isLikelyApplicationEmail("Re: Applying for Software Engineer Role", []) === true,
      "Subject match alone (no attachment) is still classified as an application"
    );
    check(
      !isLikelyApplicationEmail("Weekly Newsletter — Industry Digest", ["digest.pdf"]),
      "Newsletter subject with a non-resume attachment is NOT classified as an application"
    );
    check(
      !isLikelyApplicationEmail("Quick question", []),
      "Generic subject, no attachments, is NOT classified as an application"
    );
    check(
      isLikelyApplicationEmail("Quick question", ["my_resume_2026.pdf"]),
      "Non-matching subject but resume-named attachment IS classified as an application"
    );

    // ── 1. Acknowledgement email: cutoff + once-per-candidate ────────────────
    console.log("\n1. Application acknowledgement — cutoff + exactly-once");
    const candA = `cand-${uniqueId}-a`;
    await insertCandidate(candA, tenantId, jobId, "Alice Applicant", "alice.e2e@example-corp-test.com");

    // Pre-cutoff: an application timestamp clearly before "today" must be skipped.
    await sendApplicationAcknowledgementEmail({
      candidateName: "Alice Applicant",
      candidateEmail: "alice.e2e@example-corp-test.com",
      tenantId,
      candidateId: candA,
      appliedDate: new Date("2020-01-01T00:00:00Z"),
    });
    check((await countLogs(candA, "application_acknowledgement")) === 0, "Pre-cutoff application does NOT receive an acknowledgement email");

    // Post-cutoff (today): must send exactly once, even across repeated calls
    // (simulating a re-queued/reprocessed application).
    await sendApplicationAcknowledgementEmail({
      candidateName: "Alice Applicant",
      candidateEmail: "alice.e2e@example-corp-test.com",
      tenantId,
      candidateId: candA,
      appliedDate: new Date(),
    });
    await sendApplicationAcknowledgementEmail({
      candidateName: "Alice Applicant",
      candidateEmail: "alice.e2e@example-corp-test.com",
      tenantId,
      candidateId: candA,
      appliedDate: new Date(),
    });
    check((await countLogs(candA, "application_acknowledgement")) === 1, "Post-cutoff application receives exactly ONE acknowledgement email across repeated sends");

    // ── 2. Assessment invite: exactly-once, linked to candidateId ────────────
    console.log("\n2. Assessment invite — exactly-once");
    const candB = `cand-${uniqueId}-b`;
    await insertCandidate(candB, tenantId, jobId, "Bob Shortlisted", "bob.e2e@example-corp-test.com");

    const invite1 = await sendAssessmentInviteEmail({
      candidateName: "Bob Shortlisted",
      candidateEmail: "bob.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      token: crypto.randomBytes(12).toString("hex"),
      expiryDate: new Date(Date.now() + 7 * 86400000),
      tenantId,
      candidateId: candB,
    });
    const invite2 = await sendAssessmentInviteEmail({
      candidateName: "Bob Shortlisted",
      candidateEmail: "bob.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      token: crypto.randomBytes(12).toString("hex"),
      expiryDate: new Date(Date.now() + 7 * 86400000),
      tenantId,
      candidateId: candB,
    });
    check(invite1.success === true, "First assessment invite call succeeds");
    check(invite2.success === false && (invite2 as any).skipped === true, "Second assessment invite call is skipped by the guard");
    check((await countLogs(candB, "assessment_invitation")) === 1, "Exactly ONE assessment_invitation log row for the candidate");

    await pool.query(`UPDATE candidates SET assessment_invited_at = NOW() - INTERVAL '3 days' WHERE id = $1;`, [candB]);

    // ── 3. Reminder: fires once, cooldown blocks a same-day repeat ───────────
    console.log("\n3. Assessment reminder (3-4 day window) — exactly-once");
    await sendAssessmentReminderEmail({
      candidateName: "Bob Shortlisted",
      candidateEmail: "bob.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      token: "reminder-token",
      remainingDays: 4,
      tenantId,
      candidateId: candB,
    });
    await sendAssessmentReminderEmail({
      candidateName: "Bob Shortlisted",
      candidateEmail: "bob.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      token: "reminder-token",
      remainingDays: 4,
      tenantId,
      candidateId: candB,
    });
    check((await countLogs(candB, "assessment_reminder")) === 1, "Exactly ONE reminder sent across two calls on the same day (20h cooldown)");

    // ── 4. Interview schedule: exactly-once, reschedule sends again ──────────
    console.log("\n4. Interview schedule — exactly-once, reschedule re-notifies");
    const candC = `cand-${uniqueId}-c`;
    await insertCandidate(candC, tenantId, jobId, "Carol Passed", "carol.e2e@example-corp-test.com");
    const interviewId = crypto.randomUUID();
    const firstSlot = new Date(Date.now() + 2 * 86400000);
    const secondSlot = new Date(Date.now() + 5 * 86400000);

    const sched1 = await sendInterviewScheduleEmail({
      candidateName: "Carol Passed",
      candidateEmail: "carol.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      resumeScore: 85,
      assessmentScore: 90,
      finalScore: 88,
      scheduledDate: firstSlot,
      tenantId,
      candidateId: candC,
      interviewId,
    });
    const sched2NoChange = await sendInterviewScheduleEmail({
      candidateName: "Carol Passed",
      candidateEmail: "carol.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      resumeScore: 85,
      assessmentScore: 90,
      finalScore: 88,
      scheduledDate: firstSlot,
      tenantId,
      candidateId: candC,
      interviewId,
    });
    check(sched1.success === true, "First interview schedule email succeeds");
    check(sched2NoChange.success === false && (sched2NoChange as any).skipped === true, "Duplicate schedule call (no skipGuard) is blocked by the guard");
    check((await countLogs(candC, "interview_schedule")) === 1, "Exactly ONE interview_schedule log after the duplicate call");

    // Reschedule: interviewRouter passes skipGuard:true only when the date actually changed.
    const reschedule = await sendInterviewScheduleEmail({
      candidateName: "Carol Passed",
      candidateEmail: "carol.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      resumeScore: 85,
      assessmentScore: 90,
      finalScore: 88,
      scheduledDate: secondSlot,
      tenantId,
      candidateId: candC,
      interviewId,
      skipGuard: true,
    });
    check(reschedule.success === true, "Reschedule (skipGuard:true, real date change) sends a second notification");
    check((await countLogs(candC, "interview_schedule")) === 2, "Exactly TWO interview_schedule log rows after a genuine reschedule");

    // ── 5. Candidate decision: exactly-once per outcome ───────────────────────
    console.log("\n5. Candidate decision — exactly-once per outcome, transitions still notify");
    const candD = `cand-${uniqueId}-d`;
    await insertCandidate(candD, tenantId, jobId, "Dave Decision", "dave.e2e@example-corp-test.com");

    await sendCandidateDecisionEmail({
      candidateName: "Dave Decision",
      candidateEmail: "dave.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      decision: "selected",
      tenantId,
      candidateId: candD,
    });
    await sendCandidateDecisionEmail({
      candidateName: "Dave Decision",
      candidateEmail: "dave.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      decision: "selected",
      tenantId,
      candidateId: candD,
    });
    check((await countLogs(candD, "candidate_decision_selected")) === 1, "Exactly ONE 'selected' decision email across two identical calls");

    // A genuinely different outcome for the same candidate must still notify once.
    await sendCandidateDecisionEmail({
      candidateName: "Dave Decision",
      candidateEmail: "dave.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      decision: "rejected",
      tenantId,
      candidateId: candD,
    });
    await sendCandidateDecisionEmail({
      candidateName: "Dave Decision",
      candidateEmail: "dave.e2e@example-corp-test.com",
      jobTitle: "Software Engineer",
      decision: "rejected",
      tenantId,
      candidateId: candD,
    });
    check((await countLogs(candD, "candidate_decision_rejected")) === 1, "A later 'rejected' transition still sends exactly ONE email, and repeats are blocked");
    check((await countLogs(candD, "candidate_decision_selected")) === 1, "Earlier 'selected' log is untouched by the later transition");

    // ── 6. /api/email/send equivalent template guard ─────────────────────────
    console.log("\n6. POST /api/email/send idempotency (email_send_* templates)");
    const guard1 = await canSendEmailToCandidate("dave.e2e@example-corp-test.com", "email_send_shortlist", candD);
    check(guard1.canSend === true, "First email_send_shortlist call is allowed");
    // Simulate the route recording its send, exactly like the real handler does.
    await pool.query(
      `INSERT INTO email_logs (id, candidate_id, recipient, subject, template, delivery_status, tenant_id) VALUES ($1, $2, $3, $4, $5, 'sent', $6);`,
      [crypto.randomUUID(), candD, "dave.e2e@example-corp-test.com", "Shortlisted", "email_send_shortlist", tenantId]
    );
    const guard2 = await canSendEmailToCandidate("dave.e2e@example-corp-test.com", "email_send_shortlist", candD);
    check(guard2.canSend === false, "Second email_send_shortlist call for the same candidate is blocked");

    // ── Summary ────────────────────────────────────────────────────────────
    console.log(`\n${failures === 0 ? "⭐️ ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  } finally {
    console.log("\nCleaning up scratch tenant...");
    await pool.query("DELETE FROM email_logs WHERE tenant_id = $1;", [tenantId]);
    await pool.query("DELETE FROM interviews WHERE tenant_id = $1;", [tenantId]);
    await pool.query("DELETE FROM candidate_activity_logs WHERE candidate_id LIKE $1;", [`cand-${uniqueId}-%`]);
    await pool.query("DELETE FROM candidates WHERE tenant_id = $1;", [tenantId]);
    await pool.query("DELETE FROM jobs WHERE tenant_id = $1;", [tenantId]);
    await pool.query("DELETE FROM tenants WHERE id = $1;", [tenantId]);
    console.log("Cleanup complete.");
    await pool.end();
  }

  process.exit(failures === 0 ? 0 : 1);
}

async function insertCandidate(id: string, tenantId: string, jobId: string, name: string, email: string) {
  await pool.query(
    `INSERT INTO candidates (id, name, email, role, score, match_percent, experience_years, application_source, applied_date, status, job_id, tenant_id)
     VALUES ($1, $2, $3, 'Software Engineer', 0, 0, 0, 'E2E Test', $4, 'shortlisted', $5, $6);`,
    [id, name, email, new Date().toISOString().split("T")[0], jobId, tenantId]
  );
}

main().catch(async (err) => {
  console.error("\n❌ VERIFICATION FAILED:", err.message || err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
