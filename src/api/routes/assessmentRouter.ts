// src/api/routes/assessmentRouter.ts
import { Router } from "express";
import { ensureJobAssessment, regenerateJobAssessment } from "../../lib/assessmentService.js";
import { sendAssessmentInviteEmail, sendInterviewScheduleEmail, sendAssessmentResultDetailsEmail } from "../../lib/email.js";
import { kekaWorkflowService } from "../../integrations/keka/services/workflow.service.js";
import crypto from "crypto";
import { tenantStorage, DEFAULT_TENANT_ID } from "../../lib/tenantContext.js";
import { queryGlobal, queryTenant } from "../../lib/tenantDb.js";
import { transaction } from "../../lib/db.js";
import { rateLimiter } from "../middleware/security.js";
import {
  PIPELINE_THRESHOLDS,
  nextBusinessDaySlot,
  getFallbackHrEmail,
  ASSESSMENT_VALIDITY_DAYS,
} from "../../lib/appConfig.js";

const router = Router();

/**
 * Resolves the HR notification recipient for a tenant.
 *
 * Order: tenant email_config.hrManagerEmail → tenant owner → HR_NOTIFICATION_EMAIL env.
 * Returns null when none is configured — callers must then skip the HR copy
 * rather than fall back to a placeholder address. (The previous hard-coded
 * `yogeshkumarwadhwa@localhost.com` default made every HR notification attempt
 * delivery to an unroutable domain and log an SMTP failure.)
 */
export async function resolveHrEmail(tenantId: string | null | undefined): Promise<string | null> {
  if (tenantId) {
    try {
      const tenantCfgRes = await queryGlobal(
        `SELECT email_config FROM tenants WHERE id = $1 LIMIT 1;`,
        [tenantId]
      );
      const configured = tenantCfgRes.rows[0]?.email_config?.hrManagerEmail;
      if (configured && String(configured).includes("@")) {
        return String(configured).trim();
      }

      const ownerRes = await queryGlobal(
        `SELECT email FROM users WHERE tenant_id = $1 AND role = 'owner' AND email LIKE '%@%' LIMIT 1;`,
        [tenantId]
      );
      if (ownerRes.rowCount && ownerRes.rowCount > 0) {
        return String(ownerRes.rows[0].email).trim();
      }
    } catch (dbErr) {
      console.error("Failed to look up the HR manager email:", dbErr);
    }
  }
  return getFallbackHrEmail();
}

// Middleware to resolve tenant context for single-user workspace
async function resolveTenantContext(req: any, res: any, next: any) {
  if (req.user && req.user.tenantId) {
    return next();
  }

  tenantStorage.run({ tenantId: DEFAULT_TENANT_ID, userId: "guest", role: "candidate" }, () => {
    next();
  });
}

router.use(resolveTenantContext);

/**
 * POST /api/assessment/generate
 * Generates an assessment for a job title/description if it doesn't already exist.
 */
router.post("/generate", async (req: any, res: any) => {
  try {
    const { jobTitle, jobDescription, jobId } = req.body as {
      jobTitle: string;
      jobDescription: string;
      jobId?: string;
    };

    if (!jobTitle || !jobDescription) {
      return res.status(400).json({ error: "jobTitle and jobDescription are required" });
    }

    if (!jobId) {
      return res.status(400).json({
        error: "jobId is required. Assessments can only be generated for an existing, active job opening."
      });
    }

    // The job must already exist AND be open.
    //
    // This route used to CREATE a job row from whatever title was posted (with a
    // random UUID when jobId was omitted). That is a primary source of the
    // "job roles that do not exist" reported in the portal: an assessment request
    // for an inferred role silently manufactured a matching job opening.
    const checkJob = await queryTenant(
      `SELECT id, title, description FROM jobs
        WHERE id = $1 AND tenant_id = :tenant_id
          AND COALESCE(status, 'active') = 'active'
          AND sync_status IS DISTINCT FROM 'removed'
        LIMIT 1;`,
      [jobId]
    );

    if (!checkJob.rowCount || checkJob.rowCount === 0) {
      return res.status(404).json({
        error: "No active job opening found with that jobId. Create or re-open the job first — assessments are never generated against an ad-hoc role."
      });
    }

    const job = checkJob.rows[0];
    const assessmentId = await ensureJobAssessment(job.id, job.title, job.description || jobDescription);
    res.json({ success: true, jobId: job.id, assessmentId });
  } catch (err: any) {
    console.error("Assessment generation route failed:", err);
    res.status(500).json({ error: err.message || "Failed to generate assessment" });
  }
});

/**
 * POST /api/assessment/send
 * Sends assessment invite to a shortlisted candidate.
 */
