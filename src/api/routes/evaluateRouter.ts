// src/api/routes/evaluateRouter.ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { callDeepSeek } from "../../lib/deepseek";
import { query } from "../../lib/db";
import crypto from "crypto";
import { ensureJobAssessment } from "../../lib/assessmentService";
import { sendAssessmentInviteEmail } from "../../lib/email";

const upload = multer({ dest: "uploads/" });
const router = Router();

function buildEvaluatePrompt(jobDescription: string, resumeText: string): string {
  return `You are an expert ATS parser and recruiter. Evaluate the following candidate resume against the Job Description.

Job Description:
${jobDescription}

Candidate Resume:
${resumeText}

Analyze the resume and return a JSON object with the following fields:
{
  "name": string (candidate's name, extract from resume),
  "email": string (candidate's email, extract from resume),
  "phone": string (candidate's phone number, extract from resume),
  "role": string (candidate's current role or match target role),
  "score": number (overall match score from 0 to 100 based on fit),
  "experienceYears": number (estimated total years of relevant experience as a number),
  "experienceMatch": string (1 sentence explaining how their experience fits the role),
  "recommendation": string (2-3 sentences explaining your recommendation),
  "confidence": string (e.g. "95% (High)" or "60% (Medium)" or "40% (Low)"),
  "riskLevel": string (either "Low", "Medium", or "High"),
  "strengths": string[] (3 key professional strengths extracted from the resume),
  "weaknesses": string[] (2 professional weaknesses or gaps relative to the JD),
  "missingSkills": string[] (skills required/preferred in the JD but missing in the resume),
  "matchedSkills": string[] (skills matching the JD),
  "skills": string[] (all technical and soft skills identified in the resume),
  "certifications": string[] (any professional certifications extracted from the resume),
  "projects": string[] (notable projects or case studies mentioned in the resume),
  "keywords": string[] (list of 5-8 relevant industry keywords identified in the resume),
  "riskFactors": string[] (any warning flags, e.g. short tenure, gap in employment, etc.),
  "education": string (highest educational degree and institution)
}

Evaluate the candidate objectively and rigorously against the requirements:
- The "score" must reflect the actual alignment with the Job Description. A candidate with none of the required skills or experience must receive a very low score (e.g. < 40). A candidate matching almost all requirements should receive a high score (e.g. > 85).
- Ensure "missingSkills" and "matchedSkills" are populated accurately by checking the required and preferred skills in the Job Description against the Candidate Resume.

Return ONLY the raw JSON object. Do not include markdown code block formatting (like \`\`\`json), do not include any explanatory text outside the JSON.`;
}

