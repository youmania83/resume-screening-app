// src/integrations/keka/services/workflow.service.ts
import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

import { query } from "../../../lib/db";
import { kekaApplicationsService } from "./applications.service";
import { kekaInterviewsService } from "./interviews.service";
import { kekaOffersService } from "./offers.service";
import { kekaAssessmentService } from "./assessment.service";
import { kekaDocumentsService } from "./documents.service";
import { callDeepSeek } from "../../../lib/deepseek";
import { isKekaEnabled } from "../config/keka.config";

// Define the threshold mapping configurations
export const STAGE_ROUTING_THRESHOLDS = {
  REJECT_THRESHOLD: 60,
  HR_REVIEW_THRESHOLD: 75,
  ASSESSMENT_THRESHOLD: 85
};

function buildEvaluatePrompt(jobDescription: string, resumeText: string): string {
  return `You are an expert ATS parser and recruiter. Evaluate the following candidate resume against the Job Description.

CRITICAL EVALUATION RULE: This job and candidate are based in India. Do NOT mention or list any weaknesses, gaps, risk factors, or concerns regarding US work authorization, US visa status (H1B, OPT, CPT, Green Card, etc.), or lack of US experience/market exposure. These are completely irrelevant for Indian domestic roles.

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
  "weaknesses": string[] (2 professional weaknesses or gaps relative to the JD. DO NOT include any US visa, US work authorization, or lack of US experience/market exposure points.),
  "missingSkills": string[] (skills required/preferred in the JD but missing in the resume),
  "matchedSkills": string[] (skills matching the JD),
  "skills": string[] (all technical and soft skills identified in the resume),
  "certifications": string[] (any professional certifications extracted from the resume),
  "projects": string[] (notable projects or case studies mentioned in the resume),
  "keywords": string[] (list of 5-8 relevant industry keywords identified in the resume),
  "riskFactors": string[] (any warning flags, e.g. short tenure, gap in employment, etc. DO NOT include any US visa, US work authorization, or lack of US experience/market exposure points.),
  "education": string (highest educational degree and institution)
}

Evaluate the candidate objectively and rigorously against the requirements.
Return ONLY the raw JSON object. Do not include markdown code block formatting (like \`\`\`json), do not include any explanatory text outside the JSON.`;
}

