// src/api/routes/dashboardRouter.ts
import { Router } from "express";
import { queryTenant } from "../../lib/tenantDb.js";
import { Cache } from "../../lib/cache.js";
import { getTenantContext } from "../../lib/tenantContext.js";

const router = Router();

// GET /api/dashboard/metrics - Retrieve recruiters KPIs
router.get("/metrics", async (req, res, next) => {
  try {
    const tenantId = getTenantContext()?.tenantId || "default";
    const cacheKey = `dashboard-metrics-${tenantId}`;
    
    const cached = Cache.get<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch all recruiter KPIs concurrently in parallel
    const [
      jobsCount,
      activeCandidates,
      interviewsScheduled,
      offersSent,
      hiresThisMonth,
      timeToHire,
      sourcePerformance,
      submittedCount,
      subToIntComponents,
      totalInterviews,
      totalHired,
      recruiterProductivity,
      sourceQuality
    ] = await Promise.all([
      queryTenant("SELECT COUNT(*)::int as count FROM jobs WHERE tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE status NOT IN ('Hired', 'Rejected') AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM interviews WHERE status = 'scheduled' AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM offers WHERE status = 'sent' AND tenant_id = :tenant_id;"),
      queryTenant(`
        SELECT COUNT(DISTINCT candidate_id)::int as count 
        FROM candidate_timeline 
        WHERE event_type = 'hired' 
          AND created_at >= date_trunc('month', current_date) 
          AND tenant_id = :tenant_id;
      `),
      queryTenant(`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (t2.created_at - t1.created_at))/86400), 0)::float as avg_days 
        FROM candidate_timeline t1 
        JOIN candidate_timeline t2 ON t1.candidate_id = t2.candidate_id 
        WHERE t1.event_type = 'created' 
          AND t2.event_type = 'hired' 
          AND t1.tenant_id = :tenant_id;
      `),
      queryTenant(`
        SELECT COALESCE(source, 'Unknown') as source, COUNT(*)::int as count 
        FROM candidates 
        WHERE tenant_id = :tenant_id 
        GROUP BY source;
      `),
      queryTenant("SELECT COUNT(*)::int as count FROM client_submissions WHERE tenant_id = :tenant_id;"),
      queryTenant(`
        SELECT 
          COUNT(*)::int as total_submissions,
          COUNT(CASE WHEN submission_status = 'Interview Requested' THEN 1 END)::int as interview_requests
        FROM client_submissions 
        WHERE tenant_id = :tenant_id;
      `),
      queryTenant("SELECT COUNT(*)::int as count FROM interviews WHERE tenant_id = :tenant_id;"),
      queryTenant(`
        SELECT COUNT(DISTINCT candidate_id)::int as count 
        FROM candidate_timeline 
        WHERE event_type = 'hired' 
          AND tenant_id = :tenant_id;
      `),
      queryTenant(`
        SELECT 
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
        GROUP BY u.id, u.name;
      `),
      queryTenant(`
        SELECT 
          COALESCE(source, 'Unknown') as source, 
          COALESCE(AVG(score), 0)::float as avg_score,
          COUNT(*)::int as candidate_count
        FROM candidates 
        WHERE tenant_id = :tenant_id 
        GROUP BY source;
      `)
    ]);

    const responsePayload = {
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
    };

    Cache.set(cacheKey, responsePayload, 30000); // 30s cache TTL
    res.json(responsePayload);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/pipeline - Autonomous Pipeline Funnel Analytics
router.get("/pipeline", async (req, res, next) => {
  try {
    const tenantId = getTenantContext()?.tenantId || "default";
    const cacheKey = `dashboard-pipeline-${tenantId}`;

    const cached = Cache.get<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch all pipeline counts and activities concurrently in parallel
    const [
      emailsSynced,
      resumesParsed,
      shortlisted,
      assessmentsSent,
      assessmentsCompleted,
      qualified,
      interviewsScheduled,
      hired,
      rejected,
      inReview,
      todayResumes,
      todayShortlisted,
      todayAssessments,
      todayInterviews,
      recentEvents,
      scoreDistribution
    ] = await Promise.all([
      queryTenant("SELECT COUNT(*)::int as count FROM resume_inbox WHERE tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM resume_inbox WHERE status IN ('Parsed', 'Matched', 'Duplicate', 'Needs Review') AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE status IN ('shortlisted', 'Qualified', 'interviewing') AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE assessment_token IS NOT NULL AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE assessment_status IN ('passed', 'failed') AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE status = 'Qualified' AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM interviews WHERE status = 'scheduled' AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE status = 'Hired' AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE status IN ('Rejected', 'rejected') AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM candidates WHERE status = 'Review' AND tenant_id = :tenant_id;"),
      queryTenant("SELECT COUNT(*)::int as count FROM resume_inbox WHERE created_at >= CURRENT_DATE AND tenant_id = :tenant_id;"),
      queryTenant(`
        SELECT COUNT(*)::int as count FROM candidate_activity_logs 
        WHERE event_type = 'email_sent' AND created_at >= CURRENT_DATE AND tenant_id = :tenant_id;
      `),
      queryTenant(`
        SELECT COUNT(*)::int as count FROM candidate_activity_logs 
        WHERE event_type = 'assessment_submitted' AND created_at >= CURRENT_DATE AND tenant_id = :tenant_id;
      `),
      queryTenant(`
        SELECT COUNT(*)::int as count FROM candidate_activity_logs 
        WHERE event_type = 'interview_scheduled' AND created_at >= CURRENT_DATE AND tenant_id = :tenant_id;
      `),
      queryTenant(`
        SELECT cal.event_type, cal.message, cal.created_at, c.name as candidate_name
        FROM candidate_activity_logs cal
        LEFT JOIN candidates c ON cal.candidate_id = c.id
        WHERE cal.tenant_id = :tenant_id
        ORDER BY cal.created_at DESC
        LIMIT 20;
      `),
      queryTenant(`
        SELECT 
          COUNT(CASE WHEN final_score >= 80 THEN 1 END)::int as excellent,
          COUNT(CASE WHEN final_score >= 60 AND final_score < 80 THEN 1 END)::int as good,
          COUNT(CASE WHEN final_score >= 40 AND final_score < 60 THEN 1 END)::int as average,
          COUNT(CASE WHEN final_score < 40 AND final_score IS NOT NULL THEN 1 END)::int as below_average
        FROM candidates WHERE tenant_id = :tenant_id AND final_score IS NOT NULL;
      `)
    ]);

    const responsePayload = {
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
    };

    Cache.set(cacheKey, responsePayload, 30000); // 30s cache TTL
    res.json(responsePayload);
  } catch (err) {
    next(err);
  }
});

export default router;