router.post("/", upload.single("file"), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume file is required" });
    }
    const { jobDescription } = req.body as { jobDescription: string };
    if (!jobDescription) {
      return res.status(400).json({ error: "jobDescription is required" });
    }

    const clientId = req.headers["x-client-id"] || "unknown_client";

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rawText = "";

    const fileBuffer = fs.readFileSync(filePath);

    if (ext === ".pdf") {
      const pdfParse = await import("pdf-parse");
      const parseFn = (pdfParse as any).default || pdfParse;
      const data = await parseFn(fileBuffer);
      rawText = data.text;
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const parseFn = (mammoth as any).default || mammoth;
      const result = await parseFn.extractRawText({ buffer: fileBuffer });
      rawText = result.value;
    } else {
      rawText = fileBuffer.toString("utf-8");
    }

    // Clean up local temp file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("Failed to clean up temp file:", err);
    }

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: "Could not extract text from the resume file." });
    }

    // Parse and format the job description nicely if it's stringified JSON
    let formattedJobDescription = jobDescription;
    let jobTitle = "SCM Executive";
    let parsedJD: any = null;
    try {
      parsedJD = JSON.parse(jobDescription);
      if (parsedJD && typeof parsedJD === "object") {
        jobTitle = parsedJD.title || "SCM Executive";
        formattedJobDescription = `
Job Title: ${parsedJD.title || "Not Specified"}
Experience Required: ${parsedJD.experience || "Not Specified"}
Department: ${parsedJD.department || "Not Specified"}
Location: ${parsedJD.location || "Not Specified"}
Required Skills: ${Array.isArray(parsedJD.requiredSkills) ? parsedJD.requiredSkills.join(", ") : (parsedJD.requiredSkills || "Not Specified")}
Preferred Skills: ${Array.isArray(parsedJD.preferredSkills) ? parsedJD.preferredSkills.join(", ") : (parsedJD.preferredSkills || "Not Specified")}
Education Required: ${parsedJD.education || "Not Specified"}
Responsibilities:
${Array.isArray(parsedJD.responsibilities) ? parsedJD.responsibilities.map((r: string) => `- ${r}`).join("\n") : (parsedJD.responsibilities || "Not Specified")}
Keywords: ${Array.isArray(parsedJD.keywords) ? parsedJD.keywords.join(", ") : (parsedJD.keywords || "Not Specified")}
Screening Criteria:
${Array.isArray(parsedJD.screeningCriteria) ? parsedJD.screeningCriteria.map((c: string) => `- ${c}`).join("\n") : (parsedJD.screeningCriteria || "Not Specified")}
        `.trim();
      }
    } catch (e) {
      // Keep original text format if not JSON
    }

    // Call DeepSeek to evaluate the candidate (stateless!)
    const prompt = buildEvaluatePrompt(formattedJobDescription, rawText);
    const responseText = await callDeepSeek(prompt);

    let parsedResult;
    try {
      let cleanedJson = responseText.trim();
      const firstBrace = cleanedJson.indexOf("{");
      const lastBrace = cleanedJson.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
      }
      parsedResult = JSON.parse(cleanedJson);
    } catch (e) {
      console.error("Failed to parse DeepSeek response as JSON:", responseText);
      return res.status(500).json({ error: "Invalid response formatting from AI model" });
    }

    // Log the usage to database for billing purposes (Credits managed on server database)
    try {
      await query(
        `INSERT INTO client_usage_logs (client_id, event_type, credits_used)
         VALUES ($1, $2, $3);`,
        [clientId, "resume_screening", 3]
      );
    } catch (dbErr) {
      console.error("Failed to log billing usage:", dbErr);
    }

    const candidateId = `cand-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const appliedDate = new Date().toISOString().split("T")[0];
    const score = parsedResult.score || 0;
    const applicationSource = req.body.applicationSource || "Careers Page";
    
    // Resolve Job in database (relational mapping)
    let jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const targetJobTitle = jobTitle || parsedResult.role || "SCM Executive";
    const targetJobDesc = parsedJD ? (parsedJD.description || jobDescription) : jobDescription;
    const targetDept = parsedJD?.department || "Operations";
    const targetLoc = parsedJD?.location || "Bengaluru, India";
    const targetExp = parsedJD?.experience || "2-5 Years";

    try {
      const jobRes = await query(`SELECT id FROM jobs WHERE title = $1 LIMIT 1;`, [targetJobTitle]);
      if (jobRes.rowCount && jobRes.rowCount > 0) {
        jobId = jobRes.rows[0].id;
      } else {
        await query(
          `INSERT INTO jobs (id, title, description, department, location, experience_required)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [jobId, targetJobTitle, targetJobDesc, targetDept, targetLoc, targetExp]
        );
      }
    } catch (dbJobErr) {
      console.error("Failed to map candidate to job:", dbJobErr);
    }

    let status = "applied";
    let kekaStatus = "active";
    let logMessage = "";
    
    let assessmentToken = null;
    let assessmentTokenExpiry = null;
    let assessmentStatusVal = null;

    if (score < 70) {
      status = "rejected";
      kekaStatus = "rejected_pool";
      logMessage = `Candidate automatically rejected (Score ${score}/100 < 70). Moved to Rejected Pool in Keka HRMS.`;
    } else {
      status = "shortlisted";
      kekaStatus = "active";
      logMessage = `Candidate details logged (Score ${score}/100 >= 70). Assessment invitation automatically sent via email.`;
      
      // Auto-generate assessment details
      assessmentToken = crypto.randomBytes(24).toString("hex");
      assessmentTokenExpiry = new Date();
      assessmentTokenExpiry.setDate(assessmentTokenExpiry.getDate() + 7); // 7 days from now
      assessmentStatusVal = "pending";
    }

    const activityLogs = [
      { date: new Date().toISOString(), message: `Application received through ${applicationSource}` },
      { date: new Date().toISOString(), message: `AI resume parsing complete. Skills, Experience, Education, Certifications, Projects, and Keywords extracted.` },
      { date: new Date().toISOString(), message: `JD Matching & AI Scoring: Overall score is ${score}/100.` },
      { date: new Date().toISOString(), message: logMessage }
    ];

    try {
      try {
        // Save Candidate with Job link & Token details
        const insertRes = await query(
          `INSERT INTO candidates (
            id, name, email, phone, role, score, match_percent, experience_years, 
            experience_match, recommendation, confidence, risk_level, strengths, 
            weaknesses, missing_skills, matched_skills, skills, certifications, 
            projects, keywords, status, application_source, keka_status, applied_date,
            job_id, assessment_token, assessment_token_expiry, assessment_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28);`,
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
        console.log('✅ Candidate inserted, rows:', insertRes.rowCount);
        if (!insertRes.rowCount || insertRes.rowCount === 0) {
          console.warn('⚠️ Candidate insert reported 0 rows');
        }
      } catch (err) {
        console.error("Database insert error:", err);
        throw err;
      }

      // Log activities to candidate_activity_logs
      await query(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);`,
        [candidateId, "application_received", `Application received through ${applicationSource}`]
      );
      await query(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);`,
        [candidateId, "ai_screened", `AI resume parsing complete. Score: ${score}/100.`]
      );
      await query(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);`,
        [candidateId, score < 70 ? "keka_rejected" : "email_sent", logMessage]
      );

      // Trigger automatic MCQ generation & invitation dispatch for shortlisted candidates
      if (score >= 70 && assessmentToken && assessmentTokenExpiry) {
        // 1. Generate assessment (async or sync - let's ensure it exists)
        await ensureJobAssessment(jobId, targetJobTitle, targetJobDesc);
        
        // 2. Dispatch email
        await sendAssessmentInviteEmail({
          candidateName: parsedResult.name || "Candidate",
          candidateEmail: parsedResult.email || "",
          jobTitle: targetJobTitle,
          token: assessmentToken,
          expiryDate: assessmentTokenExpiry
        });

        // 3. Log invite email sent
        await query(
          `INSERT INTO candidate_activity_logs (candidate_id, event_type, message) VALUES ($1, $2, $3);`,
          [candidateId, "assessment_invited", `Assessment invitation email sent to candidate. Token: ${assessmentToken}`]
        );
      }
    } catch (dbErr) {
      console.error("Failed to save candidate to DB:", dbErr);
    }

    // Return the evaluation back to the client browser
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
    console.error("Evaluation error:", err);
    res.status(500).json({ error: err.message || "Evaluation failed" });
  }
});

export default router;