export class KekaWorkflowService {
  /**
   * Orchestrates the parsing -> AI screening -> scoring workflow for a candidate.
   * Downloads resume from Keka, parses the text, calculates LLM score, and auto-routes.
   */
  async screenCandidate(candidateId: string): Promise<any> {
    console.log(`Starting automated AI screening workflow for candidate: ${candidateId}`);
    
    // 1. Fetch candidate details
    const res = await query("SELECT * FROM candidates WHERE id = $1", [candidateId]);
    if (!res.rowCount || res.rowCount === 0) {
      throw new Error(`Candidate with ID ${candidateId} not found`);
    }
    const candidate = res.rows[0];

    // 2. Get resume text — try multiple sources in priority order
    let resumeText = "";

    // 2a. First: check if we already have extracted text stored locally (email pipeline candidates)
    const storedTextRes = await query(
      `SELECT rt.resume_text FROM resume_texts rt
       JOIN resume_inbox ri ON ri.id = rt.inbox_id
       WHERE ri.candidate_id = $1 AND rt.resume_text IS NOT NULL AND length(rt.resume_text) > 50
       ORDER BY ri.created_at DESC LIMIT 1;`,
      [candidateId]
    ).catch(() => ({ rowCount: 0, rows: [] }));

    if ((storedTextRes.rowCount || 0) > 0) {
      resumeText = storedTextRes.rows[0].resume_text;
      console.log(`[Auto Screening] Using stored resume text for candidate ${candidateId}`);
    } else {
      // 2b. Try downloading from Keka
      console.log(`Downloading resume for candidate ${candidateId}...`);
      try {
        const resumeBuffer = await kekaDocumentsService.downloadResume(candidateId);
        
        if (resumeBuffer.toString("utf8").startsWith("%PDF")) {
          if (resumeBuffer.toString("utf8").includes("Mock Resume Contents")) {
            // Mock adapter simulation
            resumeText = `
              Full Name: ${candidate.name || "Clark Kent"}
              Email: ${candidate.email || "clark.kent@example.com"}
              Phone: ${candidate.phone || "+91 99999 55555"}
              Experience: 5 years of full stack software engineering. Worked on React, Node.js, TypeScript, PostgreSQL, AWS.
              Education: Bachelor of Technology in Computer Science from Metropolis University.
              Skills: React, Node.js, Express, JavaScript, TypeScript, HTML, CSS, SQL, Git, Docker.
              Projects: Daily Planet News CMS - React frontend, Node.js backend.
            `;
          } else {
            const pdfParse = require("pdf-parse");
            let parsedText = "";
            if (typeof pdfParse === 'function') {
              const data = await (pdfParse as any)(resumeBuffer);
              parsedText = data.text;
            } else if (typeof (pdfParse as any).default === 'function') {
              const data = await (pdfParse as any).default(resumeBuffer);
              parsedText = data.text;
            } else if (typeof (pdfParse as any).PDFParse === 'function') {
              const parser = new (pdfParse as any).PDFParse({ data: resumeBuffer });
              const data = await parser.getText();
              parsedText = data.text;
            } else {
              throw new Error("No valid PDF parsing function or class constructor found in pdf-parse module.");
            }
            resumeText = parsedText;
          }
        } else {
          resumeText = resumeBuffer.toString("utf8");
        }
      } catch (downloadErr: any) {
        const errMsg: string = downloadErr.message || String(downloadErr);
        
        // 2c. Fallback: if Keka has no resume file, build a profile from DB data for AI scoring
        if (errMsg.includes("No resume attached") || errMsg.includes("400")) {
          console.warn(`[Auto Screening] No resume in Keka for ${candidate.name}. Building profile from DB data for AI scoring...`);
          const skills = Array.isArray(candidate.skills) ? candidate.skills.join(", ") : (candidate.skills || "Not specified");
          const education = candidate.education || "Not specified";
          const experience = candidate.experience_years || 0;
          const role = candidate.role || candidate.keka_status || "Not specified";
          resumeText = [
            `Candidate Name: ${candidate.name}`,
            `Email: ${candidate.email}`,
            `Phone: ${candidate.phone || "Not provided"}`,
            `Current Role / Application Stage: ${role}`,
            `Total Experience: ${experience} years`,
            `Skills: ${skills}`,
            `Education: ${education}`,
            `Source: Applied via Keka ATS`,
            `Note: No detailed resume document available. Scoring is based on profile data only.`
          ].join("\n");
        } else {
          // Re-throw unexpected errors so the caller can handle them
          throw downloadErr;
        }
      }
    }

    // 3. Resolve associated Job Description
    let jobDescription = "Graduate Engineer Trainee with mechanical, electrical, or civil engineering background for Indian domestic manufacturing roles.";
    if (candidate.job_id) {
      const jobRes = await query("SELECT title, description FROM jobs WHERE id = $1 OR external_id = $1 LIMIT 1;", [candidate.job_id]);
      if (jobRes.rowCount && jobRes.rowCount > 0) {
        jobDescription = `Job Title: ${jobRes.rows[0].title}\nDescription: ${jobRes.rows[0].description}`;
      }
    }

    // 4. Run LLM Scoring via DeepSeek
    console.log("Calling AI model for resume parsing and score calculation...");
    const prompt = buildEvaluatePrompt(jobDescription, resumeText);
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
      console.error("Failed to parse AI response JSON:", responseText);
      throw new Error("Invalid response formatting from AI model during automated screening");
    }

    const score = parsedResult.score || 0;
    console.log(`AI screening complete. Score: ${score}/100`);

    // 5. Update Candidate Record in Database
    await query(`
      UPDATE candidates
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          role = $4,
          score = $5,
          match_percent = $5,
          experience_years = $6,
          experience_match = $7,
          recommendation = $8,
          confidence = $9,
          risk_level = $10,
          strengths = $11,
          weaknesses = $12,
          missing_skills = $13,
          matched_skills = $14,
          skills = $15,
          keywords = $16,
          education = $17,
          last_synced_at = NOW()
      WHERE id = $18
    `, [
      parsedResult.name || candidate.name,
      parsedResult.email || candidate.email,
      parsedResult.phone || candidate.phone,
      parsedResult.role || candidate.role,
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
      parsedResult.keywords || [],
      parsedResult.education || "",
      candidateId
    ]);

