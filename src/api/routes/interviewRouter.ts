// src/api/routes/interviewRouter.ts
import { Router } from "express";
import { queryTenant } from "../../lib/tenantDb.js";
import { sendInterviewScheduleEmail } from "../../lib/email.js";
import { logTimelineEvent } from "../../lib/timeline.js";

const router = Router();

// GET /api/interview/candidate/:candidateId - Fetch interviews for a candidate
router.get("/candidate/:candidateId", async (req: any, res: any, next: any) => {
  try {
    const { candidateId } = req.params;
    const result = await queryTenant(
      `SELECT * FROM interviews 
       WHERE candidate_id = $1 AND tenant_id = :tenant_id 
       ORDER BY scheduled_date DESC;`,
      [candidateId]
    );
    res.json({ success: true, interviews: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/interview/schedule - Manually schedules or updates an interview
router.post("/schedule", async (req: any, res: any, next: any) => {
  try {
    const { candidateId, scheduledDate, feedback } = req.body as {
      candidateId: string;
      scheduledDate: string;
      feedback?: string;
    };

    if (!candidateId || !scheduledDate) {
       res.status(400).json({ error: "candidateId and scheduledDate are required" });
       return;
    }

    const sDate = new Date(scheduledDate);
    if (isNaN(sDate.getTime())) {
       res.status(400).json({ error: "Invalid scheduledDate format" });
       return;
    }

    // Fetch candidate scoped by tenant
    const candidateRes = await queryTenant(
      `SELECT * FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;`,
      [candidateId]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
       res.status(404).json({ error: "Candidate not found under your account" });
       return;
    }

    const candidate = candidateRes.rows[0];

    // Check if interview already exists scoped by tenant
    const checkInterview = await queryTenant(
      `SELECT id FROM interviews WHERE candidate_id = $1 AND tenant_id = :tenant_id LIMIT 1;`,
      [candidateId]
    );

    const interviewId = checkInterview.rowCount && checkInterview.rowCount > 0
      ? checkInterview.rows[0].id
      : `interview-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    if (checkInterview.rowCount && checkInterview.rowCount > 0) {
      await queryTenant(
        `UPDATE interviews SET scheduled_date = $1, status = 'scheduled' WHERE id = $2 AND tenant_id = :tenant_id;`,
        [sDate, interviewId]
      );
    } else {
      await queryTenant(
        `INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, tenant_id)
         VALUES ($1, $2, $3, $4, $5, :tenant_id);`,
        [interviewId, candidateId, candidate.job_id, sDate, "scheduled"]
      );
    }

    // Update candidate status
    await queryTenant(
      `UPDATE candidates 
       SET status = 'interviewing', interview_scheduled_date = $1, interview_feedback = $2
       WHERE id = $3 AND tenant_id = :tenant_id;`,
      [sDate, feedback || null, candidateId]
    );

    const authorId = req.user?.userId || null;

    // Log Activity & Timeline Event
    await queryTenant(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
       VALUES ($1, $2, $3, :tenant_id);`,
      [candidateId, "interview_scheduled", `HR Interview scheduled for ${sDate.toLocaleString()}.`]
    );

    await logTimelineEvent(
      candidateId,
      "interview_scheduled",
      "Interview Scheduled",
      `HR Interview scheduled for ${sDate.toLocaleDateString()} at ${sDate.toLocaleTimeString()}.`,
      authorId
    );

    // Send emails
    const resumeScore = candidate.score || 0;
    const assessmentScore = candidate.assessment_score || 0;
    const finalScore = candidate.final_score 
      ? Number(candidate.final_score)
      : Number(((resumeScore * 0.4) + (assessmentScore * 0.6)).toFixed(1));

    try {
      await sendInterviewScheduleEmail({
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle: candidate.role,
        resumeScore,
        assessmentScore,
        finalScore,
        scheduledDate: sDate,
        hrEmail: req.user?.email || "yogeshkumarwadhwa@localhost.com",
      });
    } catch (mailErr) {
      console.error("Failed to send manual interview schedule email:", mailErr);
    }

    res.json({
      success: true,
      interviewId,
      scheduledDate: sDate,
      status: "interviewing"
    });
  } catch (err: any) {
    next(err);
  }
});

// POST /api/interview/feedback - Record interview feedback and score
router.post("/feedback", async (req: any, res: any, next: any) => {
  try {
    const { candidateId, interviewId, feedback } = req.body;
    if (!candidateId || !interviewId || !feedback) {
      res.status(400).json({ error: "candidateId, interviewId and feedback are required" });
      return;
    }

    const checkCandidate = await queryTenant(
      `SELECT id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;`,
      [candidateId]
    );
    if (checkCandidate.rowCount === 0) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    await queryTenant(
      `UPDATE interviews 
       SET feedback = $1, status = 'completed' 
       WHERE id = $2 AND candidate_id = $3 AND tenant_id = :tenant_id;`,
      [feedback, interviewId, candidateId]
    );

    await queryTenant(
      `UPDATE candidates 
       SET interview_feedback = $1 
       WHERE id = $2 AND tenant_id = :tenant_id;`,
      [feedback, candidateId]
    );

    const authorId = req.user?.userId || null;

    // Log Activity & Timeline Event
    await queryTenant(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
       VALUES ($1, $2, $3, :tenant_id);`,
      [candidateId, "interview_feedback_added", "Interview feedback submitted by interviewer."]
    );

    await logTimelineEvent(
      candidateId,
      "interview_feedback_added",
      "Interview Feedback Added",
      feedback,
      authorId
    );

    res.json({ success: true, message: "Interview feedback recorded successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
