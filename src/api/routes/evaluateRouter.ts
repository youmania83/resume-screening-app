// src/api/routes/evaluateRouter.ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { callDeepSeek } from "../../lib/deepseek.js";
import { queryTenant } from "../../lib/tenantDb.js";
import crypto from "crypto";
import { ensureJobAssessment } from "../../lib/assessmentService.js";
import { sendAssessmentInviteEmail, sendApplicationAcknowledgementEmail } from "../../lib/email.js";
import { creditCheck } from "../middleware/creditMiddleware.js";
import { TenantUsageService } from "../../services/TenantUsageService.js";
import { getTenantContext, tenantStorage } from "../../lib/tenantContext.js";
import { detectPromptInjection } from "../../lib/guardrails.js";
import { rateLimiter } from "../middleware/security.js";

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "text/plain",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, and TXT files are allowed"));
    }
  },
});
const router = Router();

function buildEvaluatePrompt(jobDescription: string, resumeText: string): string {
  return `You are an expert ATS parser and recruiter. Evaluate the following candidate resume against the Job Description.

CRITICAL EVALUATION RULE: This job and candidate are based in India. Do NOT mention or list any weaknesses, gaps, risk factors, or concerns regarding US work authorization, US visa status (H1B, OPT, CPT, Green Card, etc.), or lack of US experience/market exposure. These are completely irrelevant for Indian domestic roles.

Job Description:
${jobDescription}

Candidate Resume:
${resumeText}

Analyze the resume and return ONLY a JSON object:
{
  "name": "string (candidate's name)",
  "email": "string (candidate's email)",
  "phone": "string (candidate's phone number)",
  "role": "string (match target role)",
  "score": 0-100 (overall match score),
  "experienceYears": number (total years of relevant experience),
  "experienceMatch": "1 sentence explanation of experience fit",
  "recommendation": "2-3 sentences recommendation explanation",
  "confidence": "95% (High) / 60% (Medium)",
  "riskLevel": "Low / Medium / High",
  "strengths": ["3 key strengths"],
  "weaknesses": ["2 weaknesses. DO NOT include any US visa, US work authorization, or lack of US experience/market exposure points."],
  "missingSkills": ["skills in JD but missing in resume"],
  "matchedSkills": ["skills matching the JD"],
  "skills": ["all skills identified"],
  "certifications": ["certifications"],
  "projects": ["notable projects"],
  "keywords": ["5-8 keywords"],
  "riskFactors": ["any warning flags. DO NOT include any US visa, US work authorization, or lack of US experience/market exposure points."],
  "education": "highest degree and institution"
}
Do not include markdown code block formatting or explanations outside the JSON.`;
}