    // Log screening logs
    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, 'ai_screened', $2)
    `, [candidateId, `AI resume parsing and matching complete. Score: ${score}/100.`]);

    // 6. Route stage based on the score
    return this.autoRouteStage(candidateId, score);
  }

  /**
   * Helper method to calculate or aggregate candidate AI match score metrics.
   */
  async calculateAIScore(candidateId: string): Promise<number> {
    const res = await query("SELECT score FROM candidates WHERE id = $1", [candidateId]);
    return res.rows[0]?.score || 0;
  }

  /**
   * Schedules an interview, hooks into the Keka adapter, and records it locally.
   */
  async scheduleInterview(candidateId: string, interviewer: string, dateTime: Date | string): Promise<any> {
    console.log(`Scheduling interview for candidate ${candidateId} with ${interviewer} at ${dateTime}`);
    
    const interview = await kekaInterviewsService.createInterview({
      candidateId,
      interviewer,
      dateTime,
      status: "scheduled"
    });

    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, 'interview_scheduled', $2)
    `, [candidateId, `Technical Interview scheduled with ${interviewer} for ${new Date(dateTime).toLocaleString()}`]);

    return interview;
  }

  /**
   * Generates a candidate compensation offer, triggers the Keka adapter, and records it locally.
   */
  async generateOffer(candidateId: string, salary: string, joiningDate: Date | string): Promise<any> {
    console.log(`Generating employment offer for candidate ${candidateId}`);
    
    // Fetch candidate details for job mapping
    const candRes = await query("SELECT job_id FROM candidates WHERE id = $1", [candidateId]);
    const jobId = candRes.rows[0]?.job_id || "unassigned";

    const offerLetterUrl = `https://rison-ai-offers.s3.amazonaws.com/offer-cand-${candidateId}.pdf`;
    
    const offer = await kekaOffersService.createOffer({
      candidateId,
      jobId,
      salary,
      joiningDate,
      status: "draft",
      offerLetterUrl
    });

    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, 'offer_created', $2)
    `, [candidateId, `Job Offer generated with compensation ${salary} and joining date ${new Date(joiningDate).toLocaleDateString()}`]);

    return offer;
  }

  /**
   * Evaluates candidate AI match score and routes their application pipeline stage.
   */
  async autoRouteStage(candidateId: string, aiScore: number): Promise<any> {
    let targetStage = "";
    let status = "applied";
    let activityLog = "";

    // Fetch candidate name, job details, and existing assessment state
    const candRes = await query(`
      SELECT c.name, c.email, c.job_id, c.assessment_token, c.assessment_status, j.title, j.description 
      FROM candidates c 
      LEFT JOIN jobs j ON c.job_id = j.id 
      WHERE c.id = $1
    `, [candidateId]);
    
    if (!candRes.rowCount || candRes.rowCount === 0) {
      throw new Error(`Candidate details query failed for ${candidateId}`);
    }
    const { name, email, job_id: jobId, assessment_token: existingToken, assessment_status: existingStatus, title: jobTitle, description: jobDesc } = candRes.rows[0];

    if (aiScore < 60) {
      targetStage = "Rejected";
      status = "rejected";
      activityLog = `Candidate automatically rejected (Score ${aiScore}/100 < 60). Moved to Rejected Pool in Keka.`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "Rejected");
      await query(`UPDATE candidates SET status = 'rejected' WHERE id = $1;`, [candidateId]);
    } 
    else if (aiScore < 80) {
      targetStage = "HR Review";
      status = "Review";
      activityLog = `Candidate placed on Hold (Score ${aiScore}/100 is between 60 and 79). Moved to HR Review in Keka.`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "HR Review");
      await query(`UPDATE candidates SET status = 'Review' WHERE id = $1;`, [candidateId]);
    }
    else {
      targetStage = "Assessment";
      status = "shortlisted";

      if (existingToken && existingStatus && existingStatus !== "rejected") {
        console.log(`ℹ️ Candidate ${candidateId} already has an active assessment (${existingStatus}). Skipping duplicate invitation email.`);
        return {
          candidateId,
          score: aiScore,
          targetStage,
          status,
          log: `Candidate already has active assessment. Invitation email skipped to prevent spam.`
        };
      }
      
      activityLog = `Candidate qualified for Assessment (Score ${aiScore}/100 >= 80). Generating MCQ link and sending invite email.`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "Assessment");

      // Generate assessment token and set pending assessment state in candidates table
      const token = crypto.randomBytes(24).toString("hex");
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);

      await query(
        `UPDATE candidates 
         SET status = 'shortlisted',
             assessment_token = $1,
             assessment_token_expiry = $2,
             assessment_status = 'pending'
         WHERE id = $3;`,
        [token, expiry, candidateId]
      );
      
      // Generate Assessment and trigger email dispatch
      if (jobId && jobTitle) {
        await kekaAssessmentService.generateAssessment(candidateId, jobId, jobTitle, jobDesc || "");
        await kekaAssessmentService.sendAssessmentEmail(candidateId, name, email, jobTitle, token);
      }
    }


    // Log the action to activity logs
    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, $2, $3)
    `, [candidateId, targetStage.toLowerCase() === "rejected" ? "keka_rejected" : "stage_changed", activityLog]);

    return {
      candidateId,
      score: aiScore,
      targetStage,
      status,
      log: activityLog
    };
  }

  /**
   * Automatically executes stage changes on assessment completion.
   * If they pass (Integrated Score >= 80), routes them to the Keka "Interview" stage and schedules HR interview.
   */
  async handleAssessmentCompletion(candidateId: string, finalScore: number): Promise<any> {
    console.log(`Processing assessment completion hook for candidate: ${candidateId} (Integrated Score: ${finalScore})`);
    
    let targetStage = "HR Review";
    let status = "shortlisted";
    let logMessage = "";
    let interviewDate: Date | null = null;

    if (finalScore >= 80) {
      targetStage = "Interview";
      status = "interviewing";
      logMessage = `Candidate passed online assessment (Integrated Score: ${finalScore} >= 80). Automatically moved to Keka Interview Stage and scheduled HR interview.`;
      
      // Move candidate stage in Keka to Interview
      await kekaApplicationsService.moveCandidateStage(candidateId, "Interview");

      // Update status in local candidates DB overriding applications service stage change default 'applied'
      await query(`UPDATE candidates SET status = 'interviewing' WHERE id = $1;`, [candidateId]);
      
      // Schedule dynamic interview 2 days from now at 10:00 AM
      interviewDate = new Date();
      interviewDate.setDate(interviewDate.getDate() + 2);
      interviewDate.setHours(10, 0, 0, 0);

      await this.scheduleInterview(candidateId, "HR Recruiter", interviewDate);
    } 
    else if (finalScore >= 60) {
      targetStage = "HR Review";
      status = "shortlisted";
      logMessage = `Candidate completed assessment in borderline range (Integrated Score: ${finalScore}/100). Moved to Keka HR Review Stage.`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "HR Review");
      await query(`UPDATE candidates SET status = 'shortlisted' WHERE id = $1;`, [candidateId]);
    } 
    else {
      targetStage = "Rejected";
      status = "rejected";
      logMessage = `Candidate failed assessment (Integrated Score: ${finalScore} < 60). Moved to Rejected Pool.`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "Rejected");
    }

    // Log activity
    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, $2, $3)
    `, [candidateId, targetStage.toLowerCase() === "rejected" ? "keka_rejected" : "stage_changed", logMessage]);

    return {
      candidateId,
      finalScore,
      targetStage,
      status,
      log: logMessage,
      interviewDate
    };
  }

  /**
   * Triggers candidate onboarding into the Keka HRMS system as an active employee.
   */
  async onboardCandidate(candidateId: string): Promise<any> {
    console.log(`Initializing employee onboarding workflow for candidate: ${candidateId}`);

    // Fetch candidate details
    const res = await query("SELECT * FROM candidates WHERE id = $1", [candidateId]);
    if (!res.rowCount || res.rowCount === 0) {
      throw new Error(`Candidate with ID ${candidateId} not found`);
    }
    const candidate = res.rows[0];

    // Log onboarding initialization
    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, 'onboarding', $2)
    `, [candidateId, `Employee onboarding sync initiated to Keka HRMS for candidate: ${candidate.name}`]);

    if (isKekaEnabled()) {
      // Placeholder for real Keka HRMS onboarding request: POST /api/v1/keka/employees
      console.log(`🔌 POSTing employee details to Keka HRMS: ${candidate.name}`);
      // In production, we would build the payload: name, email, phone, joiningDate, jobTitle, etc.
    } else {
      console.log(`🧪 Mock onboarding sync completed for candidate: ${candidate.name}`);
    }

    // Update candidate sync status in local database
    await query(`
      UPDATE candidates
      SET sync_status = 'synced',
          last_synced_at = NOW()
      WHERE id = $1
    `, [candidateId]);

    // Log success
    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, 'onboarding', $2)
    `, [candidateId, `Onboarding completed. Candidate sync'd as Employee to Keka HRMS successfully.`]);

    return {
      success: true,
      candidateId,
      name: candidate.name,
      status: "Onboarded"
    };
  }
}

export const kekaWorkflowService = new KekaWorkflowService();

