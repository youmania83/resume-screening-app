// src/api/routes/candidatePortalRouter.ts
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { queryGlobal, queryTenant } from "../../lib/tenantDb.js";
import { tenantStorage, getTenantContext } from "../../lib/tenantContext.js";
import { logTimelineEvent } from "../../lib/timeline.js";
import { StorageManager } from "../../lib/storage/StorageProvider.js";
import { IngestQueue } from "../../lib/queue/ingestQueue.js";

const upload = multer({ dest: "uploads/" });
const router = Router();

const ACCEPTED_EXTS = [".pdf", ".docx", ".doc", ".txt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit for candidate updates

// Middleware to resolve tenant context for guest candidates
async function resolveCandidatePortalContext(req: any, res: any, next: any) {
  try {
    const token = req.params.token;
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "Access token is required." });
      return;
    }

    const result = await queryGlobal(
      "SELECT tenant_id FROM candidates WHERE assessment_token = $1 LIMIT 1;",
      [token]
    );

    if (!result.rowCount || result.rowCount === 0) {
      res.status(404).json({ error: "Access token is invalid or expired." });
      return;
    }

    const tenantId = result.rows[0].tenant_id;
    tenantStorage.run({ tenantId, userId: "guest", role: "candidate" }, () => {
      next();
    });
  } catch (err) {
    next(err);
  }
}

router.use("/:token", resolveCandidatePortalContext);

/**
 * GET /api/candidate-portal/:token
 * Fetches application status, matching job title, interview details, and basic profile info.
 */
