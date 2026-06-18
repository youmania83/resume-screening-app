// src/integrations/keka/services/workflow.service.ts

import { query } from "../../../lib/db";
import { kekaCandidatesService } from "./candidates.service";
import { kekaApplicationsService } from "./applications.service";
import { kekaInterviewsService } from "./interviews.service";
import { kekaOffersService } from "./offers.service";
import { kekaAssessmentService } from "./assessment.service";

// Define the threshold mapping configurations
export const STAGE_ROUTING_THRESHOLDS = {
  REJECT_THRESHOLD: 60,
  HR_REVIEW_THRESHOLD: 75,
  ASSESSMENT_THRESHOLD: 85
};

export class KekaWorkflowService {
  /**
   * Orchestrates the parsing -> AI screening -> scoring workflow for a candidate.
   */
  async screenCandidate(candidateId: string): Promise<any> {
    console.log(`Starting automated AI screening workflow for candidate: ${candidateId}`);
    
    // Fetch candidate details
    const res = await query("SELECT * FROM candidates WHERE id = $1", [candidateId]);
    if (!res.rowCount || res.rowCount === 0) {
      throw new Error(`Candidate with ID ${candidateId} not found`);
    }
    const candidate = res.rows[0];
    const aiScore = candidate.score || 0;

    // Log screening start
    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, 'ai_screened', $2)
    `, [candidateId, `AI Resume Screening initialized. Match Score is ${aiScore}/100.`]);

    // Route candidate based on score
    return this.autoRouteStage(candidateId, aiScore);
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

    // Fetch candidate name & job details
    const candRes = await query(`
      SELECT c.name, c.email, c.job_id, j.title, j.description 
      FROM candidates c 
      LEFT JOIN jobs j ON c.job_id = j.id 
      WHERE c.id = $1
    `, [candidateId]);
    
    if (!candRes.rowCount || candRes.rowCount === 0) {
      throw new Error(`Candidate details query failed for ${candidateId}`);
    }
    const { name, email, job_id: jobId, title: jobTitle, description: jobDesc } = candRes.rows[0];

    if (aiScore < STAGE_ROUTING_THRESHOLDS.REJECT_THRESHOLD) {
      targetStage = "Rejected";
      status = "rejected";
      activityLog = `Candidate automatically rejected (Score ${aiScore} < ${STAGE_ROUTING_THRESHOLDS.REJECT_THRESHOLD}). Moved to Rejected Pool.`;
      
      // Update Candidate and Application stage
      await kekaApplicationsService.moveCandidateStage(candidateId, "Rejected");
    } 
    else if (aiScore >= STAGE_ROUTING_THRESHOLDS.REJECT_THRESHOLD && aiScore < STAGE_ROUTING_THRESHOLDS.HR_REVIEW_THRESHOLD) {
      targetStage = "HR Review";
      status = "shortlisted";
      activityLog = `Candidate moved to HR Review (Score ${aiScore} matches threshold ${STAGE_ROUTING_THRESHOLDS.REJECT_THRESHOLD}-${STAGE_ROUTING_THRESHOLDS.HR_REVIEW_THRESHOLD}).`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "HR Review");
    } 
    else if (aiScore >= STAGE_ROUTING_THRESHOLDS.HR_REVIEW_THRESHOLD && aiScore < STAGE_ROUTING_THRESHOLDS.ASSESSMENT_THRESHOLD) {
      targetStage = "Assessment";
      status = "shortlisted";
      activityLog = `Candidate qualified for Assessment (Score ${aiScore} >= ${STAGE_ROUTING_THRESHOLDS.HR_REVIEW_THRESHOLD}). Generating MCQ link.`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "Assessment");
      
      // Generate Assessment and trigger email dispatch
      if (jobId && jobTitle) {
        const token = await kekaAssessmentService.generateAssessment(candidateId, jobId, jobTitle, jobDesc || "");
        await kekaAssessmentService.sendAssessmentEmail(candidateId, name, email, jobTitle, token);
      }
    } 
    else {
      // aiScore >= 85
      targetStage = "Interview";
      status = "shortlisted";
      activityLog = `Candidate fast-tracked to Interview (Score ${aiScore} >= ${STAGE_ROUTING_THRESHOLDS.ASSESSMENT_THRESHOLD}). Scheduling interview.`;
      
      await kekaApplicationsService.moveCandidateStage(candidateId, "Interview");
      
      // Trigger dynamic scheduling
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 3);
      await this.scheduleInterview(candidateId, "Engineering Panel Team", nextWeek);
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
}

export const kekaWorkflowService = new KekaWorkflowService();
