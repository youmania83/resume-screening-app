// src/worker/resumeWorker.ts
import { Worker, Job } from "bullmq";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { queryGlobal } from "../lib/tenantDb.js";
import { tenantStorage } from "../lib/tenantContext.js";
import { ResumeParserManager, ParsedResumeData } from "../lib/parser/ResumeParserProvider.js";
import { connection } from "../api/queue.js";
import { TenantUsageService } from "../services/TenantUsageService.js";
import { ensureJobAssessment } from "../lib/assessmentService.js";
import { sendAssessmentInviteEmail } from "../lib/email.js";

dotenv.config();

/**
 * Validates the raw text content of a resume.
 */
function validateResumeText(text: string): { valid: boolean; reason?: string } {
  if (!text || !text.trim()) {
    return { valid: false, reason: "Resume file contains no readable text (empty content)." };
  }
  if (text.trim().length < 50) {
    return { valid: false, reason: "Resume text content is too short (minimum 50 characters required)." };
  }
  return { valid: true };
}

/**
 * Heuristically calculates a match score for a job when reusing cached parsed data.
 */
function calculateHeuristicMatch(
  data: ParsedResumeData,
  job: { title: string; description: string; location?: string; experience_required?: string },
  weights: { skills: number; experience: number; industry: number; education: number; location: number }
): {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
} {
  const descLower = job.description.toLowerCase();
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  // Match skills
  if (data.skills && data.skills.length > 0) {
    for (const skill of data.skills) {
      if (descLower.includes(skill.toLowerCase())) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    }
  }

  const skillsScore = data.skillsScore ?? (data.skills.length > 0 
    ? Math.round((matchedSkills.length / data.skills.length) * 100)
    : 70);

  // Match experience
  let experienceScore = data.experienceScore ?? 75;
  if (job.experience_required) {
    const requiredYears = parseInt(job.experience_required.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(requiredYears)) {
      if (data.experienceYears >= requiredYears) {
        experienceScore = 100;
      } else {
        experienceScore = Math.max(0, Math.round((data.experienceYears / requiredYears) * 100));
      }
    }
  }

  const industryScore = data.industryScore ?? 75;
  const educationScore = data.educationScore ?? 80;
  
  // Location score
  let locationScore = 100;
  if (job.location && job.location.toLowerCase() !== "remote") {
    const jobLoc = job.location.toLowerCase();
    const city = data.city?.toLowerCase() || "";
    const state = data.state?.toLowerCase() || "";
    if (!city && !state) {
      locationScore = 60;
    } else if (!jobLoc.includes(city) && !jobLoc.includes(state)) {
      locationScore = 50;
    }
  }

  // Weighted score calculation
  const totalWeight = weights.skills + weights.experience + weights.industry + weights.education + weights.location;
  const rawScore = (
    (skillsScore * weights.skills) +
    (experienceScore * weights.experience) +
    (industryScore * weights.industry) +
    (educationScore * weights.education) +
    (locationScore * weights.location)
  ) / (totalWeight || 1);

  return {
    score: Math.round(rawScore),
    matchedSkills,
    missingSkills: missingSkills.slice(0, 5)
  };
}

/**
 * Core resume processing logic.
 */