router.get("/:token", async (req: any, res: any, next: any) => {
  try {
    const { token } = req.params;

    // Get candidate profile
    const candRes = await queryTenant(
      `SELECT id, name, email, phone, role, status, applied_date, job_id, final_score 
       FROM candidates 
       WHERE assessment_token = $1 AND tenant_id = :tenant_id 
       LIMIT 1;`,
      [token]
    );

    if (candRes.rowCount === 0) {
      res.status(404).json({ error: "Candidate not found." });
      return;
    }

    const candidate = candRes.rows[0];

    // Fetch matching job info
    let job = null;
    if (candidate.job_id) {
      const jobRes = await queryTenant(
        "SELECT id, title, description, department, location FROM jobs WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
        [candidate.job_id]
      );
      if (jobRes.rowCount && jobRes.rowCount > 0) {
        job = jobRes.rows[0];
      }
    }

    // Fetch scheduled interviews
    const interviewRes = await queryTenant(
      `SELECT id, scheduled_date, status, feedback 
       FROM interviews 
       WHERE candidate_id = $1 AND tenant_id = :tenant_id 
       ORDER BY scheduled_date DESC;`,
      [candidate.id]
    );

    const interviews = interviewRes.rows;

        // Fetch documents
    const docRes = await queryTenant(
      `SELECT id, title, file_url, document_type, version, uploaded_at 
       FROM candidate_documents 
       WHERE candidate_id = $1 AND tenant_id = :tenant_id 
       ORDER BY uploaded_at DESC;`,
      [candidate.id]
    );

    // Fetch tenant white-label branding
    const brandingRes = await queryTenant(
      "SELECT name, logo_url, primary_color, email_footer FROM tenants WHERE id = :tenant_id LIMIT 1;"
    );
    const tenantInfo = brandingRes.rows[0];

    res.json({
      success: true,
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        role: candidate.role,
        status: candidate.status,
        appliedDate: candidate.applied_date,
        finalScore: candidate.final_score
      },
      job,
      interviews,
      documents: docRes.rows,
      branding: {
        companyName: tenantInfo?.name || "IRA SaaS",
        logoUrl: tenantInfo?.logo_url || "",
        primaryColor: tenantInfo?.primary_color || "#0f172a",
        emailFooter: tenantInfo?.email_footer || ""
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/candidate-portal/:token/confirm
 * Confirms a scheduled interview slot.
 */
router.post("/:token/confirm", async (req: any, res: any, next: any) => {
  try {
    const { token } = req.params;
    const { interviewId } = req.body;

    if (!interviewId) {
      res.status(400).json({ error: "interviewId is required." });
      return;
    }

    const candRes = await queryTenant(
      "SELECT id FROM candidates WHERE assessment_token = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [token]
    );
    const candidateId = candRes.rows[0].id;

    // Verify interview exists and belongs to this candidate
    const intRes = await queryTenant(
      "SELECT id, scheduled_date FROM interviews WHERE id = $1 AND candidate_id = $2 AND tenant_id = :tenant_id LIMIT 1;",
      [interviewId, candidateId]
    );

    if (intRes.rowCount === 0) {
      res.status(404).json({ error: "Interview record not found." });
      return;
    }

    const interview = intRes.rows[0];

    // Update interview status
    await queryTenant(
      "UPDATE interviews SET status = 'confirmed' WHERE id = $1 AND tenant_id = :tenant_id;",
      [interviewId]
    );

    // Log to Timeline
    await logTimelineEvent(
      candidateId,
      "Candidate Confirmed Interview",
      "Interview Confirmed",
      `Candidate confirmed the interview slot scheduled for ${new Date(interview.scheduled_date).toLocaleString()}.`,
      null
    );

    res.json({ success: true, message: "Interview slot confirmed successfully." });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/candidate-portal/:token/reschedule
 * Submits a reschedule request for an interview.
 */
router.post("/:token/reschedule", async (req: any, res: any, next: any) => {
  try {
    const { token } = req.params;
    const { interviewId, message } = req.body;

    if (!interviewId || !message) {
      res.status(400).json({ error: "interviewId and proposed availability message are required." });
      return;
    }

    const candRes = await queryTenant(
      "SELECT id FROM candidates WHERE assessment_token = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [token]
    );
    const candidateId = candRes.rows[0].id;

    // Verify interview belongs to candidate
    const intRes = await queryTenant(
      "SELECT id FROM interviews WHERE id = $1 AND candidate_id = $2 AND tenant_id = :tenant_id LIMIT 1;",
      [interviewId, candidateId]
    );

    if (intRes.rowCount === 0) {
      res.status(404).json({ error: "Interview record not found." });
      return;
    }

    // Update interview status and save message as temporary feedback/notes
    await queryTenant(
      "UPDATE interviews SET status = 'reschedule_requested', feedback = $1 WHERE id = $2 AND tenant_id = :tenant_id;",
      [message, interviewId]
    );

    // Log to Timeline
    await logTimelineEvent(
      candidateId,
      "Candidate Requested Reschedule",
      "Reschedule Requested",
      `Candidate requested to reschedule interview. Message: "${message}"`,
      null
    );

    res.json({ success: true, message: "Reschedule request logged successfully." });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/candidate-portal/:token/resume
 * Uploads an updated version of the candidate's resume.
 */
router.post("/:token/resume", upload.single("file"), async (req: any, res: any, next: any) => {
  try {
    const { token } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No file was uploaded." });
      return;
    }

    const candRes = await queryTenant(
      "SELECT id, name, email, job_id FROM candidates WHERE assessment_token = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [token]
    );
    const candidate = candRes.rows[0];
    const tenantId = getTenantContext()?.tenantId || "default-tenant";

    const ext = path.extname(file.originalname).toLowerCase();

    // Validate size and extension
    if (!ACCEPTED_EXTS.includes(ext)) {
      res.status(400).json({ error: `Unsupported file extension: ${ext}` });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      res.status(400).json({ error: "File exceeds 10MB limit." });
      return;
    }

    const fileBuffer = fs.readFileSync(file.path);

    // Clean up multer's temporary file
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      console.warn("Failed to delete temporary file:", e);
    }

    // Upload to S3/Local Storage provider
    const storage = StorageManager.getProvider();
    const storageMeta = await storage.uploadFile(tenantId, file.originalname, fileBuffer);

    // Find current document version count to increment
    const versionRes = await queryTenant(
      "SELECT COUNT(*) as count FROM candidate_documents WHERE candidate_id = $1 AND tenant_id = :tenant_id;",
      [candidate.id]
    );
    const newVersion = parseInt(versionRes.rows[0].count, 10) + 1;

    // Create Document record
    await queryTenant(
      `INSERT INTO candidate_documents (id, tenant_id, candidate_id, title, file_url, document_type, version, uploaded_at)
       VALUES ($1, :tenant_id, $2, $3, $4, 'Resume', $5, CURRENT_TIMESTAMP);`,
      [crypto.randomUUID(), candidate.id, file.originalname, storageMeta.fileUrl, newVersion]
    );

    // Create inbox item for background parsing & match re-calculation
    const inboxId = crypto.randomUUID();
    const fileHash = crypto.createHash("md5").update(fileBuffer).digest("hex");

    await queryGlobal(
      `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, file_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [inboxId, tenantId, file.originalname, storageMeta.fileUrl, fileHash]
    );

    const tempPath = path.resolve("uploads", `${inboxId}${ext}`);
    await fs.promises.writeFile(tempPath, fileBuffer);

    // Enqueue parsing job with targetJobId
    await IngestQueue.enqueue(tenantId, inboxId, tempPath, file.mimetype, candidate.job_id || undefined);

    // Log to Timeline
    await logTimelineEvent(
      candidate.id,
      "Candidate Updated Resume",
      "Updated Resume Uploaded",
      `Candidate uploaded updated resume: "${file.originalname}" (Version ${newVersion}). Background parsing enqueued.`,
      null
    );

    res.json({ success: true, message: "Resume updated successfully. System is recalculating your score." });
  } catch (err) {
    next(err);
  }
});

export default router;
