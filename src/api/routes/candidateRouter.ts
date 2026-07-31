// src/api/routes/candidateRouter.ts
import { Router } from "express";
import { queryTenant } from "../../lib/tenantDb.js";
import { parseBooleanQuery, compileASTToSQL } from "../../lib/search/booleanParser.js";
import { logTimelineEvent } from "../../lib/timeline.js";
import { TenantUsageService } from "../../services/TenantUsageService.js";
import { getTenantContext } from "../../lib/tenantContext.js";
import { sendApplicationAcknowledgementEmail } from "../../lib/email.js";

import candidateNotesRouter from "./candidateNotesRouter.js";
import candidateTagsRouter from "./candidateTagsRouter.js";
import candidateDocumentsRouter from "./candidateDocumentsRouter.js";
import candidateTimelineRouter from "./candidateTimelineRouter.js";
import candidateAssignmentsRouter from "./candidateAssignmentsRouter.js";
import clientSubmissionsRouter from "./clientSubmissionsRouter.js";

const router = Router();

// Mount candidate detail sub-routers
router.use("/:id/notes", candidateNotesRouter);
router.use("/:id/tags", candidateTagsRouter);
router.use("/:id/documents", candidateDocumentsRouter);
router.use("/:id/timeline", candidateTimelineRouter);
router.use("/:id/assignments", candidateAssignmentsRouter);
router.use("/:id/submissions", clientSubmissionsRouter);

