// src/api/routes/interviewRouter.ts
import { Router } from "express";
import { query } from "../../lib/db";
import { sendInterviewScheduleEmail } from "../../lib/email";

const router = Router();

/**
 * POST /api/interview/schedule
 * Manually schedules or updates an interview for a candidate.
 */
router.post("/schedule", async (req: any, res: any) => {
  try {
    const { candidateId, scheduledDate, feedback } = req.body as {
      candidateId: string;
      scheduledDate: string;
      feedback?: string;
    };

    if (!candidateId || !scheduledDate) {
      return res.status(400).json({ error: "candidateId and scheduledDate are required" });
    }

    const sDate = new Date(scheduledDate);
    if (isNaN(sDate.getTime())) {
      return res.status(400).json({ error: "Invalid scheduledDate format" });
    }

    // Fetch candidate
    const candidateRes = await query(
      `SELECT * FROM candidates WHERE id = $1 LIMIT 1;`,
      [candidateId]
    );

    if (!candidateRes.rowCount || candidateRes.rowCount === 0) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const candidate = candidateRes.rows[0];

    // Check if interview already exists
    const checkInterview = await query(
      `SELECT id FROM interviews WHERE candidate_id = $1 LIMIT 1;`,
      [candidateId]
    );

    const interviewId = checkInterview.rowCount && checkInterview.rowCount > 0
      ? checkInterview.rows[0].id
      : `interview-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    if (checkInterview.rowCount && checkInterview.rowCount > 0) {
      await query(
        `UPDATE interviews SET scheduled_date = $1, status = 'scheduled' WHERE id = $2;`,
        [sDate, interviewId]
      );
    } else {
      await query(
        `INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status)
         VALUES ($1, $2, $3, $4, $5);`,
        [interviewId, candidateId, candidate.job_id, sDate, "scheduled"]
      );
    }

    // Update candidate
    await query(
      `UPDATE candidates 
       SET status = 'interviewing', interview_scheduled_date = $1, interview_feedback = $2
       WHERE id = $3;`,
      [sDate, feedback || null, candidateId]
    );

    // Log Activity
    await query(
      `INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
       VALUES ($1, $2, $3);`,
      [
        candidateId,
        "interview_scheduled",
        `HR Interview scheduled for ${sDate.toLocaleDateString()} at ${sDate.toLocaleTimeString()}.`
      ]
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
        hrEmail: "yogeshkumarwadhwa@localhost.com",
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
    console.error("Manual interview scheduling failed:", err);
    res.status(500).json({ error: err.message || "Failed to schedule interview" });
  }
});

export default router;