export async function parseAndEvalResume(
  tenantId: string,
  inboxId: string,
  filePath: string,
  mimeType: string,
  targetJobId?: string
): Promise<void> {
  const startTime = Date.now();
  let candidateId: string | null = null;
  let providerName = "Mock";

  // Wrap inside active tenant context for audit/indexing verification safety
  await tenantStorage.run({ tenantId, userId: "system", role: "owner" }, async () => {
    try {
      // 1. Fetch file hash from inbox record
      const inboxRes = await queryGlobal(
        "SELECT created_at, file_hash, file_name FROM resume_inbox WHERE id = $1 LIMIT 1;",
        [inboxId]
      );
      if (inboxRes.rowCount === 0) {
        throw new Error(`Inbox item ${inboxId} not found in database.`);
      }
      const inboxRecord = inboxRes.rows[0];
      const fileHash = inboxRecord.file_hash || "";
      const uploadDuration = Date.now() - new Date(inboxRecord.created_at).getTime();

      // Log SLA Upload timing
      await logProcessingStep(tenantId, inboxId, null, "Upload", "Success", "Storage", uploadDuration);

      // 2. Read file and extract text
      const parseStart = Date.now();
      const ext = path.extname(filePath).toLowerCase();
      let rawText = "";
      const fileBuffer = fs.readFileSync(filePath);

      if (ext === ".pdf") {
        const pdfParse = await import("pdf-parse");
        let parsedText = "";
        if (typeof pdfParse === 'function') {
          const data = await (pdfParse as any)(fileBuffer);
          parsedText = data.text;
        } else if (typeof (pdfParse as any).default === 'function') {
          const data = await (pdfParse as any).default(fileBuffer);
          parsedText = data.text;
        } else if (typeof (pdfParse as any).PDFParse === 'function') {
          const parser = new (pdfParse as any).PDFParse({ data: fileBuffer });
          const data = await parser.getText();
          parsedText = data.text;
        } else {
          throw new Error("No valid PDF parsing function or class constructor found in pdf-parse module.");
        }
        rawText = parsedText;
      } else if (ext === ".docx") {
        const mammoth = await import("mammoth");
        let parseFn: any = mammoth;
        if (typeof mammoth.default === 'object' && mammoth.default !== null) {
          parseFn = mammoth.default;
        }
        const result = await parseFn.extractRawText({ buffer: fileBuffer });
        rawText = result.value;
      } else {
        rawText = fileBuffer.toString("utf-8");
      }

      // Check text readability
      const validateRes = validateResumeText(rawText);
      if (!validateRes.valid) {
        throw new Error(validateRes.reason);
      }

      const parseDuration = Date.now() - parseStart;
      await logProcessingStep(tenantId, inboxId, null, "Parsing", "Success", "System", parseDuration);

      // 3. AI Cost Control Check (Cache lookup)
      let parsedData: ParsedResumeData | null = null;
      const aiStart = Date.now();

      const cacheRes = await queryGlobal(
        `SELECT c.*, ri.overall_confidence, ri.email_confidence, ri.phone_confidence, ri.skills_confidence
         FROM candidates c
         JOIN resume_inbox ri ON ri.candidate_id = c.id
         WHERE ri.file_hash = $1 AND ri.tenant_id = $2 AND ri.status IN ('Parsed', 'Matched')
         LIMIT 1;`,
        [fileHash, tenantId]
      );

      if ((cacheRes.rowCount || 0) > 0) {
        const cached = cacheRes.rows[0];
        console.log(`[Cache Hit] Reusing parsed data for hash ${fileHash} from candidate ${cached.id}`);
        parsedData = {
          firstName: cached.first_name || cached.name.split(" ")[0] || "",
          lastName: cached.last_name || cached.name.split(" ")[1] || "",
          email: cached.email,
          phone: cached.phone || "",
          city: cached.city || "",
          state: cached.state || "",
          country: cached.country || "",
          skills: cached.skills || [],
          certifications: cached.certifications || [],
          education: cached.education || "",
          experienceYears: cached.experience_years || 0,
          linkedinUrl: cached.linkedin_url,
          githubUrl: cached.github_url,
          summary: cached.recommendation || "",
          usCitizen: cached.us_citizen || false,
          greenCard: cached.green_card || false,
          h1b: cached.h1b || false,
          opt: cached.opt || false,
          cpt: cached.cpt || false,
          ead: cached.ead || false,
          tnVisa: cached.tn_visa || false,
          requiresSponsorship: cached.requires_sponsorship || false,
          overallConfidence: Number(cached.overall_confidence) || 1.0,
          emailConfidence: Number(cached.email_confidence) || 1.0,
          phoneConfidence: Number(cached.phone_confidence) || 1.0,
          skillsConfidence: Number(cached.skills_confidence) || 1.0,
          strengths: cached.strengths || [],
          concerns: cached.weaknesses || [],
          recommendationReason: cached.recommendation || "",
          matchedSkills: cached.matched_skills || [],
          missingSkills: cached.missing_skills || []
        };
        providerName = "Cache";
      } else {
        // Fetch job description if specified to focus parser
        let jobDescription = "";
        if (targetJobId) {
          const jobRes = await queryGlobal("SELECT description FROM jobs WHERE id = $1 LIMIT 1;", [targetJobId]);
          jobDescription = jobRes.rows[0]?.description || "";
        }

        const parseResult = await ResumeParserManager.parse(rawText, jobDescription);
        parsedData = parseResult.data;
        providerName = parseResult.provider;

        // Deduct credits and update monthly summaries
        const deducted = await TenantUsageService.deductCredits(tenantId, 3);
        if (deducted) {
          await TenantUsageService.incrementMetric(tenantId, "ai_screens", 1);
        }
      }

      const aiDuration = Date.now() - aiStart;
      await logProcessingStep(tenantId, inboxId, null, "AI Analysis", "Success", providerName, aiDuration);

      // Save raw text if new
      await queryGlobal(
        `INSERT INTO resume_texts (batch_id, s3_key, raw_text, tenant_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (batch_id) DO NOTHING;`,
        [inboxId, inboxRecord.file_name, rawText, tenantId]
      );

      // 4. Candidate Deduplication Scans
      let primaryCandidateId: string | null = null;
      let dupReason = "";

      // Check email
      if (parsedData.email) {
        const emailCheck = await queryGlobal(
          "SELECT id FROM candidates WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1;",
          [tenantId, parsedData.email]
        );
        if ((emailCheck.rowCount || 0) > 0) {
          primaryCandidateId = emailCheck.rows[0].id;
          dupReason = `Email matches existing candidate: ${parsedData.email}`;
        }
      }

      // Check phone digits (fallback)
      if (!primaryCandidateId && parsedData.phone) {
        const phoneDigits = parsedData.phone.replace(/[^0-9]/g, "");
        if (phoneDigits.length >= 10) {
          const phoneCheck = await queryGlobal(
            `SELECT id FROM candidates 
             WHERE tenant_id = $1 AND phone IS NOT NULL AND phone != '' 
             AND regexp_replace(phone, '[^0-9]', '', 'g') = $2 LIMIT 1;`,
            [tenantId, phoneDigits]
          );
          if ((phoneCheck.rowCount || 0) > 0) {
            primaryCandidateId = phoneCheck.rows[0].id;
            dupReason = `Phone matches existing candidate: ${parsedData.phone}`;
          }
        }
      }

      // 5. Create Candidate Record
      candidateId = crypto.randomUUID();
      const candidateName = `${parsedData.firstName} ${parsedData.lastName}`.trim() || "Unknown Candidate";
      const candidateStatus = primaryCandidateId ? "duplicate" : "applied";

      await queryGlobal(
        `INSERT INTO candidates (
          id, tenant_id, name, email, phone, role, score, match_percent, experience_years, 
          skills, certifications, education, linkedin_url, github_url, recommendation,
          first_name, last_name, city, state, country, us_citizen, green_card, h1b, opt, cpt, ead, tn_visa,
          requires_sponsorship, strengths, weaknesses, matched_skills, missing_skills, status, application_source, applied_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, CURRENT_DATE::text
        );`,
        [
          candidateId, tenantId, candidateName, parsedData.email || "", parsedData.phone || "",
          parsedData.firstName ? `${parsedData.firstName} Role` : "Software Engineer",
          parsedData.skillsScore || 70, parsedData.skillsScore || 70, parsedData.experienceYears,
          parsedData.skills, parsedData.certifications, parsedData.education, parsedData.linkedinUrl || "", parsedData.githubUrl || "",
          parsedData.recommendationReason || "", parsedData.firstName, parsedData.lastName,
          parsedData.city, parsedData.state, parsedData.country,
          parsedData.usCitizen, parsedData.greenCard, parsedData.h1b, parsedData.opt, parsedData.cpt, parsedData.ead, parsedData.tnVisa,
          parsedData.requiresSponsorship, parsedData.strengths, parsedData.concerns, parsedData.matchedSkills, parsedData.missingSkills,
          candidateStatus, "Manual Upload"
        ]
      );

      // Create timeline entry
      await queryGlobal(
        `INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description)
         VALUES ($1, $2, $3, 'Candidate Created', 'Candidate Profile Created', 'Candidate profile automatically generated via resume processing worker.');`,
        [crypto.randomUUID(), tenantId, candidateId]
      );

      // Create initial document link
      await queryGlobal(
        `INSERT INTO candidate_documents (id, tenant_id, candidate_id, title, file_url, document_type)
         VALUES ($1, $2, $3, $4, (SELECT file_url FROM resume_inbox WHERE id = $5), 'Resume');`,
        [crypto.randomUUID(), tenantId, candidateId, inboxRecord.file_name, inboxId]
      );

      // Increment monthly candidate counts
      await TenantUsageService.incrementMetric(tenantId, "active_candidates", 1);

      // If duplicate, link it in duplicate_candidates table
      if (primaryCandidateId) {
        await queryGlobal(
          `INSERT INTO duplicate_candidates (id, tenant_id, candidate_id, duplicate_candidate_id, reason, confidence_score)
           VALUES ($1, $2, $3, $4, $5, 100.00);`,
          [crypto.randomUUID(), tenantId, primaryCandidateId, candidateId, dupReason]
        );
      }

      // 6. Job Matching
      const matchStart = Date.now();
      const tenantRes = await queryGlobal("SELECT scoring_weights FROM tenants WHERE id = $1 LIMIT 1;", [tenantId]);
      const weights = tenantRes.rows[0]?.scoring_weights || {
        skills: 30, experience: 25, industry: 15, education: 15, location: 15
      };

      // Select jobs to match: either targeted job or all active jobs in the tenant
      let jobsToMatch: any[] = [];
      if (targetJobId) {
        const targetJob = await queryGlobal("SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2 LIMIT 1;", [targetJobId, tenantId]);
        if ((targetJob.rowCount || 0) > 0) {
          jobsToMatch.push(targetJob.rows[0]);
        }
      } else {
        // Fetch all jobs for this tenant
        const tenantJobs = await queryGlobal("SELECT * FROM jobs WHERE tenant_id = $1 LIMIT 50;", [tenantId]);
        jobsToMatch = tenantJobs.rows;
      }

      let highestMatchScore = 0;
      let matchedJobId: string | null = null;
      let matchedJobTitle = "";
      let matchedJobDesc = "";

      for (const job of jobsToMatch) {
        const match = calculateHeuristicMatch(parsedData, job, weights);
        
        await queryGlobal(
          `INSERT INTO candidate_job_matches (
            tenant_id, candidate_id, job_id, match_score, matched_skills, missing_skills, strengths, concerns, recommendation_reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (candidate_id, job_id) DO UPDATE SET 
             match_score = EXCLUDED.match_score, 
             matched_skills = EXCLUDED.matched_skills, 
             missing_skills = EXCLUDED.missing_skills,
             recommendation_reason = EXCLUDED.recommendation_reason,
             generated_at = CURRENT_TIMESTAMP;`,
          [
            tenantId, candidateId, job.id, match.score, match.matchedSkills, match.missingSkills,
            parsedData.strengths || [], parsedData.concerns || [], parsedData.recommendationReason || ""
          ]
        );

        // Record Match History
        await queryGlobal(
          `INSERT INTO candidate_match_history (id, tenant_id, candidate_id, job_id, old_score, new_score, reason)
           VALUES ($1, $2, $3, $4, 0, $5, 'Initial Matching Engine Recalculation');`,
          [crypto.randomUUID(), tenantId, candidateId, job.id, match.score]
        );

        // Track highest matching job, or target job specifically
        if (targetJobId && job.id === targetJobId) {
          highestMatchScore = match.score;
          matchedJobId = job.id;
          matchedJobTitle = job.title;
          matchedJobDesc = job.description;
        } else if (!targetJobId && match.score > highestMatchScore) {
          highestMatchScore = match.score;
          matchedJobId = job.id;
          matchedJobTitle = job.title;
          matchedJobDesc = job.description;
        }
      }

      // Default to first job if no match was targeted or found, and we have jobs
      if (!matchedJobId && jobsToMatch.length > 0) {
        matchedJobId = jobsToMatch[0].id;
        matchedJobTitle = jobsToMatch[0].title;
        matchedJobDesc = jobsToMatch[0].description;
        const match = calculateHeuristicMatch(parsedData, jobsToMatch[0], weights);
        highestMatchScore = match.score;
      }

      // Automated AI screening pipeline trigger
      if (candidateStatus === "applied" && matchedJobId) {
        if (highestMatchScore >= 70) {
          const assessmentToken = crypto.randomBytes(24).toString("hex");
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + 7);

          // Update candidate status to shortlisted and link the assessment token
          await queryGlobal(
            `UPDATE candidates 
             SET status = 'shortlisted', 
                 job_id = $1, 
                 score = $2, 
                 match_percent = $2,
                 assessment_token = $3, 
                 assessment_token_expiry = $4, 
                 assessment_status = 'pending'
             WHERE id = $5;`,
            [matchedJobId, highestMatchScore, assessmentToken, expiry, candidateId]
          );

          // Log activity and timeline
          await queryGlobal(
            `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) 
             VALUES ($1, 'email_sent', $2, $3);`,
            [candidateId, `Candidate details logged (Score ${highestMatchScore}/100 >= 70). Assessment invitation automatically sent via email.`, tenantId]
          );

          await queryGlobal(
            `INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description)
             VALUES ($1, $2, $3, 'Stage Changed', 'Shortlisted', 'Candidate qualified for assessment stage with match score: ' || $4 || '/100.');`,
            [crypto.randomUUID(), tenantId, candidateId, highestMatchScore]
          );

          // Ensure job assessment and send invitation
          try {
            await ensureJobAssessment(matchedJobId, matchedJobTitle, matchedJobDesc);
            
            await sendAssessmentInviteEmail({
              candidateName,
              candidateEmail: parsedData.email || "",
              jobTitle: matchedJobTitle,
              token: assessmentToken,
              expiryDate: expiry
            });

            await queryGlobal(
              `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) 
               VALUES ($1, 'assessment_invited', $2, $3);`,
              [candidateId, `Assessment invitation email sent to candidate. Token: ${assessmentToken}`, tenantId]
            );
          } catch (err: any) {
            console.error(`[Worker] Failed to generate/send assessment for candidate ${candidateId}:`, err);
          }
        } else {
          // Reject candidate
          await queryGlobal(
            `UPDATE candidates 
             SET status = 'rejected', 
                 job_id = $1, 
                 score = $2, 
                 match_percent = $2
             WHERE id = $3;`,
            [matchedJobId, highestMatchScore, candidateId]
          );

          await queryGlobal(
            `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) 
             VALUES ($1, 'keka_rejected', $2, $3);`,
            [candidateId, `Candidate automatically rejected (Score ${highestMatchScore}/100 < 70).`, tenantId]
          );

          await queryGlobal(
            `INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description)
             VALUES ($1, $2, $3, 'Stage Changed', 'Rejected', 'Candidate auto-rejected with match score: ' || $4 || '/100.');`,
            [crypto.randomUUID(), tenantId, candidateId, highestMatchScore]
          );
        }
      }

      const matchDuration = Date.now() - matchStart;
      await logProcessingStep(tenantId, inboxId, candidateId, "Matching", "Success", "System", matchDuration);

      // 7. Update Inbox status and confidence values
      let finalInboxStatus = "Matched";
      if (primaryCandidateId) {
        finalInboxStatus = "Duplicate";
      } else if (
        parsedData.overallConfidence < 0.60 ||
        parsedData.emailConfidence < 0.60 ||
        parsedData.phoneConfidence < 0.60 ||
        parsedData.skillsConfidence < 0.60
      ) {
        finalInboxStatus = "Needs Review";
      }

      await queryGlobal(
        `UPDATE resume_inbox SET 
          status = $1, 
          candidate_id = $2, 
          overall_confidence = $3, 
          email_confidence = $4, 
          phone_confidence = $5, 
          skills_confidence = $6, 
          updated_at = CURRENT_TIMESTAMP 
         WHERE id = $7;`,
        [
          finalInboxStatus, candidateId,
          parsedData.overallConfidence, parsedData.emailConfidence,
          parsedData.phoneConfidence, parsedData.skillsConfidence,
          inboxId
        ]
      );

      // Verify SLA duration (Alert if exceeds 5 minutes)
      const totalDuration = Date.now() - startTime;
      if (totalDuration > 5 * 60 * 1000) {
        console.warn(`⚠️ [SLA ALERT] Processing duration of inbox ${inboxId} took ${totalDuration}ms (exceeding 5 minutes).`);
      }

    } catch (err: any) {
      console.error(`[Worker Processor] Error processing inbox item ${inboxId}:`, err);
      
      // Update inbox status to Failed
      await queryGlobal(
        "UPDATE resume_inbox SET status = 'Failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;",
        [err.message || "Unknown processing error", inboxId]
      );

      // Log failure audit
      await logProcessingStep(tenantId, inboxId, candidateId, "Storage", "Failed", providerName, Date.now() - startTime, err.message);
      throw err;
    }
  });
}

