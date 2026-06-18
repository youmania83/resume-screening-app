// src/api/routes/candidateRouter.ts
import { Router } from "express";
import { query } from "../../lib/db";

const router = Router();

// GET /api/candidates
router.get("/", async (req, res) => {
  try {
    const candidatesRes = await query("SELECT * FROM candidates ORDER BY created_at DESC;");
    console.log('🔎 Fetched candidates rows:', candidatesRes.rowCount);
    const logsRes = await query("SELECT * FROM candidate_activity_logs ORDER BY logged_at ASC;");
    console.log('🔎 Fetched activity logs rows:', logsRes.rowCount);
    
    const logsMap = logsRes.rows.reduce((acc: any, log: any) => {
      if (!acc[log.candidate_id]) {
        acc[log.candidate_id] = [];
      }
      acc[log.candidate_id].push({
        date: log.logged_at,
        message: log.message
      });
      return acc;
    }, {});
    
    const candidates = candidatesRes.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      score: row.score,
      matchPercent: row.match_percent,
      experienceYears: row.experience_years,
      experienceMatch: row.experience_match,
      recommendation: row.recommendation,
      confidence: row.confidence,
      riskLevel: row.risk_level,
      strengths: row.strengths || [],
      weaknesses: row.weaknesses || [],
      missingSkills: row.missing_skills || [],
      matchedSkills: row.matched_skills || [],
      skills: row.skills || [],
      certifications: row.certifications || [],
      projects: row.projects || [],
      keywords: row.keywords || [],
      status: row.status,
      applicationSource: row.application_source,
      assessmentScore: row.assessment_score,
      assessmentStatus: row.assessment_status,
      interviewScheduledDate: row.interview_scheduled_date,
      interviewFeedback: row.interview_feedback,
      kekaStatus: row.keka_status,
      appliedDate: row.applied_date,
      finalScore: row.final_score,
      violationCount: row.violation_count,
      assessmentCompletedAt: row.assessment_completed_at,
      assessmentToken: row.assessment_token,
      activityLogs: logsMap[row.id] || []
    }));
    
    res.json({ success: true, candidates });
  } catch (err: any) {
    console.error("Failed to fetch candidates:", err);
    res.status(500).json({ error: err.message || "Failed to fetch candidates" });
  }
});

// POST /api/candidates
router.post("/", async (req, res) => {
  try {
    const c = req.body;
    const appliedDate = c.appliedDate || new Date().toISOString().split("T")[0];
    
    await query(
      `INSERT INTO candidates (
        id, name, email, phone, role, score, match_percent, experience_years, 
        experience_match, recommendation, confidence, risk_level, strengths, 
        weaknesses, missing_skills, matched_skills, skills, certifications, 
        projects, keywords, status, application_source, keka_status, applied_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24);`,
      [
        c.id,
        c.name,
        c.email || "",
        c.phone || "",
        c.role,
        c.score,
        c.score,
        c.experienceYears || 0,
        c.experienceMatch || "",
        c.recommendation || "",
        c.confidence || "",
        c.riskLevel || "Low",
        c.strengths || [],
        c.weaknesses || [],
        c.missingSkills || [],
        c.matchedSkills || [],
        c.skills || [],
        c.certifications || [],
        c.projects || [],
        c.keywords || [],
        c.status || "applied",
        c.applicationSource || "Careers Page",
        c.kekaStatus || "active",
        appliedDate
      ]
    );

    // Initial logs
    await query(
      "INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);",
      [c.id, "application_received", `Application received through ${c.applicationSource || "Careers Page"}`]
    );
    await query(
      "INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);",
      [c.id, "ai_screened", `AI resume parsing complete. Score: ${c.score}/100.`]
    );

    res.status(201).json({ success: true });
  } catch (err: any) {
    console.error("Failed to create candidate:", err);
    res.status(500).json({ error: err.message || "Failed to create candidate" });
  }
});

