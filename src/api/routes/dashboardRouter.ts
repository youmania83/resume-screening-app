// src/api/routes/dashboardRouter.ts
import { Router } from "express";
import { queryTenant } from "../../lib/tenantDb.js";

const router = Router();

// GET /api/dashboard/metrics - Retrieve recruiters KPIs
router.get("/metrics", async (req, res, next) => {
  try {
    // 1. Open Jobs count
    const jobsCount = await queryTenant(
      "SELECT COUNT(*)::int as count FROM jobs WHERE tenant_id = :tenant_id;"
    );

    // 2. Active Candidates count (not hired/rejected)
    const activeCandidates = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE status NOT IN ('Hired', 'Rejected') AND tenant_id = :tenant_id;"
    );

    // 3. Interviews Scheduled count
    const interviewsScheduled = await queryTenant(
      "SELECT COUNT(*)::int as count FROM interviews WHERE status = 'scheduled' AND tenant_id = :tenant_id;"
    );

    // 4. Offers Sent count
    const offersSent = await queryTenant(
      "SELECT COUNT(*)::int as count FROM offers WHERE status = 'sent' AND tenant_id = :tenant_id;"
    );

    // 5. Hires This Month (using timeline for precision)
    const hiresThisMonth = await queryTenant(
      `SELECT COUNT(DISTINCT candidate_id)::int as count 
       FROM candidate_timeline 
       WHERE event_type = 'hired' 
         AND created_at >= date_trunc('month', current_date) 
         AND tenant_id = :tenant_id;`
    );

    // 6. Time To Hire (average in days from created to hired)
    const timeToHire = await queryTenant(
      `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (t2.created_at - t1.created_at))/86400), 0)::float as avg_days 
       FROM candidate_timeline t1 
       JOIN candidate_timeline t2 ON t1.candidate_id = t2.candidate_id 
       WHERE t1.event_type = 'created' 
         AND t2.event_type = 'hired' 
         AND t1.tenant_id = :tenant_id;`
    );

    // 7. Source Performance (candidates count by source)
    const sourcePerformance = await queryTenant(
      `SELECT COALESCE(source, 'Unknown') as source, COUNT(*)::int as count 
       FROM candidates 
       WHERE tenant_id = :tenant_id 
       GROUP BY source;`
    );

    // 8. Candidates Submitted
    const submittedCount = await queryTenant(
      "SELECT COUNT(*)::int as count FROM client_submissions WHERE tenant_id = :tenant_id;"
    );

    // 9. Submission-to-Interview Ratio components
    const subToIntComponents = await queryTenant(
      `SELECT 
         COUNT(*)::int as total_submissions,
         COUNT(CASE WHEN submission_status = 'Interview Requested' THEN 1 END)::int as interview_requests
       FROM client_submissions 
       WHERE tenant_id = :tenant_id;`
    );

    // 10. Interview-to-Hire Ratio components
    const totalInterviews = await queryTenant(
      "SELECT COUNT(*)::int as count FROM interviews WHERE tenant_id = :tenant_id;"
    );
    const totalHired = await queryTenant(
      "SELECT COUNT(DISTINCT candidate_id)::int as count FROM candidate_timeline WHERE event_type = 'hired' AND tenant_id = :tenant_id;"
    );

    // 11. Recruiter Productivity (Assigned, Submitted, Interviews, Placements, Placement Rate)
    const recruiterProductivity = await queryTenant(
      `SELECT 
         u.id, 
         u.name, 
         COUNT(DISTINCT a.candidate_id)::int as assigned_candidates,
         COUNT(DISTINCT s.id)::int as submitted_candidates,
         COUNT(DISTINCT i.id)::int as interviews_generated,
         COUNT(DISTINCT h.candidate_id)::int as placements,
         ROUND(COALESCE(COUNT(DISTINCT h.candidate_id)::float / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 0))::int as placement_rate
       FROM users u 
       LEFT JOIN candidate_assignments a ON u.id = a.recruiter_id 
       LEFT JOIN client_submissions s ON u.id = s.submitted_by 
       LEFT JOIN interviews i ON i.candidate_id = a.candidate_id 
       LEFT JOIN candidate_timeline h ON h.candidate_id = a.candidate_id AND h.event_type = 'hired' 
       WHERE u.tenant_id = :tenant_id 
         AND u.role IN ('owner', 'recruiter') 
       GROUP BY u.id, u.name;`
    );

    // 12. Source Quality (average match score by source)
    const sourceQuality = await queryTenant(
      `SELECT 
         COALESCE(source, 'Unknown') as source, 
         COALESCE(AVG(score), 0)::float as avg_score,
         COUNT(*)::int as candidate_count
       FROM candidates 
       WHERE tenant_id = :tenant_id 
       GROUP BY source;`
    );

    res.json({
      success: true,
      metrics: {
        openJobs: jobsCount.rows[0]?.count || 0,
        activeCandidates: activeCandidates.rows[0]?.count || 0,
        interviewsScheduled: interviewsScheduled.rows[0]?.count || 0,
        offersSent: offersSent.rows[0]?.count || 0,
        hiresThisMonth: hiresThisMonth.rows[0]?.count || 0,
        timeToHireDays: Math.round((timeToHire.rows[0]?.avg_days || 0) * 10) / 10,
        candidatesSubmitted: submittedCount.rows[0]?.count || 0,
        ratios: {
          submissions: subToIntComponents.rows[0]?.total_submissions || 0,
          interviewRequests: subToIntComponents.rows[0]?.interview_requests || 0,
          totalInterviews: totalInterviews.rows[0]?.count || 0,
          totalHires: totalHired.rows[0]?.count || 0
        },
        sourcePerformance: sourcePerformance.rows,
        sourceQuality: sourceQuality.rows,
        recruiterProductivity: recruiterProductivity.rows
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/pipeline - Autonomous Pipeline Funnel Analytics
router.get("/pipeline", async (req, res, next) => {
  try {
    // 1. Funnel Stage Counts
    const emailsSynced = await queryTenant(
      "SELECT COUNT(*)::int as count FROM resume_inbox WHERE tenant_id = :tenant_id;"
    );

    const resumesParsed = await queryTenant(
      "SELECT COUNT(*)::int as count FROM resume_inbox WHERE status IN ('Parsed', 'Matched', 'Duplicate', 'Needs Review') AND tenant_id = :tenant_id;"
    );

    const shortlisted = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE status IN ('shortlisted', 'Qualified', 'interviewing') AND tenant_id = :tenant_id;"
    );

    const assessmentsSent = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE assessment_token IS NOT NULL AND tenant_id = :tenant_id;"
    );

    const assessmentsCompleted = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE assessment_status IN ('passed', 'failed') AND tenant_id = :tenant_id;"
    );

    const qualified = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE status = 'Qualified' AND tenant_id = :tenant_id;"
    );

    const interviewsScheduled = await queryTenant(
      "SELECT COUNT(*)::int as count FROM interviews WHERE status = 'scheduled' AND tenant_id = :tenant_id;"
    );

    const hired = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE status = 'Hired' AND tenant_id = :tenant_id;"
    );

    const rejected = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE status IN ('Rejected', 'rejected') AND tenant_id = :tenant_id;"
    );

    const inReview = await queryTenant(
      "SELECT COUNT(*)::int as count FROM candidates WHERE status = 'Review' AND tenant_id = :tenant_id;"
    );

    // 2. Today's Activity
    const todayResumes = await queryTenant(
      "SELECT COUNT(*)::int as count FROM resume_inbox WHERE created_at >= CURRENT_DATE AND tenant_id = :tenant_id;"
    );

    const todayShortlisted = await queryTenant(
      `SELECT COUNT(*)::int as count FROM candidate_activity_logs 
       WHERE event_type = 'email_sent' AND created_at >= CURRENT_DATE AND tenant_id = :tenant_id;`
    );

    const todayAssessments = await queryTenant(
      `SELECT COUNT(*)::int as count FROM candidate_activity_logs 
       WHERE event_type = 'assessment_submitted' AND created_at >= CURRENT_DATE AND tenant_id = :tenant_id;`
    );

    const todayInterviews = await queryTenant(
      `SELECT COUNT(*)::int as count FROM candidate_activity_logs 
       WHERE event_type = 'interview_scheduled' AND created_at >= CURRENT_DATE AND tenant_id = :tenant_id;`
    );

    // 3. Recent Pipeline Events (last 20)
    const recentEvents = await queryTenant(
      `SELECT cal.event_type, cal.message, cal.created_at, c.name as candidate_name
       FROM candidate_activity_logs cal
       LEFT JOIN candidates c ON cal.candidate_id = c.id
       WHERE cal.tenant_id = :tenant_id
       ORDER BY cal.created_at DESC
       LIMIT 20;`
    );

    // 4. Stage Score Distribution
    const scoreDistribution = await queryTenant(
      `SELECT 
         COUNT(CASE WHEN final_score >= 80 THEN 1 END)::int as excellent,
         COUNT(CASE WHEN final_score >= 60 AND final_score < 80 THEN 1 END)::int as good,
         COUNT(CASE WHEN final_score >= 40 AND final_score < 60 THEN 1 END)::int as average,
         COUNT(CASE WHEN final_score < 40 AND final_score IS NOT NULL THEN 1 END)::int as below_average
       FROM candidates WHERE tenant_id = :tenant_id AND final_score IS NOT NULL;`
    );

    res.json({
      success: true,
      pipeline: {
        funnel: {
          emailsSynced: emailsSynced.rows[0]?.count || 0,
          resumesParsed: resumesParsed.rows[0]?.count || 0,
          shortlisted: shortlisted.rows[0]?.count || 0,
          assessmentsSent: assessmentsSent.rows[0]?.count || 0,
          assessmentsCompleted: assessmentsCompleted.rows[0]?.count || 0,
          qualified: qualified.rows[0]?.count || 0,
          interviewsScheduled: interviewsScheduled.rows[0]?.count || 0,
          hired: hired.rows[0]?.count || 0,
          rejected: rejected.rows[0]?.count || 0,
          inReview: inReview.rows[0]?.count || 0
        },
        today: {
          resumes: todayResumes.rows[0]?.count || 0,
          shortlisted: todayShortlisted.rows[0]?.count || 0,
          assessmentsCompleted: todayAssessments.rows[0]?.count || 0,
          interviewsScheduled: todayInterviews.rows[0]?.count || 0
        },
        recentEvents: recentEvents.rows.map((e: any) => ({
          type: e.event_type,
          message: e.message,
          candidateName: e.candidate_name,
          timestamp: e.created_at
        })),
        scoreDistribution: scoreDistribution.rows[0] || { excellent: 0, good: 0, average: 0, below_average: 0 }
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