/**
 * Log steps into resume_processing_logs.
 */
async function logProcessingStep(
  tenantId: string,
  inboxId: string,
  candId: string | null,
  step: string,
  status: string,
  provider: string,
  durationMs: number,
  errMsg?: string
): Promise<void> {
  const logId = crypto.randomUUID();
  try {
    await queryGlobal(
      `INSERT INTO resume_processing_logs (id, tenant_id, inbox_id, candidate_id, step, status, provider, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [logId, tenantId, inboxId, candId, step, status, provider, durationMs, errMsg || null]
    );
  } catch (err) {
    console.error("[SLA Logger] Failed to insert audit log:", err);
  }
}

// Start standalone worker execution if run directly from cli/package script
const isMain = process.argv[1] && (
  process.argv[1] === import.meta.filename ||
  process.argv[1].endsWith("resumeWorker.ts") ||
  process.argv[1].endsWith("resumeWorker.js")
);

if (isMain) {
  const resumeWorker = new Worker(
    "resume-eval-queue",
    async (job: Job) => {
      const { tenantId, inboxId, filePath, mimeType, jobId: targetJobId } = job.data as {
        tenantId: string;
        inboxId: string;
        filePath: string;
        mimeType: string;
        jobId?: string;
      };
      console.log(`[Worker] Started processing BullMQ job for inbox ${inboxId}...`);
      await parseAndEvalResume(tenantId, inboxId, filePath, mimeType, targetJobId);
      console.log(`[Worker] Finished processing BullMQ job for inbox ${inboxId}`);
    },
    { connection }
  );

  resumeWorker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err);
  });

  console.log("🔧 Standalone Resume Worker started – listening on BullMQ queue 'resume-eval-queue'");
}
