// src/api/routes/clientSubmissionsRouter.ts
import { Router } from "express";
import crypto from "crypto";
import { queryTenant } from "../../lib/tenantDb.js";
import { logTimelineEvent } from "../../lib/timeline.js";

const router = Router({ mergeParams: true });

async function checkCandidateExists(candidateId: string): Promise<boolean> {
  const result = await queryTenant(
    "SELECT id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
    [candidateId]
  );
  return result.rowCount! > 0;
}

// GET /api/candidates/:id/submissions - Fetch submission logs for a candidate
router.get("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const result = await queryTenant(
      `SELECT s.*, j.title as job_title, u.name as submitter_name 
       FROM client_submissions s 
       JOIN jobs j ON s.job_id = j.id 
       LEFT JOIN users u ON s.submitted_by = u.id 
       WHERE s.candidate_id = $1 AND s.tenant_id = :tenant_id 
       ORDER BY s.submitted_at DESC;`,
      [id]
    );

    res.json({ success: true, submissions: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/:id/submissions - Create a new client submission
router.post("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    const { jobId, clientName, feedback } = req.body;
    const submitterId = req.user?.userId || null;

    if (!jobId || !clientName) {
       res.status(400).json({ success: false, error: "jobId and clientName are required" });
       return;
    }

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    // Verify job exists
    const jobCheck = await queryTenant(
      "SELECT title FROM jobs WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [jobId]
    );

    if (jobCheck.rowCount === 0) {
       res.status(404).json({ success: false, error: "Job opening not found" });
       return;
    }

    const submissionId = crypto.randomUUID();
    await queryTenant(
      `INSERT INTO client_submissions (id, tenant_id, candidate_id, job_id, client_name, submitted_by, submission_status, feedback)
       VALUES ($1, :tenant_id, $2, $3, $4, $5, 'Submitted', $6);`,
      [submissionId, id, jobId, clientName, submitterId, feedback || null]
    );

    // Auto-log to candidate timeline
    await logTimelineEvent(
      id,
      "candidate_submitted_to_client",
      "Candidate Submitted To Client",
      `Submitted to client "${clientName}" for job "${jobCheck.rows[0].title}".`,
      submitterId
    );

    res.status(201).json({ success: true, submissionId, message: "Client submission logged successfully" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/candidates/:id/submissions/:submissionId - Update submission status
router.put("/:submissionId", async (req: any, res, next) => {
  try {
    const { id, submissionId } = req.params;
    const { status, feedback } = req.body as { status: string; feedback?: string };

    const validStatuses = ["Submitted", "Under Review", "Interview Requested", "Rejected", "Selected"];
    if (!status || !validStatuses.includes(status)) {
       res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
       return;
    }

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const checkRes = await queryTenant(
      "SELECT s.*, j.title as job_title FROM client_submissions s JOIN jobs j ON s.job_id = j.id WHERE s.id = $1 AND s.candidate_id = $2 AND s.tenant_id = :tenant_id LIMIT 1;",
      [submissionId, id]
    );

    if (checkRes.rowCount === 0) {
       res.status(404).json({ success: false, error: "Submission record not found" });
       return;
    }

    const submission = checkRes.rows[0];

    await queryTenant(
      `UPDATE client_submissions 
       SET submission_status = $1, feedback = COALESCE($2, feedback) 
       WHERE id = $3 AND tenant_id = :tenant_id;`,
      [status, feedback || null, submissionId]
    );

    // Auto-log to timeline based on status shift
    const updaterId = req.user?.userId || null;
    await logTimelineEvent(
      id,
      status === "Rejected" ? "rejected" : status === "Selected" ? "hired" : "stage_changed",
      `Client Submission Update: ${status}`,
      `Submission status for client "${submission.client_name}" changed to "${status}".`,
      updaterId
    );

    res.json({ success: true, message: "Client submission status updated successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