router.post("/send", async (req: any, res: any) => {
  try {
    const { candidateId, jobId: overrideJobId, resend } = req.body as {
      candidateId: string;
      /** Optional: HR may explicitly attach an unmapped candidate to an active job. */
      jobId?: string;
      /** Optional: HR may deliberately re-issue an invitation that was already sent. */
      resend?: boolean;
    };
    if (!candidateId) {
      return res.status(400).json({ error: "candidateId is required" });
    }

    // Fetch candidate
    const candidateRes = await queryTenant(
      `SELECT * FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;`,
      [candidateId]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const candidate = candidateRes.rows[0];

    if (!candidate.email || !candidate.email.includes("@")) {
      return res.status(400).json({ error: "This candidate has no valid email address on record." });
    }

    // Resolve the target job. It must be a REAL, ACTIVE opening.
    //
    // This route previously manufactured a job row from `candidate.role` — an
    // AI-inferred free-text string — whenever the candidate had no job_id. That
    // is how non-existent roles ended up in the portal. HR must now attach the
    // candidate to an actual opening (or the candidate must already be mapped).
    const jobId = overrideJobId || candidate.job_id;
    if (!jobId) {
      return res.status(409).json({
        error: "This candidate is not mapped to a job opening. Pass a jobId for an active opening to attach them before sending the assessment.",
        code: "CANDIDATE_NOT_MAPPED"
      });
    }

    const jobRes = await queryTenant(
      `SELECT id, title, description FROM jobs
        WHERE id = $1 AND tenant_id = :tenant_id
          AND COALESCE(status, 'active') = 'active'
          AND sync_status IS DISTINCT FROM 'removed'
        LIMIT 1;`,
      [jobId]
    );

    if (!jobRes.rowCount || jobRes.rowCount === 0) {
      return res.status(409).json({
        error: "That job opening is closed or no longer exists. Assessments are only sent for active openings.",
        code: "JOB_NOT_ACTIVE"
      });
    }

    const job = jobRes.rows[0];

    // Attach the candidate if HR supplied an override.
    if (overrideJobId && candidate.job_id !== job.id) {
      await queryTenant(
        `UPDATE candidates SET job_id = $1, role = $2 WHERE id = $3 AND tenant_id = :tenant_id;`,
        [job.id, job.title, candidateId]
      );
    }

    // Ensure the assessment exists for the real job.
    await ensureJobAssessment(job.id, job.title, job.description || job.title);

    // Reuse a still-valid token, otherwise mint a fresh one with a 7-day window.
    let token = candidate.assessment_token;
    const isTokenValid =
      token && candidate.assessment_token_expiry && new Date(candidate.assessment_token_expiry) > new Date();

    if (!isTokenValid) {
      token = crypto.randomBytes(24).toString("hex");
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + ASSESSMENT_VALIDITY_DAYS);

    await queryTenant(
      `UPDATE candidates
       SET assessment_token = $1,
           assessment_token_expiry = $2,
           assessment_status = COALESCE(assessment_status, 'pending'),
           status = CASE WHEN LOWER(COALESCE(status, '')) IN ('applied', 'review', 'under review') THEN 'shortlisted' ELSE status END
       WHERE id = $3 AND tenant_id = :tenant_id;`,
      [token, expiry, candidateId]
    );

    // Send the email. This is a deliberate HR action, so `resend: true` bypasses
    // the once-per-candidate guard — but only when HR explicitly asks for it.
    const result = await sendAssessmentInviteEmail({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      jobTitle: job.title,
      token,
      expiryDate: expiry,
      tenantId: candidate.tenant_id,
      candidateId,
      skipGuard: resend === true,
    });

    if (!result?.success && result?.skipped) {
      return res.status(409).json({
        error: `An assessment invitation was already sent to this candidate. ${result.reason || ""}`.trim(),
        code: "ALREADY_INVITED",
        hint: "Re-send this invitation by calling the same endpoint with { resend: true }."
      });
    }

    if (!result?.success) {
      return res.status(502).json({ error: "The assessment invitation could not be delivered. Check the email configuration and try again." });
    }

    // Mark as invited and log, only after a confirmed send.
    await queryTenant(
      `UPDATE candidates SET assessment_invited_at = COALESCE(assessment_invited_at, NOW()) WHERE id = $1 AND tenant_id = :tenant_id;`,
      [candidateId]
    );

    await queryTenant(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
       VALUES ($1, $2, $3, :tenant_id);`,
      [
        candidateId,
        "assessment_invited",
        `Assessment invitation ${resend ? "re-sent" : "sent"} manually by HR for "${job.title}". Valid until ${expiry.toISOString()}.`
      ]
    );

    res.json({ success: true, token, expiryDate: expiry, jobTitle: job.title });
  } catch (err: any) {
    console.error("Assessment send invite failed:", err);
    res.status(500).json({ error: err.message || "Failed to send assessment invitation" });
  }
});

/**
 * GET /api/assessment/:token
 * Candidate portal entry endpoint. Loads test and locks attempts.
 */
router.get("/:token", async (req: any, res: any) => {
  try {
    const { token } = req.params;
    const { sessionId } = req.query as { sessionId: string };

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId query parameter is required to initialize session" });
    }

    const cleanToken = (token || "").trim();

    // 1. Candidate lookup — EXACT token match only.
    //
    // This previously fell back to `c.id = $1`, `c.email ILIKE $1` and a
    // *partial* token match (`assessment_token ILIKE '%token%'`). Those fallbacks
    // could resolve a link to the WRONG candidate — anyone who knew an email
    // address or a token fragment could open someone else's assessment, and a
    // truncated link would silently load a different person's test.
    const candidateRes = await queryGlobal(
      `SELECT c.*, j.title as job_title, j.description as job_description,
              COALESCE(j.status, 'active') as job_status, j.sync_status as job_sync_status
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       WHERE c.assessment_token = $1
       LIMIT 1;`,
      [cleanToken]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({
        error: "This assessment link is not valid. It may have been mistyped or superseded by a newer invitation. Please use the most recent link emailed to you, or contact HR."
      });
    }

    const candidate = candidateRes.rows[0];

    // 2. Enforce the real 7-day validity window.
    //
    // The previous "failure-proof auto-heal" silently pushed the expiry 30 days
    // into the future on EVERY page load, so an assessment link never actually
    // expired and the advertised deadline in the invitation email was fiction.
    const expiry = candidate.assessment_token_expiry ? new Date(candidate.assessment_token_expiry) : null;
    if (!expiry || isNaN(expiry.getTime())) {
      return res.status(403).json({
        error: "This assessment link has no valid expiry on record. Please contact HR for a fresh invitation."
      });
    }
    if (expiry.getTime() <= Date.now()) {
      return res.status(403).json({
        error: `This assessment link expired on ${expiry.toLocaleDateString()}. Please contact HR if you would like a new invitation.`
      });
    }

    // 3. The candidate must still be attached to an OPEN job opening.
    //
    // The old code resolved a NULL job_id to "the most recently created job in
    // the tenant" — which mapped candidates onto roles they never applied for and
    // then generated an assessment for that unrelated role.
    if (!candidate.job_id) {
      return res.status(409).json({
        error: "Your application is still being reviewed and is not yet linked to a specific role. Please contact HR."
      });
    }
    if (candidate.job_status !== "active" || candidate.job_sync_status === "removed") {
      return res.status(409).json({
        error: "The position you applied for is no longer open. Please contact HR regarding your application."
      });
    }

    // 4. Find or generate the assessment for the candidate's ACTUAL job.
    let assessmentId = "";
    const assessmentRes = await queryGlobal(
      `SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`,
      [candidate.job_id]
    );
    if (assessmentRes.rowCount && assessmentRes.rowCount > 0) {
      assessmentId = assessmentRes.rows[0].id;
    } else {
      assessmentId = await ensureJobAssessment(
        candidate.job_id,
        candidate.job_title || candidate.role,
        candidate.job_description || candidate.job_title || candidate.role
      );
    }

    // Check if there is an existing attempt
    const attemptRes = await queryGlobal(
      `SELECT * FROM assessment_attempts WHERE candidate_id = $1 AND assessment_id = $2 LIMIT 1;`,
      [candidate.id, assessmentId]
    );

    let attempt;

    // Fetch questions (omit the correct answers for the candidate!)
    let questionsRes = await queryGlobal(
      `SELECT id, question_text, options, difficulty, topic 
       FROM assessment_questions 
       WHERE assessment_id = $1 
       ORDER BY id ASC;`,
      [assessmentId]
    );

    // If no questions found, regenerate them for THIS job (never a placeholder job).
    if (!questionsRes.rowCount || questionsRes.rowCount === 0) {
      await regenerateJobAssessment(
        candidate.job_id,
        candidate.job_title || candidate.role,
        candidate.job_description || candidate.job_title || candidate.role
      );
      questionsRes = await queryGlobal(
        `SELECT id, question_text, options, difficulty, topic
         FROM assessment_questions
         WHERE assessment_id = $1
         ORDER BY id ASC;`,
        [assessmentId]
      );

      // Regeneration may create a new assessment row for the job; re-resolve.
      if (!questionsRes.rowCount || questionsRes.rowCount === 0) {
        const regenerated = await queryGlobal(
          `SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1;`,
          [candidate.job_id]
        );
        if (regenerated.rowCount && regenerated.rows[0].id !== assessmentId) {
          assessmentId = regenerated.rows[0].id;
          questionsRes = await queryGlobal(
            `SELECT id, question_text, options, difficulty, topic
             FROM assessment_questions
             WHERE assessment_id = $1
             ORDER BY id ASC;`,
            [assessmentId]
          );
        }
      }

      if (!questionsRes.rowCount || questionsRes.rowCount === 0) {
        console.error(`[Assessment] Could not generate questions for job ${candidate.job_id} (candidate ${candidate.id}).`);
        return res.status(503).json({
          error: "We could not load your assessment questions right now. This is a temporary problem on our side — please try again in a few minutes."
        });
      }
    }

    const questions = questionsRes.rows.map(q => ({
      id: q.id,
      questionText: q.question_text,
      options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
      difficulty: q.difficulty,
      topic: q.topic
    }));

    const TOTAL_TEST_TIME_SEC = 15 * 60; // 15 minutes

    if (!attemptRes.rowCount || attemptRes.rowCount === 0) {
      // Use the session ID passed by the frontend to prevent race conditions during double-fetch
      const sessionDbId = sessionId || crypto.randomUUID();
      const attemptId = crypto.randomUUID();

      // Atomic insert-or-skip: `uniq_assessment_attempts_candidate_assessment`
      // guarantees at most one attempt per candidate+assessment. If a
      // concurrent request (double-mount, fast retry) already created the
      // attempt between our SELECT above and this INSERT, this is a no-op
      // and we fall through to the "existing attempt" path below instead of
      // creating a second attempt/session pair.
      const insertedAttempt = await queryGlobal(
        `INSERT INTO assessment_attempts (id, candidate_id, assessment_id, status, session_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (candidate_id, assessment_id) DO NOTHING
         RETURNING *;`,
        [attemptId, candidate.id, assessmentId, "started", sessionDbId]
      );

      if (insertedAttempt.rowCount && insertedAttempt.rowCount > 0) {
        // We won the race — this is genuinely the first attempt.
        attempt = insertedAttempt.rows[0];

        // Capture client info for audit
        const browserFingerprint = req.headers['user-agent'] || null;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
        // Create the session record linked to the attempt we just created
        await queryGlobal(
          `INSERT INTO assessment_sessions (id, candidate_id, assessment_id, attempt_id, status, browser_fingerprint, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7);`,
          [sessionDbId, candidate.id, assessmentId, attemptId, 'active', browserFingerprint, ipAddress]
        );

        // Log activity
        await queryGlobal(
          `INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
           VALUES ($1, $2, $3);`,
          [candidate.id, "assessment_started", "Candidate started the assessment test."]
        );

        return res.json({
          success: true,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          jobTitle: candidate.role,
          remainingSeconds: TOTAL_TEST_TIME_SEC,
          questions,
          sessionId: sessionDbId,
          currentAnswers: {},
          currentQuestionIndex: 0,
        });
      }

      // Lost the race — re-fetch the attempt a concurrent request just
      // created and fall through to the existing-attempt handling below.
      const raceAttemptRes = await queryGlobal(
        `SELECT * FROM assessment_attempts WHERE candidate_id = $1 AND assessment_id = $2 LIMIT 1;`,
        [candidate.id, assessmentId]
      );
      attempt = raceAttemptRes.rows[0];
    } else {
      attempt = attemptRes.rows[0];
    }

    // If attempt is already completed, deny access
    if (attempt.status === "completed") {
      return res.status(403).json({ error: "Assessment already completed and submitted." });
    }

    // Rejoining session checks: Auto-transfer session to latest browser window/device for failure-proof access!
    if (attempt.session_id !== sessionId) {
      console.log(`[Session Transfer] Candidate accessing from session ${sessionId}. Transferring old session ${attempt.session_id} to new session ${sessionId}`);

      await queryGlobal(
        `UPDATE assessment_attempts SET session_id = $1 WHERE id = $2;`,
        [sessionId, attempt.id]
      );

      const browserFingerprint = req.headers['user-agent'] || null;
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
      await queryGlobal(
        `INSERT INTO assessment_sessions (id, candidate_id, assessment_id, attempt_id, status, browser_fingerprint, ip_address)
         VALUES ($1, $2, $3, $4, 'active', $5, $6)
         ON CONFLICT (id) DO NOTHING;`,
        [sessionId, candidate.id, assessmentId, attempt.id, browserFingerprint, ipAddress]
      );
    }

    // Check remaining time
    const elapsedMs = Date.now() - new Date(attempt.started_at).getTime();
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const remainingSeconds = TOTAL_TEST_TIME_SEC - elapsedSec;

    if (remainingSeconds <= 0) {
      // Force submit
      return res.status(403).json({
        error: "Time limit expired. The assessment has been automatically closed.",
        expired: true
      });
    }

    const currentAnswers = typeof attempt.current_answers === "string"
      ? JSON.parse(attempt.current_answers)
      : (attempt.current_answers || {});
    const currentQuestionIndex = attempt.current_question_index || 0;

    return res.json({
      success: true,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      jobTitle: candidate.role,
      remainingSeconds,
      questions,
      currentAnswers,
      currentQuestionIndex,
    });
  } catch (err: any) {
    console.error("Failed to load assessment portal details:", err);
    res.status(500).json({ error: err.message || "Failed to load assessment details" });
  }
});

/**
 * GET /api/assessment/:token/info
 * Read-only lookup for the pre-test instructions screen.
 *
 * Unlike GET /:token, this never creates an assessment_attempts row and never
 * starts the 15-minute timer. GET /:token used to be called the instant the
 * page loaded (before the candidate even read the instructions or granted
 * camera/fullscreen permission), so the clock was already running while they
 * were still on the welcome screen — anyone who stepped away and came back
 * later than 15 minutes after merely opening the link was permanently locked
 * out with "Time limit expired" having never seen a single question. The
 * timer now only starts when the candidate explicitly clicks Start/Resume,
 * which calls GET /:token; this endpoint only tells the frontend whether the
 * link itself is valid and what label the button should show.
 */
router.get("/:token/info", async (req: any, res: any) => {
  try {
    const cleanToken = (req.params.token || "").trim();

    const candidateRes = await queryGlobal(
      `SELECT c.*, j.title as job_title, COALESCE(j.status, 'active') as job_status, j.sync_status as job_sync_status
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       WHERE c.assessment_token = $1
       LIMIT 1;`,
      [cleanToken]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({
        error: "This assessment link is not valid. It may have been mistyped or superseded by a newer invitation. Please use the most recent link emailed to you, or contact HR."
      });
    }

    const candidate = candidateRes.rows[0];

    // Same validity checks as GET /:token (token/expiry/job), so an invalid
    // or expired link still fails fast on page load rather than only after
    // the candidate clicks through. Only the attempt-creating, clock-starting
    // part is deferred.
    const expiry = candidate.assessment_token_expiry ? new Date(candidate.assessment_token_expiry) : null;
    if (!expiry || isNaN(expiry.getTime())) {
      return res.status(403).json({
        error: "This assessment link has no valid expiry on record. Please contact HR for a fresh invitation."
      });
    }
    if (expiry.getTime() <= Date.now()) {
      return res.status(403).json({
        error: `This assessment link expired on ${expiry.toLocaleDateString()}. Please contact HR if you would like a new invitation.`
      });
    }

    if (!candidate.job_id) {
      return res.status(409).json({
        error: "Your application is still being reviewed and is not yet linked to a specific role. Please contact HR."
      });
    }
    if (candidate.job_status !== "active" || candidate.job_sync_status === "removed") {
      return res.status(409).json({
        error: "The position you applied for is no longer open. Please contact HR regarding your application."
      });
    }

    // Best-effort, read-only: tell the frontend whether an attempt already
    // exists so the button can say "Resume" instead of "Start". Never
    // generates questions or writes anything.
    let isResuming = false;
    let completed = false;
    try {
      const assessmentRes = await queryGlobal(
        `SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`,
        [candidate.job_id]
      );
      if (assessmentRes.rowCount && assessmentRes.rowCount > 0) {
        const attemptRes = await queryGlobal(
          `SELECT status FROM assessment_attempts WHERE candidate_id = $1 AND assessment_id = $2 LIMIT 1;`,
          [candidate.id, assessmentRes.rows[0].id]
        );
        if (attemptRes.rowCount && attemptRes.rowCount > 0) {
          completed = attemptRes.rows[0].status === "completed";
          isResuming = !completed;
        }
      }
    } catch (lookupErr) {
      console.error("Non-fatal: failed to resolve attempt state for assessment info:", lookupErr);
    }

    res.json({
      success: true,
      candidateName: candidate.name,
      jobTitle: candidate.role,
      isResuming,
      completed,
    });
  } catch (err: any) {
    console.error("Failed to load assessment info:", err);
    res.status(500).json({ error: err.message || "Failed to load assessment information." });
  }
});

// POST /api/assessment/:token/save-progress - saves in-progress answers and question index
router.post("/:token/save-progress", async (req: any, res: any) => {
  try {
    const { token } = req.params;
    const { answers, currentQuestionIndex } = req.body as {
      answers: Record<string, string>;
      currentQuestionIndex: number;
    };

    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    // Fetch candidate
    const candidateRes = await queryGlobal(
      `SELECT id, job_id FROM candidates WHERE assessment_token = $1 LIMIT 1;`,
      [token]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({ error: "Invalid token" });
    }

    const candidate = candidateRes.rows[0];

    // Find assessment
    const assessmentRes = await queryGlobal(
      `SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`,
      [candidate.job_id]
    );

    if (!assessmentRes.rowCount || assessmentRes.rowCount === 0) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    const assessmentId = assessmentRes.rows[0].id;

    // Update in-progress attempt progress
    await queryGlobal(
      `UPDATE assessment_attempts
       SET current_answers = $1, current_question_index = $2
       WHERE candidate_id = $3 AND assessment_id = $4 AND status = 'started';`,
      [JSON.stringify(answers), currentQuestionIndex, candidate.id, assessmentId]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("Failed to save assessment progress:", err);
    res.status(500).json({ error: err.message || "Failed to save progress" });
  }
});

// POST /api/assessment/:token/heartbeat - updates session heartbeat
router.post("/:token/heartbeat", async (req: any, res: any) => {
  try {
    const { token } = req.params;
    const { sessionId } = req.body as { sessionId: string };
    if (!sessionId) { return res.status(400).json({ error: "sessionId required" }); }
    // Update heartbeat timestamp
    await queryGlobal(
      `UPDATE assessment_sessions SET last_heartbeat = now() WHERE id = $1 AND candidate_id = (SELECT id FROM candidates WHERE assessment_token = $2);`,
      [sessionId, token]
    );
    res.json({ success: true });
  } catch (err:any) {
    console.error("Heartbeat failed:", err);
    res.status(500).json({ error: err.message || "Failed heartbeat" });
  }
});

// POST /api/assessment/:token/force-resume - abandon existing session and create new one
router.post("/:token/force-resume", async (req: any, res: any) => {
  try {
    const { token } = req.params;
    const { oldSessionId } = req.body as { oldSessionId: string };
    // Mark old session as abandoned
    if (oldSessionId) {
      await queryGlobal(`UPDATE assessment_sessions SET status = 'abandoned' WHERE id = $1;`, [oldSessionId]);
    }
    // Generate new session
    const newSessionId = crypto.randomUUID();
    const candidateRes = await queryGlobal(`SELECT id, job_id FROM candidates WHERE assessment_token = $1 LIMIT 1;`, [token]);
    if (!candidateRes.rowCount) { return res.status(404).json({ error: "Invalid token" }); }
    const candidate = candidateRes.rows[0];
    const assessmentRes = await queryGlobal(`SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`, [candidate.job_id]);
    if (!assessmentRes.rowCount) { return res.status(404).json({ error: "Assessment not found" }); }
    const assessmentId = assessmentRes.rows[0].id;
    const browserFingerprint = req.headers['user-agent'] || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    await queryGlobal(
      `INSERT INTO assessment_sessions (id, candidate_id, assessment_id, attempt_id, status, browser_fingerprint, ip_address) VALUES ($1, $2, $3, NULL, $4, $5, $6);`,
      [newSessionId, candidate.id, assessmentId, 'active', browserFingerprint, ipAddress]
    );

    // Check if there is an existing attempt
    const attemptRes = await queryGlobal(
      `SELECT * FROM assessment_attempts WHERE candidate_id = $1 AND assessment_id = $2 LIMIT 1;`,
      [candidate.id, assessmentId]
    );

    let activeAttemptId;
    if (attemptRes.rowCount && attemptRes.rowCount > 0) {
      const existingAttempt = attemptRes.rows[0];
      if (existingAttempt.status === "completed") {
        return res.status(400).json({ error: "Assessment already completed and submitted." });
      }
      activeAttemptId = existingAttempt.id;
      // Update session_id on the existing attempt
      await queryGlobal(
        `UPDATE assessment_attempts SET session_id = $1 WHERE id = $2;`,
        [newSessionId, activeAttemptId]
      );
    } else {
      // Create new attempt linked to new session
      activeAttemptId = crypto.randomUUID();
      await queryGlobal(
        `INSERT INTO assessment_attempts (id, candidate_id, assessment_id, status, session_id) VALUES ($1, $2, $3, $4, $5);`,
        [activeAttemptId, candidate.id, assessmentId, "started", newSessionId]
      );
    }

    // Update session with active attempt id
    await queryGlobal(`UPDATE assessment_sessions SET attempt_id = $1 WHERE id = $2;`, [activeAttemptId, newSessionId]);
    res.json({ success: true, sessionId: newSessionId });
  } catch (err:any) {
    console.error("Force resume failed:", err);
    res.status(500).json({ error: err.message || "Failed force resume" });
  }
});

// Continue with existing routes...

/**
 * POST /api/assessment/submit
 * Candidate finishes the test and submits responses. Calculates final rankings.
 */
router.post("/submit", async (req: any, res: any) => {
  try {
    const { token, answers, sessionId, timeTaken } = req.body as {
      token: string;
      answers: Record<string, string>;
      sessionId: string;
      timeTaken: number; // in seconds
    };

    if (!token || !sessionId) {
      return res.status(400).json({ error: "token and sessionId are required" });
    }

    // Fetch candidate
    const candidateRes = await queryGlobal(
      `SELECT * FROM candidates WHERE assessment_token = $1 LIMIT 1;`,
      [token]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({ error: "Invalid candidate token" });
    }

    const candidate = candidateRes.rows[0];

    // Find assessment
    const assessmentRes = await queryGlobal(
      `SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`,
      [candidate.job_id]
    );

    if (!assessmentRes.rowCount || assessmentRes.rowCount === 0) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    const assessmentId = assessmentRes.rows[0].id;

    // Get attempt
    const attemptRes = await queryGlobal(
      `SELECT * FROM assessment_attempts WHERE candidate_id = $1 AND assessment_id = $2 LIMIT 1;`,
      [candidate.id, assessmentId]
    );

    if (!attemptRes.rowCount || attemptRes.rowCount === 0) {
      return res.status(400).json({ error: "No attempt session found for this candidate" });
    }

    const attempt = attemptRes.rows[0];

    if (attempt.status === "completed") {
      return res.status(400).json({ error: "Assessment has already been submitted." });
    }

    // Session mismatch here does not mean a hijack attempt — GET /:token already
    // transfers the active session to whichever device/tab last loaded the page
    // ("failure-proof access" for candidates who reopen the link, refresh, or
    // switch devices mid-test). If submit still hard-rejected on mismatch, the
    // candidate's own final click could be invalidated by their own earlier
    // page load. Since the token already uniquely identifies the candidate,
    // adopt the incoming session instead of blocking the submission.
    if (attempt.session_id !== sessionId) {
      console.log(`[Session Transfer] Submit from session ${sessionId} differs from stored ${attempt.session_id}; adopting submitting session.`);
      await queryGlobal(`UPDATE assessment_attempts SET session_id = $1 WHERE id = $2;`, [sessionId, attempt.id]);
    }

    // Calculate score
    const questionsRes = await queryGlobal(
      `SELECT id, correct_answer FROM assessment_questions WHERE assessment_id = $1;`,
      [assessmentId]
    );

    let correctCount = 0;
    let incorrectCount = 0;

    questionsRes.rows.forEach(q => {
      const candidateAns = answers[q.id];
      if (candidateAns && candidateAns.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    });

    const totalQuestions = questionsRes.rowCount || 15;
    const assessmentScore = Math.round((correctCount / totalQuestions) * 100);

    // Calculate Final Integrated Score
    // Final Score = (Resume Score * 40%) + (Assessment Score * 60%)
    const resumeScore = candidate.score || 0;
    const finalScore = Number(((resumeScore * 0.4) + (assessmentScore * 0.6)).toFixed(1));

    // Resolve the real job title once, for every downstream email. Using
    // `candidate.role` (a free-text inferred role) produced emails referencing a
    // position the candidate never applied to.
    let jobTitleForEmails = candidate.role || "Open Position";
    try {
      if (candidate.job_id) {
        const jobTitleRes = await queryGlobal(`SELECT title FROM jobs WHERE id = $1 LIMIT 1;`, [candidate.job_id]);
        if (jobTitleRes.rowCount && jobTitleRes.rows[0]?.title) {
          jobTitleForEmails = jobTitleRes.rows[0].title;
        }
      }
    } catch (titleErr) {
      console.error("Failed to resolve job title for assessment emails:", titleErr);
    }

    // Rank candidate.
    //
    // `assessment_status` records the assessment outcome ("did they clear it"),
    // while `status` drives the pipeline stage. Both the Qualified and Review
    // bands cleared the assessment, so both are 'passed' — dashboards count on
    // that. Auto-advancing to interview is gated separately on `final_score`
    // (see AutonomousRecruitmentService step 4), so candidates in the Review band
    // stay with HR instead of being promoted automatically.
    let nextStatus = "Review";
    let kekaStatus = "active";
    let assessmentStatus = "failed";

    if (finalScore >= PIPELINE_THRESHOLDS.INTERVIEW) {
      nextStatus = "Qualified";
      assessmentStatus = "passed";
    } else if (finalScore >= PIPELINE_THRESHOLDS.REVIEW) {
      nextStatus = "Review";
      assessmentStatus = "passed"; // cleared the assessment; overall score needs HR review
    } else {
      nextStatus = "Rejected";
      kekaStatus = "rejected_pool";
      assessmentStatus = "failed";
    }

    // Persist the completed attempt and the candidate's resulting score/status
    // atomically. These were previously two independent UPDATEs; if the process
    // crashed or the DB dropped the connection between them, the attempt could be
    // left marked "completed" while the candidate record never got its score —
    // silently stalling the candidate with no way to resubmit.
    await transaction(async (client) => {
      await client.query(
        `UPDATE assessment_attempts
         SET status = $1, correct_answers = $2, incorrect_answers = $3, score = $4, time_taken = $5, completed_at = now()
         WHERE id = $6;`,
        ["completed", correctCount, incorrectCount, assessmentScore, timeTaken, attempt.id]
      );

      await client.query(
        `UPDATE candidates
         SET assessment_score = $1, assessment_status = $2, final_score = $3, status = $4, keka_status = $5, assessment_completed_at = now()
         WHERE id = $6;`,
        [assessmentScore, assessmentStatus, finalScore, nextStatus, kekaStatus, candidate.id]
      );
    });

    // ── CRITICAL PATH COMPLETE ── Send response immediately so the candidate sees results
    res.json({
      success: true,
      assessmentScore,
      finalScore,
      status: nextStatus,
      correctAnswers: correctCount,
      totalQuestions,
      interviewDetails: null // will be updated asynchronously
    });

    // ── NON-CRITICAL SIDE-EFFECTS (fire-and-forget) ──
    // These run after the response is sent. Failures here are logged but won't affect the candidate.
    (async () => {
      try {
        // Log assessment submission activity
        await queryGlobal(
          `INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
           VALUES ($1, $2, $3);`,
          [
            candidate.id,
            "assessment_submitted",
            `Assessment completed. Score: ${assessmentScore}% (Correct: ${correctCount}/${totalQuestions}). Final score calculated: ${finalScore}% (Ranked: ${nextStatus}).`
          ]
        );
      } catch (logErr) {
        console.error("⚠️ [Side-Effect] Failed to log assessment submission activity:", logErr);
      }

      // Query full questions to build detailed results report
      let fullQuestions: any[] = [];
      try {
        const fullQuestionsRes = await queryGlobal(
          `SELECT id, question_text, options, correct_answer, difficulty, topic 
           FROM assessment_questions 
           WHERE assessment_id = $1 
           ORDER BY id ASC;`,
          [assessmentId]
        );
        fullQuestions = fullQuestionsRes.rows.map(q => ({
          id: q.id,
          question_text: q.question_text,
          options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty,
          topic: q.topic
        }));
      } catch (qErr) {
        console.error("⚠️ [Side-Effect] Failed to query full questions for detailed report:", qErr);
      }

      // Trigger Detailed Assessment Results Email to both Candidate and HR
      try {
        const hrEmail = await resolveHrEmail(candidate.tenant_id);

        if (fullQuestions.length > 0) {
          await sendAssessmentResultDetailsEmail({
            candidateName: candidate.name,
            candidateEmail: candidate.email,
            hrEmail: hrEmail || undefined,
            jobTitle: jobTitleForEmails,
            resumeScore,
            assessmentScore,
            finalScore,
            questions: fullQuestions,
            candidateAnswers: answers,
            tenantId: candidate.tenant_id,
            candidateId: candidate.id
          } as any);
        }
      } catch (mailDetailsErr) {
        console.error("⚠️ [Side-Effect] Failed to trigger detailed results email:", mailDetailsErr);
      }

      // Sync assessment completion stage via Keka
      let interviewDate: Date | null = null;
      let scheduledInterviewId: string | null = null;
      try {
        const kekaResult = await kekaWorkflowService.handleAssessmentCompletion(candidate.id, finalScore);
        if (kekaResult?.interviewDate) {
          interviewDate = new Date(kekaResult.interviewDate);
        }
      } catch (kekaErr) {
        console.error("⚠️ [Side-Effect] Failed to sync assessment completion to Keka:", kekaErr);
      }

      // Fallback: If candidate passed but interview wasn't scheduled via Keka, schedule locally
      if (finalScore >= PIPELINE_THRESHOLDS.INTERVIEW && !interviewDate) {
        const slot = nextBusinessDaySlot(2, 10);

        try {
          const interviewId = crypto.randomUUID();
          // tenant_id was previously omitted here (but supplied by the autonomous
          // cycle), producing tenant-less interview rows invisible to the
          // tenant-scoped HR dashboard queries.
          const insertRes = await queryGlobal(
            `INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, tenant_id)
             SELECT $1, $2::varchar, $3, $4, 'scheduled', $5
              WHERE NOT EXISTS (
                    SELECT 1 FROM interviews
                     WHERE candidate_id = $2::varchar AND status IN ('scheduled', 'completed')
                  )
             ON CONFLICT DO NOTHING
             RETURNING id;`,
            [interviewId, candidate.id, candidate.job_id, slot, candidate.tenant_id]
          );

          if (insertRes.rowCount) {
            interviewDate = slot;
            scheduledInterviewId = interviewId;
            await queryGlobal(
              `UPDATE candidates SET status = 'interviewing' WHERE id = $1;`,
              [candidate.id]
            );
          } else {
            // An interview already exists (e.g. scheduled by the autonomous
            // cycle). Reuse it rather than creating a second booking and a
            // second notification email.
            const existing = await queryGlobal(
              `SELECT id, scheduled_date FROM interviews
                WHERE candidate_id = $1 AND status IN ('scheduled', 'completed')
                ORDER BY scheduled_date ASC LIMIT 1;`,
              [candidate.id]
            );
            if (existing.rowCount) {
              interviewDate = new Date(existing.rows[0].scheduled_date);
              scheduledInterviewId = existing.rows[0].id;
            }
          }
        } catch (intErr) {
          console.error("⚠️ [Side-Effect] Failed to schedule fallback interview:", intErr);
        }
      }

      if (interviewDate) {
        // Log interview scheduling
        try {
          await queryGlobal(
            `INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
             VALUES ($1, 'interview_scheduled', $2);`,
            [
              candidate.id,
              `HR Interview automatically scheduled for ${interviewDate.toLocaleDateString()} at 10:00 AM.`
            ]
          );

          // Update candidate details for legacy screen support
          await queryGlobal(
            `UPDATE candidates 
             SET status = 'interviewing', interview_scheduled_date = $1 
             WHERE id = $2;`,
            [interviewDate, candidate.id]
          );
        } catch (schedErr) {
          console.error("⚠️ [Side-Effect] Failed to log interview scheduling:", schedErr);
        }

        // Trigger automatic emails (Candidate and HR)
        try {
          const hrEmail = await resolveHrEmail(candidate.tenant_id);

          // sendInterviewScheduleEmail self-guards against duplicates, so this is
          // safe even if the autonomous cycle reaches the same candidate.
          await sendInterviewScheduleEmail({
            candidateName: candidate.name,
            candidateEmail: candidate.email,
            jobTitle: jobTitleForEmails,
            resumeScore,
            assessmentScore,
            finalScore,
            scheduledDate: interviewDate,
            hrEmail: hrEmail || undefined,
            tenantId: candidate.tenant_id,
            candidateId: candidate.id,
            interviewId: scheduledInterviewId || undefined,
          });
        } catch (mailErr) {
          console.error("⚠️ [Side-Effect] Failed to trigger automated interview emails:", mailErr);
        }
      }
    })().catch(sideEffectErr => {
      console.error("⚠️ Unhandled side-effect error after assessment submission:", sideEffectErr);
    });

  } catch (err: any) {
    console.error("Failed to submit assessment responses:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to submit assessment" });
    }
  }
});

/**
 * POST /api/assessment/violation
 * Logs an exam violation and increments the violation counts.
 */
router.post("/violation", async (req: any, res: any) => {
  try {
    const { token, violationType, details } = req.body as {
      token: string;
      violationType: string;
      details: string;
    };

    if (!token || !violationType) {
      return res.status(400).json({ error: "token and violationType are required" });
    }

    // Fetch candidate
    const candidateRes = await queryGlobal(
      `SELECT id, job_id, violation_count FROM candidates WHERE assessment_token = $1 LIMIT 1;`,
      [token]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({ error: "Invalid token" });
    }

    const candidate = candidateRes.rows[0];

    // Find assessment
    const assessmentRes = await queryGlobal(
      `SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`,
      [candidate.job_id]
    );

    if (!assessmentRes.rowCount || assessmentRes.rowCount === 0) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    const assessmentId = assessmentRes.rows[0].id;

    // Get attempt
    const attemptRes = await queryGlobal(
      `SELECT id, violation_count FROM assessment_attempts WHERE candidate_id = $1 AND assessment_id = $2 LIMIT 1;`,
      [candidate.id, assessmentId]
    );

    if (!attemptRes.rowCount || attemptRes.rowCount === 0) {
      return res.status(400).json({ error: "No active attempt found" });
    }

    const attempt = attemptRes.rows[0];

    // Insert violation
    await queryGlobal(
      `INSERT INTO assessment_violations (candidate_id, attempt_id, violation_type, details)
       VALUES ($1, $2, $3, $4);`,
      [candidate.id, attempt.id, violationType, details]
    );

    // Update violation counts
    const newAttemptViolations = (attempt.violation_count || 0) + 1;
    const newCandidateViolations = (candidate.violation_count || 0) + 1;

    await queryGlobal(
      `UPDATE assessment_attempts SET violation_count = $1 WHERE id = $2;`,
      [newAttemptViolations, attempt.id]
    );

    await queryGlobal(
      `UPDATE candidates SET violation_count = $1 WHERE id = $2;`,
      [newCandidateViolations, candidate.id]
    );

    // Log to activity logs
    await queryGlobal(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
       VALUES ($1, $2, $3);`,
      [candidate.id, "assessment_violation", `Violation detected: ${details}`]
    );

    console.warn(`⚠️ Security Violation logged for candidate ${candidate.id}: ${details}`);
    res.json({ success: true, count: newAttemptViolations });
  } catch (err: any) {
    console.error("Failed to log security violation:", err);
    res.status(500).json({ error: err.message || "Failed to log violation" });
  }
});

/**
 * GET /api/candidate/results
 * Fetches assessment attempt details to display on the result scorecard page.
 */
router.get("/results/get", async (req: any, res: any) => {
  try {
    const { token } = req.query as { token: string };

    if (!token) {
      return res.status(400).json({ error: "token parameter is required" });
    }

    const candidateRes = await queryGlobal(
      `SELECT c.*, j.title as job_title 
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       WHERE c.assessment_token = $1 LIMIT 1;`,
      [token]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const candidate = candidateRes.rows[0];

    // Find assessment attempt details
    const attemptRes = await queryGlobal(
      `SELECT * FROM assessment_attempts WHERE candidate_id = $1 ORDER BY started_at DESC LIMIT 1;`,
      [candidate.id]
    );

    if (!attemptRes.rowCount || attemptRes.rowCount === 0) {
      return res.status(404).json({ error: "No assessment attempts found for this candidate" });
    }

    const attempt = attemptRes.rows[0];

    // Status mapping: PASS or FAIL
    const testStatus = candidate.assessment_score >= 70 ? "PASS" : "FAIL";

    res.json({
      success: true,
      candidateName: candidate.name,
      jobRole: candidate.role,
      resumeScore: candidate.score,
      assessmentScore: candidate.assessment_score,
      finalScore: Number(candidate.final_score),
      totalQuestions: attempt.correct_answers !== null && attempt.incorrect_answers !== null
        ? (attempt.correct_answers + attempt.incorrect_answers)
        : 15,
      correctAnswers: attempt.correct_answers,
      incorrectAnswers: attempt.incorrect_answers,
      timeTaken: attempt.time_taken,
      violationCount: attempt.violation_count,
      status: testStatus,
      rankingStatus: candidate.status,
    });
  } catch (err: any) {
    console.error("Failed to fetch candidate assessment results:", err);
    res.status(500).json({ error: err.message || "Failed to retrieve results" });
  }
});

// GET /api/assessment/job-info/:jobId - fetches job details for public portal
router.get("/job-info/:jobId", async (req: any, res: any) => {
  try {
    const { jobId } = req.params;
    const jobRes = await queryGlobal(
      `SELECT title, description, COALESCE(status, 'active') as status, sync_status
       FROM jobs WHERE id = $1 LIMIT 1;`,
      [jobId]
    );
    if (!jobRes.rowCount || jobRes.rowCount === 0) {
      return res.status(404).json({ error: "Job opening not found." });
    }
    const job = jobRes.rows[0];
    if (job.status !== "active" || job.sync_status === "removed") {
      return res.status(409).json({ error: "This position is no longer open." });
    }

    // Ensure an assessment exists for this job instead of 404ing on it.
    //
    // A job newly synced from the ATS has no assessment until someone is
    // actually invited (see POST /public-register and POST /send, which both
    // already call ensureJobAssessment). This GET used to just check for one
    // and fail closed — so a candidate opening the public link for ANY job
    // that hadn't yet had a candidate register saw "No assessment configured",
    // even though registering was the very next step and would have created
    // it anyway. That made every brand-new job's link fail on first click.
    await ensureJobAssessment(jobId, job.title, job.description || job.title);

    res.json({ title: job.title, description: job.description });
  } catch (err: any) {
    console.error("Failed to load job details:", err);
    res.status(500).json({ error: err.message || "Failed to load job details" });
  }
});

// POST /api/assessment/public-register - registers a candidate dynamically from a public link
router.post("/public-register", rateLimiter(15 * 60 * 1000, 10), async (req: any, res: any) => {
  try {
    const { jobId, name, email, phone } = req.body as {
      jobId: string;
      name: string;
      email: string;
      phone?: string;
    };

    if (!jobId || !name || !email) {
      return res.status(400).json({ error: "jobId, name, and email are required." });
    }

    // 1. Fetch job to make sure it exists
    const jobRes = await queryGlobal(`SELECT title, tenant_id FROM jobs WHERE id = $1 LIMIT 1;`, [jobId]);
    if (!jobRes.rowCount || jobRes.rowCount === 0) {
      return res.status(404).json({ error: "Job opening not found." });
    }
    const job = jobRes.rows[0];

    // 2. Fetch assessment to make sure it exists (auto-generate if missing)
    const assessmentRes = await queryGlobal(`SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`, [jobId]);
    if (!assessmentRes.rowCount || assessmentRes.rowCount === 0) {
      await ensureJobAssessment(jobId, job.title, job.description || `Autogenerated job description for ${job.title}`);
    }

    // 3. Check if candidate is already registered for this job
    const candidateCheck = await queryGlobal(
      `SELECT id, created_at, assessment_token, assessment_status FROM candidates WHERE email = $1 AND job_id = $2 LIMIT 1;`,
      [email, jobId]
    );

    if (candidateCheck.rowCount && candidateCheck.rowCount > 0) {
      const existingCandidate = candidateCheck.rows[0];
      const appliedTime = new Date(existingCandidate.created_at).getTime();
      const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;

      if (Date.now() - appliedTime < twoYearsMs) {
        return res.json({ 
          success: true, 
          token: existingCandidate.assessment_token, 
          message: "Retrieved existing test registration link.",
          assessmentStatus: existingCandidate.assessment_status
        });
      } else {
        console.log(`[Cooling Off Passed] Removing old candidate records for candidate ${existingCandidate.id}`);
        const oldId = existingCandidate.id;
        await queryGlobal(`DELETE FROM candidate_activity_logs WHERE candidate_id = $1;`, [oldId]);
        await queryGlobal(`DELETE FROM candidate_timeline WHERE candidate_id = $1;`, [oldId]);
        await queryGlobal(`DELETE FROM candidate_documents WHERE candidate_id = $1;`, [oldId]);
        await queryGlobal(`DELETE FROM interviews WHERE candidate_id = $1;`, [oldId]);
        await queryGlobal(`DELETE FROM candidates WHERE id = $1;`, [oldId]);
      }
    }

    // 4. Register new candidate
    const candidateId = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString("hex");
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7); // 7 days expiry
    const appliedDate = new Date().toISOString().split("T")[0];

    const targetTenantId = job.tenant_id || process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";

    await queryGlobal(
      `INSERT INTO candidates (
        id, name, email, phone, role, score, match_percent, experience_years, 
        status, application_source, job_id, assessment_token, assessment_token_expiry, assessment_status, applied_date, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16);`,
      [
        candidateId, name, email, phone || null, job.title, 0, 0, 0, 
        "applied", "public_link", jobId, token, expiry, "pending", appliedDate, targetTenantId
      ]
    );

    // Log activity
    await queryGlobal(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
       VALUES ($1, $2, $3, $4);`,
      [candidateId, "assessment_invited", `Public link registration. Token generated: ${token}`, job.tenant_id]
    );

    res.json({ success: true, token });
  } catch (err: any) {
    console.error("Failed to register public candidate:", err);
    res.status(500).json({ error: err.message || "Failed to register candidate" });
  }
});

/**
 * POST /api/assessment/regenerate
 * Admin/Recruiter endpoint to regenerate assessment questions for a job.
 * Deletes old stale questions and creates new role-specific ones.
 */
router.post("/regenerate", async (req: any, res: any) => {
  try {
    const { jobId } = req.body as { jobId: string };
    if (!jobId) {
      return res.status(400).json({ error: "jobId is required" });
    }

    // Look up job details
    const jobRes = await queryGlobal(
      `SELECT id, title, description FROM jobs WHERE id = $1 LIMIT 1;`,
      [jobId]
    );
    if (!jobRes.rowCount || jobRes.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    const job = jobRes.rows[0];

    // Also reset any existing candidate attempts for this job's assessment
    // so candidates can re-take with fresh questions
    const existingAssessment = await queryGlobal(
      `SELECT id FROM assessments WHERE job_id = $1 ORDER BY created_at ASC LIMIT 1;`,
      [jobId]
    );
    if (existingAssessment.rowCount && existingAssessment.rowCount > 0) {
      const oldId = existingAssessment.rows[0].id;
      await queryGlobal(`DELETE FROM assessment_attempts WHERE assessment_id = $1;`, [oldId]);
    }

    const newAssessmentId = await regenerateJobAssessment(
      job.id,
      job.title,
      job.description || `Job opening for ${job.title}`
    );

    // Fetch new questions for confirmation
    const questionsRes = await queryGlobal(
      `SELECT id, question_text, difficulty, topic FROM assessment_questions WHERE assessment_id = $1 ORDER BY id ASC;`,
      [newAssessmentId]
    );

    res.json({
      success: true,
      assessmentId: newAssessmentId,
      questionsCount: questionsRes.rowCount,
      questions: questionsRes.rows.map(q => ({
        id: q.id,
        questionText: q.question_text,
        difficulty: q.difficulty,
        topic: q.topic
      }))
    });
  } catch (err: any) {
    console.error("Failed to regenerate assessment:", err);
    res.status(500).json({ error: err.message || "Failed to regenerate assessment" });
  }
});

export default router;