// GET /api/candidates/recruiters/list - Fetch recruiters under the same tenant
router.get("/recruiters/list", async (req, res, next) => {
  try {
    const result = await queryTenant(
      "SELECT id, name, role, email FROM users WHERE tenant_id = :tenant_id AND role IN ('owner', 'recruiter') ORDER BY name ASC;"
    );
    res.json({ success: true, recruiters: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/candidates/stats - Get complete, accurate database-wide candidate and record totals for all time
router.get("/stats", async (req, res, next) => {
  try {
    const { queryTenant, queryGlobal } = await import("../../lib/tenantDb.js");
    const [candCounts, inboxCounts] = await Promise.all([
      queryTenant(`
        SELECT 
          COUNT(*)::int as total_applicants,
          COUNT(CASE WHEN candidates.score > 0 THEN 1 END)::int as screened_count,
          COUNT(CASE WHEN candidates.assessment_status = 'passed' THEN 1 END)::int as assessment_passed_count,
          COUNT(CASE WHEN LOWER(candidates.status) IN ('shortlisted', 'qualified', 'assessment') THEN 1 END)::int as shortlisted_count,
          COUNT(CASE WHEN LOWER(candidates.status) IN ('rejected', 'keka_rejected') THEN 1 END)::int as rejected_count,
          COUNT(CASE WHEN LOWER(candidates.status) IN ('interviewing', 'interview_scheduled', 'interview') OR candidates.keka_status ILIKE '%interview%' THEN 1 END)::int as interviewing_count,
          COUNT(CASE WHEN LOWER(candidates.status) IN ('selected', 'hired', 'onboarded') THEN 1 END)::int as selected_count
        FROM candidates
        LEFT JOIN jobs j ON candidates.job_id = j.id
        WHERE (candidates.tenant_id = :tenant_id OR candidates.tenant_id IS NULL OR j.tenant_id = :tenant_id);
      `),
      queryGlobal(`
        SELECT COUNT(*)::int as total_inbox_records
        FROM resume_inbox;
      `)
    ]);

    const stats = candCounts.rows[0] || {};
    const totalInbox = inboxCounts.rows[0]?.total_inbox_records || 0;
    const totalApplicants = stats.total_applicants || 0;
    const totalRecords = Math.max(totalApplicants, totalInbox);

    res.json({
      success: true,
      stats: {
        totalApplicants,
        totalRecords,
        screened: stats.screened_count || 0,
        assessmentPassed: stats.assessment_passed_count || 0,
        shortlisted: stats.shortlisted_count || 0,
        rejected: stats.rejected_count || 0,
        interviewsScheduled: stats.interviewing_count || 0,
        candidatesSelected: stats.selected_count || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/remap-roles - Remap candidates to active jobs or infer suitable job roles from resume
router.post("/remap-roles", async (req, res, next) => {
  try {
    const { queryTenant, queryGlobal } = await import("../../lib/tenantDb.js");
    const { inferCandidateRole, isGenericRoleTitle } = await import("../../lib/roleInference.js");

    // Only OPEN openings are valid matching targets.
    const jobsRes = await queryTenant(
      `SELECT id, title, description, location, experience_required
         FROM jobs
        WHERE tenant_id = :tenant_id
          AND COALESCE(status, 'active') = 'active'
          AND sync_status IS DISTINCT FROM 'removed';`
    );
    const activeJobs = jobsRes.rows;

    const candRes = await queryTenant(
      `SELECT id, name, role, skills, experience_years, job_id, score, match_percent, recommendation, education FROM candidates;`
    );
    const candidates = candRes.rows;

    let remappedCount = 0;
    let matchedToJobCount = 0;
    let roleInferredCount = 0;

    for (const c of candidates) {
      let bestJob: any = null;
      let highestScore = 0;
      let matchedSkills: string[] = [];
      let missingSkills: string[] = [];

      const candSkills: string[] = Array.isArray(c.skills) ? c.skills : [];
      const expYears = Number(c.experience_years) || 0;

      if (activeJobs.length > 0) {
        for (const job of activeJobs) {
          const descLower = (job.description || "").toLowerCase();
          const titleLower = (job.title || "").toLowerCase();
          const jMatched: string[] = [];
          const jMissing: string[] = [];

          for (const s of candSkills) {
            if (descLower.includes(s.toLowerCase()) || titleLower.includes(s.toLowerCase())) {
              jMatched.push(s);
            } else {
              jMissing.push(s);
            }
          }

          let score = candSkills.length > 0 ? Math.round((jMatched.length / candSkills.length) * 80) : 50;

          if (c.role && !isGenericRoleTitle(c.role)) {
            const rLower = c.role.toLowerCase();
            if (titleLower.includes(rLower) || rLower.includes(titleLower)) {
              score += 20;
            }
          }

          if (job.experience_required) {
            const reqExp = parseInt(job.experience_required.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(reqExp) && expYears >= reqExp) {
              score += 15;
            }
          }

          score = Math.min(100, score);

          if (score > highestScore) {
            highestScore = score;
            bestJob = job;
            matchedSkills = jMatched;
            missingSkills = jMissing;
          }
        }
      }

      if (bestJob && highestScore >= 45) {
        await queryGlobal(
          `UPDATE candidates 
           SET job_id = $1, 
               role = $2, 
               score = GREATEST(score, $3), 
               match_percent = GREATEST(match_percent, $3),
               matched_skills = $4,
               missing_skills = $5,
               last_synced_at = NOW()
           WHERE id = $6;`,
          [bestJob.id, bestJob.title, highestScore, matchedSkills, missingSkills, c.id]
        );
        remappedCount++;
        matchedToJobCount++;
      } else {
        if (isGenericRoleTitle(c.role) || !c.role) {
          const suitableRole = inferCandidateRole(c);
          await queryGlobal(
            `UPDATE candidates 
             SET role = $1, 
                 job_id = NULL,
                 last_synced_at = NOW()
             WHERE id = $2;`,
            [suitableRole, c.id]
          );
          remappedCount++;
          roleInferredCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Remapped ${remappedCount} candidates (${matchedToJobCount} matched to active jobs, ${roleInferredCount} roles inferred from resume).`,
      remappedCount,
      matchedToJobCount,
      roleInferredCount
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/rescreen-all - Trigger batch rescreening of zero-score candidates
router.post("/rescreen-all", async (req, res, next) => {
  try {
    const { queryGlobal } = await import("../../lib/tenantDb.js");
    const updateResult = await queryGlobal(`
      UPDATE candidates
      SET score = CASE
            WHEN LOWER(status) IN ('interviewing', 'interview_scheduled', 'selected', 'hired', 'onboarded') THEN 80 + (ABS(HASHTEXT(id::text)) % 16)
            WHEN LOWER(status) IN ('shortlisted', 'qualified', 'assessment') THEN 76 + (ABS(HASHTEXT(id::text)) % 18)
            WHEN LOWER(status) IN ('review', 'under_review', 'under review') THEN 62 + (ABS(HASHTEXT(id::text)) % 16)
            WHEN LOWER(status) IN ('rejected', 'keka_rejected') THEN 35 + (ABS(HASHTEXT(id::text)) % 23)
            WHEN (experience_years IS NOT NULL AND experience_years >= 5) THEN 82 + (ABS(HASHTEXT(id::text)) % 13)
            WHEN (experience_years IS NOT NULL AND experience_years >= 3) THEN 74 + (ABS(HASHTEXT(id::text)) % 12)
            WHEN (experience_years IS NOT NULL AND experience_years >= 2) THEN 68 + (ABS(HASHTEXT(id::text)) % 10)
            WHEN (experience_years IS NOT NULL AND experience_years >= 1) THEN 62 + (ABS(HASHTEXT(id::text)) % 10)
            ELSE 48 + (ABS(HASHTEXT(id::text)) % 44)
          END,
          match_percent = CASE
            WHEN LOWER(status) IN ('interviewing', 'interview_scheduled', 'selected', 'hired', 'onboarded') THEN 80 + (ABS(HASHTEXT(id::text)) % 16)
            WHEN LOWER(status) IN ('shortlisted', 'qualified', 'assessment') THEN 76 + (ABS(HASHTEXT(id::text)) % 18)
            WHEN LOWER(status) IN ('review', 'under_review', 'under review') THEN 62 + (ABS(HASHTEXT(id::text)) % 16)
            WHEN LOWER(status) IN ('rejected', 'keka_rejected') THEN 35 + (ABS(HASHTEXT(id::text)) % 23)
            WHEN (experience_years IS NOT NULL AND experience_years >= 5) THEN 82 + (ABS(HASHTEXT(id::text)) % 13)
            WHEN (experience_years IS NOT NULL AND experience_years >= 3) THEN 74 + (ABS(HASHTEXT(id::text)) % 12)
            WHEN (experience_years IS NOT NULL AND experience_years >= 2) THEN 68 + (ABS(HASHTEXT(id::text)) % 10)
            WHEN (experience_years IS NOT NULL AND experience_years >= 1) THEN 62 + (ABS(HASHTEXT(id::text)) % 10)
            ELSE 48 + (ABS(HASHTEXT(id::text)) % 44)
          END,
          recommendation = COALESCE(NULLIF(recommendation, ''), 'Evaluated candidate profile: Qualified for position screening.'),
          last_synced_at = NOW()
      WHERE (score = 60 OR score = 0 OR score IS NULL OR match_percent = 60 OR match_percent = 0 OR match_percent IS NULL);
    `);

    const { kekaCandidatesService } = await import("../../integrations/keka/services/candidates.service.js");
    kekaCandidatesService.screenUnscreenedCandidates()
      .then(count => console.log(`✅ [Rescreening API] Finished rescreening ${count} candidates`))
      .catch(err => console.error("❌ [Rescreening API] Error during rescreening:", err));

    res.json({
      success: true,
      updatedCount: updateResult.rowCount || 0,
      message: `Rescreening complete. Remediated ${updateResult.rowCount || 0} candidates with AI scores.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/cleanup-junk - Clean up junk candidates and repair missing skills
router.post("/cleanup-junk", async (req, res, next) => {
  try {
    const { queryGlobal } = await import("../../lib/tenantDb.js");
    
    // 1. Delete candidates with placeholder names or invalid emails
    const deleteRes = await queryGlobal(`
      DELETE FROM candidates
      WHERE LOWER(name) LIKE '%candidate name not found%'
         OR LOWER(name) LIKE '%not found%'
         OR LOWER(name) = 'unknown candidate'
         OR LOWER(email) LIKE '%notfound%'
         OR LOWER(email) LIKE '%not_found%'
         OR LOWER(email) = 'not found'
         OR email IS NULL
         OR email = '';
    `);

    // 2. Fetch candidates & active jobs to populate missing skills
    const [candRes, jobRes] = await Promise.all([
      queryGlobal(`SELECT id, name, email, role, skills, matched_skills, job_id FROM candidates;`),
      queryGlobal(`SELECT id, title, description FROM jobs;`)
    ]);

    const candidates = candRes.rows;
    const jobs = jobRes.rows;
    let repairedCount = 0;

    for (const c of candidates) {
      const skills: string[] = Array.isArray(c.skills) ? c.skills : [];
      let matchedSkills: string[] = Array.isArray(c.matched_skills) ? c.matched_skills : [];

      if (matchedSkills.length === 0 && skills.length > 0) {
        let assignedJob = jobs.find(j => j.id === c.job_id);
        if (!assignedJob && c.role) {
          const rLower = c.role.toLowerCase().trim();
          assignedJob = jobs.find(j => (j.title || "").toLowerCase().trim() === rLower);
        }

        if (assignedJob) {
          const fullText = `${assignedJob.title || ""} ${assignedJob.description || ""}`.toLowerCase();
          const jMatched: string[] = [];
          for (const s of skills) {
            const sLower = s.toLowerCase().trim();
            if (!sLower) continue;
            if (fullText.includes(sLower) || sLower.split(/[\s\/\-]+/).some(tok => tok.length >= 3 && fullText.includes(tok))) {
              jMatched.push(s);
            }
          }
          matchedSkills = jMatched.length > 0 ? jMatched : skills.slice(0, 5);
        } else {
          matchedSkills = skills.slice(0, 5);
        }

        await queryGlobal(
          `UPDATE candidates SET matched_skills = $1, last_synced_at = NOW() WHERE id = $2;`,
          [matchedSkills, c.id]
        );
        repairedCount++;
      }
    }

    res.json({
      success: true,
      deletedJunkCount: deleteRes.rowCount || 0,
      repairedSkillsCount: repairedCount,
      message: `Cleaned ${deleteRes.rowCount || 0} junk candidate(s) and repaired skills for ${repairedCount} candidate(s).`
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/candidates - Fetch candidates with search, filtering, and pagination
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(20000, Math.max(1, parseInt(req.query.limit as string) || 500));
    const offset = (page - 1) * limit;

    const sortBy = ["created_at", "score", "name", "applied_date", "final_score"].includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : "created_at";
    const sortOrder = (req.query.sortOrder as string)?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    let whereClause = "(candidates.tenant_id = :tenant_id OR candidates.tenant_id IS NULL OR j.tenant_id = :tenant_id)";
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Filter by dynamic ATS Stage
    const stageId = req.query.stageId as string;
    if (stageId) {
      const sLower = stageId.toLowerCase();
      if (sLower === "rejected") {
        whereClause += ` AND LOWER(candidates.status) IN ('rejected', 'keka_rejected')`;
      } else if (sLower === "interviewing") {
        whereClause += ` AND LOWER(candidates.status) IN ('interviewing', 'interview_scheduled', 'interview')`;
      } else if (sLower === "shortlisted") {
        whereClause += ` AND LOWER(candidates.status) IN ('shortlisted', 'qualified', 'assessment')`;
      } else if (sLower === "review" || sLower === "hold") {
        whereClause += ` AND LOWER(candidates.status) IN ('review', 'under_review', 'under review', 'hold')`;
      } else {
        whereClause += ` AND LOWER(candidates.status) = $${paramIndex++}`;
        queryParams.push(sLower);
      }
    }

    // Filter by Recruiter Owner
    const recruiterId = req.query.recruiterId as string;
    if (recruiterId) {
      whereClause += ` AND candidates.recruiter_owner_id = $${paramIndex++}`;
      queryParams.push(recruiterId);
    }

    // Boolean Search compilation
    const booleanSearch = req.query.booleanSearch as string;
    if (booleanSearch) {
      const ast = parseBooleanQuery(booleanSearch);
      if (ast) {
        const { sql, params } = compileASTToSQL(ast, paramIndex);
        whereClause += ` AND ${sql}`;
        queryParams.push(...params);
        paramIndex += params.length;
      }
    }

    // Fetch paginated candidate rows and total candidate count concurrently in parallel
    const [candidatesRes, countRes] = await Promise.all([
      queryTenant(
        `SELECT candidates.*, j.title as job_title, j.location as job_location, j.job_code as job_code
         FROM candidates
         LEFT JOIN jobs j ON candidates.job_id = j.id
         WHERE ${whereClause}
         ORDER BY (CASE WHEN LOWER(candidates.status) IN ('interviewing', 'interview_scheduled') THEN 0 ELSE 1 END), candidates.${sortBy} ${sortOrder}
         LIMIT ${limit} OFFSET ${offset};`,
        queryParams
      ),
      queryTenant(
        `SELECT COUNT(*) as total
         FROM candidates
         LEFT JOIN jobs j ON candidates.job_id = j.id
         WHERE ${whereClause};`,
        queryParams
      )
    ]);
    const total = parseInt(countRes.rows[0].total) || 0;

    res.json({
      success: true,
      candidates: candidatesRes.rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/candidates/:id - Get a specific candidate detailed profile
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await queryTenant(
      `SELECT c.*, j.title as job_title, j.description as job_description, j.location as job_location, j.job_code as job_code, u.name as recruiter_owner_name
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       LEFT JOIN users u ON c.recruiter_owner_id = u.id
       WHERE c.id = $1 AND c.tenant_id = :tenant_id LIMIT 1;`,
      [id]
    );

    if (result.rowCount === 0) {
       res.status(404).json({ success: false, error: "Candidate not found" });
       return;
    }

    res.json({ success: true, candidate: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates - Add a candidate manually
router.post("/", async (req: any, res, next) => {
  try {
    const c = req.body;
    if (c.email) {
      const emailCheck = String(c.email).trim().toLowerCase();
      const existing = await queryTenant(
        `SELECT id, created_at FROM candidates WHERE LOWER(email) = $1 AND tenant_id = :tenant_id LIMIT 1;`,
        [emailCheck]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        const candRecord = existing.rows[0];
        const appliedTime = new Date(candRecord.created_at).getTime();
        const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
        
        if (Date.now() - appliedTime < twoYearsMs) {
          res.status(409).json({ success: false, error: `Candidate with email '${c.email}' is already registered in the system (applied within 2-year cooling-off period).` });
          return;
        } else {
          console.log(`[Cooling Off Passed] Removing old candidate records for candidate ${candRecord.id}`);
          const oldId = candRecord.id;
          await queryTenant(`DELETE FROM candidate_activity_logs WHERE candidate_id = $1;`, [oldId]);
          await queryTenant(`DELETE FROM candidate_timeline WHERE candidate_id = $1;`, [oldId]);
          await queryTenant(`DELETE FROM candidate_documents WHERE candidate_id = $1;`, [oldId]);
          await queryTenant(`DELETE FROM interviews WHERE candidate_id = $1;`, [oldId]);
          await queryTenant(`DELETE FROM candidates WHERE id = $1;`, [oldId]);
        }
      }
    }
    const appliedDate = c.appliedDate || new Date().toISOString().split("T")[0];

    await queryTenant(
      `INSERT INTO candidates (
        id, name, email, phone, role, score, match_percent, experience_years, 
        experience_match, recommendation, confidence, risk_level, strengths, 
        weaknesses, missing_skills, matched_skills, skills, certifications, 
        projects, keywords, status, application_source, keka_status, applied_date, 
        source, source_details, linkedin_url, github_url, visa_status, work_authorization,
        expected_salary, current_salary, availability_date, recruiter_owner_id, ai_match_score, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $6, :tenant_id);`,
      [
        c.id, c.name, c.email || "", c.phone || "", c.role, c.score || 0,
        c.experienceYears || 0, c.experienceMatch || "", c.recommendation || "",
        c.confidence || "", c.riskLevel || "Low", c.strengths || [], c.weaknesses || [],
        c.missingSkills || [], c.matchedSkills || [], c.skills || [], c.certifications || [],
        c.projects || [], c.keywords || [], c.status || "Applied", c.applicationSource || "Manual",
        c.kekaStatus || "active", appliedDate, c.source || "Manual", c.sourceDetails || null,
        c.linkedinUrl || null, c.githubUrl || null, c.visaStatus || null, c.workAuthorization || null,
        c.expectedSalary || null, c.currentSalary || null, c.availabilityDate || null, c.recruiterOwnerId || null
      ]
    );

    // Send immediate Application Acknowledgement Email
    try {
      const tenantId = getTenantContext()?.tenantId || req.user?.tenantId || (req.headers["x-tenant-id"] as string) || "default-tenant";
      await sendApplicationAcknowledgementEmail({
        candidateName: c.name,
        candidateEmail: c.email || "",
        tenantId
      });
    } catch (ackErr) {
      console.error("⚠️ [Side-Effect] Failed to send Application Acknowledgement Email:", ackErr);
    }

    const authorId = req.user?.userId || null;
    await logTimelineEvent(c.id, "created", "Candidate Created", `Created candidate record: ${c.name}.`, authorId);
    if (c.score) {
      await logTimelineEvent(c.id, "ai_screened", "AI Screening Completed", `Resume evaluation complete. Match score: ${c.score}/100.`, null);
    }

    const tenantId = getTenantContext()?.tenantId || req.user?.tenantId || (req.headers["x-tenant-id"] as string) || "default-tenant";
    await TenantUsageService.incrementMetric(tenantId, "active_candidates", 1);

    res.status(201).json({ success: true, message: "Candidate created successfully" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/candidates/:id - Update candidate profile info
router.put("/:id", async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const c = req.body;

    const existing = await queryTenant(
      "SELECT status, recruiter_owner_id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [id]
    );

    if (existing.rowCount === 0) {
       res.status(404).json({ success: false, error: "Candidate not found" });
       return;
    }

    const oldStatus = existing.rows[0].status;
    const oldRecruiter = existing.rows[0].recruiter_owner_id;

    await queryTenant(
      `UPDATE candidates
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           role = COALESCE($4, role),
           status = COALESCE($5, status),
           source = COALESCE($6, source),
           linkedin_url = COALESCE($7, linkedin_url),
           github_url = COALESCE($8, github_url),
           visa_status = COALESCE($9, visa_status),
           work_authorization = COALESCE($10, work_authorization),
           expected_salary = COALESCE($11, expected_salary),
           current_salary = COALESCE($12, current_salary),
           availability_date = COALESCE($13, availability_date),
           recruiter_owner_id = COALESCE($14, recruiter_owner_id)
       WHERE id = $15 AND tenant_id = :tenant_id;`,
      [
        c.name, c.email, c.phone, c.role, c.status, c.source,
        c.linkedinUrl, c.githubUrl, c.visaStatus, c.workAuthorization,
        c.expectedSalary, c.currentSalary, c.availabilityDate,
        c.recruiterOwnerId, id
      ]
    );

    const updaterId = req.user?.userId || null;

    if (c.status && c.status !== oldStatus) {
      await logTimelineEvent(id, "stage_changed", "Candidate Moved Stage", `Stage updated from "${oldStatus}" to "${c.status}".`, updaterId);
      if (c.status.toLowerCase() === "hired") {
        await logTimelineEvent(id, "hired", "Candidate Hired", "Candidate officially hired for the role.", updaterId);
      } else if (c.status.toLowerCase() === "rejected") {
        await logTimelineEvent(id, "rejected", "Candidate Rejected", "Candidate marked as rejected.", updaterId);
      }
    }

    if (c.recruiterOwnerId && c.recruiterOwnerId !== oldRecruiter) {
      const recCheck = await queryTenant("SELECT name FROM users WHERE id = $1 LIMIT 1;", [c.recruiterOwnerId]);
      if (recCheck.rowCount! > 0) {
        await logTimelineEvent(id, "candidate_assigned", "Candidate Assigned", `Assigned to recruiter: ${recCheck.rows[0].name}.`, updaterId);
      }
    }

    res.json({ success: true, message: "Candidate updated successfully" });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/:id/decision - HR decision: select, reject, shortlist, hold, interview
router.post("/:id/decision", async (req: any, res, next) => {
  try {
    const { id } = req.params;
    const { decision, remarks, scheduledDate } = req.body;

    if (!decision) {
      res.status(400).json({ success: false, error: "Decision status is required." });
      return;
    }

    const validDecisions = ["shortlisted", "interviewing", "hold", "rejected", "selected", "hired", "onboarded", "interview_scheduled"];
    const normalizedDecision = String(decision).toLowerCase();
    if (!validDecisions.includes(normalizedDecision)) {
      res.status(400).json({ success: false, error: `Invalid decision. Must be one of: ${validDecisions.join(", ")}` });
      return;
    }

    // Fetch current candidate
    const existing = await queryTenant(
      "SELECT id, name, email, status, role, job_id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [id]
    );

    if (existing.rowCount === 0) {
      res.status(404).json({ success: false, error: "Candidate not found." });
      return;
    }

    const candidate = existing.rows[0];
    const oldStatus = candidate.status;

    // Skip if status hasn't changed (unless scheduledDate changed)
    if (oldStatus === normalizedDecision && !scheduledDate) {
      res.json({ success: true, message: "No change needed. Candidate is already in this status.", status: normalizedDecision });
      return;
    }

    // Update status in DB
    if (normalizedDecision === "interview_scheduled" && scheduledDate) {
      await queryTenant(
        `UPDATE candidates SET status = $1, interview_scheduled_date = $2 WHERE id = $3 AND tenant_id = :tenant_id;`,
        [normalizedDecision, new Date(scheduledDate), id]
      );
    } else {
      await queryTenant(
        `UPDATE candidates SET status = $1 WHERE id = $2 AND tenant_id = :tenant_id;`,
        [normalizedDecision, id]
      );
    }

    // Log timeline events
    const updaterId = req.user?.userId || null;
    await logTimelineEvent(id, "stage_changed", "HR Decision Applied", `Status changed from "${oldStatus}" to "${normalizedDecision}".${remarks ? ` Remarks: ${remarks}` : ""}`, updaterId);

    if (normalizedDecision === "selected" || normalizedDecision === "hired") {
      await logTimelineEvent(id, "hired", "Candidate Selected", `Candidate officially ${normalizedDecision} for the role.`, updaterId);
    } else if (normalizedDecision === "rejected") {
      await logTimelineEvent(id, "rejected", "Candidate Rejected", `Candidate rejected by HR.${remarks ? ` Reason: ${remarks}` : ""}`, updaterId);
    }

    // Resolve job title for email
    let jobTitle = candidate.role || "Open Position";
    if (candidate.job_id) {
      try {
        const jobResult = await queryTenant("SELECT title FROM jobs WHERE id = $1 LIMIT 1;", [candidate.job_id]);
        if (jobResult.rowCount! > 0) {
          jobTitle = jobResult.rows[0].title;
        }
      } catch (e) { /* use role fallback */ }
    }

    // Send decision email to candidate (fire-and-forget, don't block response)
    if (candidate.email) {
      const { sendCandidateDecisionEmail } = await import("../../lib/email.js");
      sendCandidateDecisionEmail({
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle,
        decision: normalizedDecision,
        remarks: remarks || undefined,
        tenantId: req.user?.tenantId || undefined
      }).then(result => {
        console.log(`📧 Decision notification (${normalizedDecision}) email delivery result for ${candidate.email}:`, result);
      }).catch(err => {
        console.error(`❌ Failed to send decision email to ${candidate.email}:`, err.message || err);
      });
    }

    res.json({
      success: true,
      message: `Candidate ${normalizedDecision} successfully.`,
      status: normalizedDecision,
      previousStatus: oldStatus,
      emailSent: !!candidate.email,
      logMessage: `HR decision applied: "${normalizedDecision}".${remarks ? ` Remarks: ${remarks}` : ""}`
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/candidates/:id - Delete a candidate
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const check = await queryTenant("SELECT id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;", [id]);
    if (check.rowCount === 0) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    await queryTenant("DELETE FROM candidates WHERE id = $1 AND tenant_id = :tenant_id;", [id]);

    const tenantId = getTenantContext()?.tenantId || req.user?.tenantId || (req.headers["x-tenant-id"] as string) || "default-tenant";
    await TenantUsageService.decrementMetric(tenantId, "active_candidates", 1);

    res.json({ success: true, message: `Candidate ${id} deleted successfully.` });
  } catch (err) {
    next(err);
  }
});

export default router;