router.post("/", rateLimiter(1 * 60 * 1000, 10), creditCheck("ai_screen"), upload.single("file"), async (req: any, res: any, next: any) => {
  const tenantId = req.user?.tenantId || req.headers["x-tenant-id"] || "default-tenant";
  const userId = req.user?.userId || "system";
  const role = req.user?.role || "owner";

  await tenantStorage.run({ tenantId, userId, role }, async () => {
    try {
    const { jobDescription } = req.body as { jobDescription: string };
    if (jobDescription && detectPromptInjection(jobDescription)) {
       res.status(400).json({ error: "Security Alert: Potential prompt injection detected in Job Description." });
       return;
    }

    if (!req.file) {
       res.status(400).json({ error: "Resume file is required" });
       return;
    }
     if (!jobDescription) {
       res.status(400).json({ error: "jobDescription is required" });
       return;
    }

    const clientId = req.headers["x-client-id"] || "unknown_client";
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
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
      const parseFn = (mammoth as any).default || mammoth;
      const result = await parseFn.extractRawText({ buffer: fileBuffer });
      rawText = result.value;
    } else {
      rawText = fileBuffer.toString("utf-8");
    }

    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("Failed to clean up temp file:", err);
    }

    if (!rawText || !rawText.trim()) {
       res.status(400).json({ error: "Could not extract text from the resume file." });
       return;
    }

    if (detectPromptInjection(rawText)) {
       res.status(400).json({ error: "Security Alert: Potential prompt injection detected in Resume content." });
       return;
    }

    let formattedJobDescription = jobDescription;
    let jobTitle = "SCM Executive";
    let parsedJD: any = null;
    try {
      parsedJD = JSON.parse(jobDescription);
      if (parsedJD && typeof parsedJD === "object") {
        jobTitle = parsedJD.title || "SCM Executive";
        formattedJobDescription = `
Job Title: ${parsedJD.title || "Not Specified"}
Required Skills: ${Array.isArray(parsedJD.requiredSkills) ? parsedJD.requiredSkills.join(", ") : (parsedJD.requiredSkills || "Not Specified")}
Responsibilities: ${Array.isArray(parsedJD.responsibilities) ? parsedJD.responsibilities.join("; ") : (parsedJD.responsibilities || "Not Specified")}
        `.trim();
      }
    } catch {
      // Keep original text format
    }

    const prompt = buildEvaluatePrompt(formattedJobDescription, rawText);
    const responseText = await callDeepSeek(prompt, { maxTokens: 4000 });

    let parsedResult;
    try {
      let cleanedJson = responseText.trim();
      const firstBrace = cleanedJson.indexOf("{");
      const lastBrace = cleanedJson.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
      }
      cleanedJson = cleanedJson.replace(/,\s*([\]}])/g, "$1");
      parsedResult = JSON.parse(cleanedJson);
    } catch {
      console.error("Failed to parse AI response as JSON:", responseText);
       res.status(500).json({ error: "Invalid response formatting from AI model" });
       return;
    }

    // Log usage to database scoped by tenant
    try {
      await queryTenant(
        `INSERT INTO client_usage_logs (client_id, event_type, credits_used, tenant_id)
         VALUES ($1, $2, $3, :tenant_id);`,
        [clientId, "resume_screening", 3]
      );
    } catch (dbErr) {
      console.error("Failed to log billing usage:", dbErr);
    }

    const tenantId = getTenantContext()?.tenantId || req.user?.tenantId || req.headers["x-tenant-id"] || "default-tenant";
    try {
      await TenantUsageService.deductCredits(tenantId, 3);
      await TenantUsageService.incrementMetric(tenantId, "ai_screens", 1);
      await TenantUsageService.incrementMetric(tenantId, "ai_tokens_consumed", Math.round(responseText.length / 4));
    } catch (metricErr) {
      console.error("Failed to update credit usage metrics:", metricErr);
    }

    const candidateId = `cand-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const appliedDate = new Date().toISOString().split("T")[0];
    const score = parsedResult.score || 0;
    const applicationSource = req.body.applicationSource || "Careers Page";
    
    let jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const targetJobTitle = jobTitle || parsedResult.role || "SCM Executive";
    const targetJobDesc = parsedJD ? (parsedJD.description || jobDescription) : jobDescription;
    const targetDept = parsedJD?.department || "Operations";
    const targetLoc = parsedJD?.location || "Bengaluru, India";
    const targetExp = parsedJD?.experience || "2-5 Years";

    try {
      const jobRes = await queryTenant(`SELECT id FROM jobs WHERE title = $1 AND tenant_id = :tenant_id LIMIT 1;`, [targetJobTitle]);
      if (jobRes.rowCount && jobRes.rowCount > 0) {
        jobId = jobRes.rows[0].id;
      } else {
        await queryTenant(
          `INSERT INTO jobs (id, title, description, department, location, experience_required, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, :tenant_id);`,
          [jobId, targetJobTitle, targetJobDesc, targetDept, targetLoc, targetExp]
        );
      }
    } catch (dbJobErr) {
      console.error("Failed to map candidate to job:", dbJobErr);
    }

    const emailCheck = parsedResult.email ? String(parsedResult.email).trim().toLowerCase() : "";
    if (emailCheck) {
      try {
        const existingCandidate = await queryTenant(
          `SELECT id, created_at FROM candidates WHERE LOWER(email) = $1 AND job_id = $2 AND tenant_id = :tenant_id LIMIT 1;`,
          [emailCheck, jobId]
        );
        if (existingCandidate.rowCount && existingCandidate.rowCount > 0) {
          const candRecord = existingCandidate.rows[0];
          const appliedTime = new Date(candRecord.created_at).getTime();
          const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
          
          if (Date.now() - appliedTime < twoYearsMs) {
            res.status(409).json({ error: `Candidate with email '${emailCheck}' has already applied for this job within the 2-year cooling-off period.` });
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
      } catch (checkErr) {
        console.error("Failed to check duplicate candidate:", checkErr);
      }
    }

    let status = "applied";
    let kekaStatus = "active";
    let logMessage = "";
    
    let assessmentToken = null;
    let assessmentTokenExpiry = null;
    let assessmentStatusVal = null;

    if (score < 60) {
      status = "rejected";
      kekaStatus = "rejected_pool";
      logMessage = `Candidate automatically rejected (Score ${score}/100 < 60). Moved to Rejected Pool in Keka HRMS.`;
    } else if (score < 80) {
      status = "Review";
      kekaStatus = "active";
      logMessage = `Candidate placed on Hold / HR Review (Score ${score}/100 is between 60 and 79).`;
    } else {
      status = "shortlisted";
      kekaStatus = "active";
      logMessage = `Candidate qualified for assessment (Score ${score}/100 >= 80). Assessment invitation automatically sent via email.`;
      
      assessmentToken = crypto.randomBytes(24).toString("hex");
      assessmentTokenExpiry = new Date();
      assessmentTokenExpiry.setDate(assessmentTokenExpiry.getDate() + 7);
      assessmentStatusVal = "pending";
    }


    const activityLogs = [
      { date: new Date().toISOString(), message: `Application received through ${applicationSource}` },
      { date: new Date().toISOString(), message: `AI resume parsing complete.` },
      { date: new Date().toISOString(), message: `JD Matching & AI Scoring: Overall score is ${score}/100.` },
      { date: new Date().toISOString(), message: logMessage }
    ];

    try {
      await queryTenant(
        `INSERT INTO candidates (
          id, name, email, phone, role, score, match_percent, experience_years, 
          experience_match, recommendation, confidence, risk_level, strengths, 
          weaknesses, missing_skills, matched_skills, skills, certifications, 
          projects, keywords, status, application_source, keka_status, applied_date,
          job_id, assessment_token, assessment_token_expiry, assessment_status, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, :tenant_id);`,
        [
          candidateId,
          parsedResult.name || "Unknown Candidate",
          parsedResult.email || "",
          parsedResult.phone || "",
          parsedResult.role || targetJobTitle,
          score,
          score,
          parsedResult.experienceYears || 0,
          parsedResult.experienceMatch || "",
          parsedResult.recommendation || "",
          parsedResult.confidence || "",
          parsedResult.riskLevel || "Low",
          parsedResult.strengths || [],
          parsedResult.weaknesses || [],
          parsedResult.missingSkills || [],
          parsedResult.matchedSkills || [],
          parsedResult.skills || [],
          parsedResult.certifications || [],
          parsedResult.projects || [],
          parsedResult.keywords || [],
          status,
          applicationSource,
          kekaStatus,
          appliedDate,
          jobId,
          assessmentToken,
          assessmentTokenExpiry,
          assessmentStatusVal
        ]
      );

      // Send immediate Application Acknowledgement Email
      try {
        await sendApplicationAcknowledgementEmail({
          candidateName: parsedResult.name || "Candidate",
          candidateEmail: parsedResult.email || "",
          tenantId
        });
      } catch (ackErr) {
        console.error("⚠️ [Side-Effect] Failed to send Application Acknowledgement Email:", ackErr);
      }

      await queryTenant(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) VALUES ($1, $2, $3, :tenant_id);`,
        [candidateId, "application_received", `Application received through ${applicationSource}`]
      );
      await queryTenant(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) VALUES ($1, $2, $3, :tenant_id);`,
        [candidateId, "ai_screened", `AI resume parsing complete. Score: ${score}/100.`]
      );
      await queryTenant(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) VALUES ($1, $2, $3, :tenant_id);`,
        [candidateId, score < 60 ? "keka_rejected" : (score < 80 ? "stage_changed" : "email_sent"), logMessage]
      );

      if (score >= 80 && assessmentToken && assessmentTokenExpiry) {
        await ensureJobAssessment(jobId, targetJobTitle, targetJobDesc);
        
        await sendAssessmentInviteEmail({
          candidateName: parsedResult.name || "Candidate",
          candidateEmail: parsedResult.email || "",
          jobTitle: targetJobTitle,
          token: assessmentToken,
          expiryDate: assessmentTokenExpiry,
          tenantId
        });

        await queryTenant(
          `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id) VALUES ($1, $2, $3, :tenant_id);`,
          [candidateId, "assessment_invited", `Assessment invitation email sent to candidate. Token: ${assessmentToken}`]
        );
      }
    } catch (dbErr) {
      console.error("Failed to save candidate to DB:", dbErr);
    }

    res.json({
      success: true,
      candidate: {
        id: candidateId,
        appliedDate: appliedDate,
        status: status,
        applicationSource: applicationSource,
        kekaStatus: kekaStatus,
        activityLogs: activityLogs,
        jobId,
        assessmentToken,
        assessmentStatus: assessmentStatusVal,
        ...parsedResult
      }
    });

    } catch (err: any) {
      next(err);
    }
  });
});

export default router;