// DELETE /api/candidates/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM candidate_activity_logs WHERE candidate_id = $1;", [id]);
    await query("DELETE FROM candidates WHERE id = $1;", [id]);
    res.json({ success: true, message: `Candidate ${id} deleted successfully.` });
  } catch (err: any) {
    console.error("Failed to delete candidate:", err);
    res.status(500).json({ error: err.message || "Failed to delete candidate" });
  }
});

// POST /api/candidates/:id/submit-assessment
router.post("/:id/submit-assessment", async (req, res) => {
  try {
    const { id } = req.params;
    const { score } = req.body as { score: number };
    
    let status = "rejected";
    let kekaStatus = "rejected_pool";
    let assessmentStatus = "failed";
    let logMessage = `Candidate failed assessment with score ${score}/100. Moved to Rejected Pool in Keka HRMS.`;
    let interviewScheduledDate = null;
    
    if (score >= 70) {
      status = "interviewing";
      kekaStatus = "active";
      assessmentStatus = "passed";
      // Schedule interview for 2 days from now at 10 AM
      const date = new Date();
      date.setDate(date.getDate() + 2);
      date.setHours(10, 0, 0, 0);
      interviewScheduledDate = date;
      logMessage = `Candidate passed assessment with score ${score}/100. HR Interview scheduled for ${date.toLocaleDateString()} at 10:00 AM with HR Manager.`;
    }
    
    await query(
      `UPDATE candidates 
       SET status = $1, keka_status = $2, assessment_status = $3, assessment_score = $4, interview_scheduled_date = $5
       WHERE id = $6;`,
      [status, kekaStatus, assessmentStatus, score, interviewScheduledDate, id]
    );
    
    await query(
      "INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);",
      [id, "assessment_completed", logMessage]
    );
    
    res.json({ 
      success: true, 
      status, 
      kekaStatus, 
      assessmentStatus, 
      assessmentScore: score, 
      interviewScheduledDate,
      logMessage 
    });
  } catch (err: any) {
    console.error("Failed to submit assessment:", err);
    res.status(500).json({ error: err.message || "Failed to submit assessment" });
  }
});

// POST /api/candidates/:id/submit-interview
router.post("/:id/submit-interview", async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, feedback } = req.body as { decision: "pass" | "fail"; feedback: string };
    
    let status = "rejected";
    let kekaStatus = "rejected_pool";
    let logMessage = `Candidate rejected in HR Interview. Feedback: "${feedback}". Moved to Rejected Pool in Keka HRMS.`;
    
    if (decision === "pass") {
      status = "shortlisted"; // shortlisted maps to 'selected' visually or we can keep it as 'shortlisted' / update to a selected status
      status = "selected";
      kekaStatus = "active";
      logMessage = `HR Interview passed. Feedback: "${feedback}". Moved to Final Selection stage.`;
    }
    
    await query(
      `UPDATE candidates 
       SET status = $1, keka_status = $2, interview_feedback = $3
       WHERE id = $4;`,
      [status, kekaStatus, feedback, id]
    );
    
    await query(
      "INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);",
      [id, "interview_evaluated", logMessage]
    );
    
    res.json({ success: true, status, kekaStatus, logMessage });
  } catch (err: any) {
    console.error("Failed to submit interview feedback:", err);
    res.status(500).json({ error: err.message || "Failed to submit interview feedback" });
  }
});

// POST /api/candidates/:id/onboard
router.post("/:id/onboard", async (req, res) => {
  try {
    const { id } = req.params;
    const status = "onboarded";
    const kekaStatus = "onboarding";
    const logMessage = "Initiated Keka HRMS onboarding workflow. Candidate record migrated successfully.";
    
    await query(
      `UPDATE candidates 
       SET status = $1, keka_status = $2
       WHERE id = $3;`,
      [status, kekaStatus, id]
    );
    
    await query(
      "INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);",
      [id, "onboarded", logMessage]
    );
    
    res.json({ success: true, status, kekaStatus, logMessage });
  } catch (err: any) {
    console.error("Failed to trigger onboarding:", err);
    res.status(500).json({ error: err.message || "Failed to trigger onboarding" });
  }
});

export default router;
