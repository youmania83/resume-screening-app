// src/integrations/keka/services/assessment.service.ts

import { query } from "../../../lib/db";
import { ensureJobAssessment } from "../../../lib/assessmentService";
import { sendAssessmentInviteEmail } from "../../../lib/email";
import crypto from "crypto";

export class KekaAssessmentService {
  async generateAssessment(candidateId: string, jobId: string, jobTitle: string, jobDescription: string): Promise<string> {
    console.log(`Generating assessment for candidate ${candidateId} (Job: ${jobTitle})`);
    
    // Ensure assessment template exists for this job in database
    await ensureJobAssessment(jobId, jobTitle, jobDescription);
    
    // Generate secure assessment token
    const token = crypto.randomBytes(24).toString("hex");
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // 7 days from now

    // Update candidate record with assessment details
    await query(`
      UPDATE candidates
      SET assessment_token = $1,
          assessment_token_expiry = $2,
          assessment_status = 'pending'
      WHERE id = $3
    `, [token, expiryDate, candidateId]);

    return token;
  }

  async sendAssessmentEmail(candidateId: string, candidateName: string, candidateEmail: string, jobTitle: string, token: string): Promise<void> {
    console.log(`Sending assessment invite email to ${candidateEmail}`);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    await sendAssessmentInviteEmail({
      candidateName,
      candidateEmail,
      jobTitle,
      token,
      expiryDate
    });

    await query(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
      VALUES ($1, 'assessment_invited', $2)
    `, [candidateId, `Assessment invitation email sent to candidate. Token: ${token}`]);
  }

  async receiveAssessmentResults(candidateId: string, score: number): Promise<void> {
    console.log(`Received assessment results for candidate ${candidateId}: ${score}`);
    await this.updateAssessmentScore(candidateId, score);
  }

  async updateAssessmentScore(candidateId: string, score: number): Promise<void> {
    await query(`
      UPDATE candidates
      SET assessment_score = $1,
          assessment_completed_at = NOW(),
          assessment_status = 'completed'
      WHERE id = $2
    `, [score, candidateId]);

    // Recalculate Final Integrated Score
    // Final Score = (Resume Score * 40%) + (Assessment Score * 60%)
    const candRes = await query("SELECT score FROM candidates WHERE id = $1", [candidateId]);
    if (candRes.rowCount && candRes.rowCount > 0) {
      const resumeScore = candRes.rows[0].score || 0;
      const finalScore = Number(((resumeScore * 0.4) + (score * 0.6)).toFixed(1));
      
      await query(`
        UPDATE candidates
        SET final_score = $1
        WHERE id = $2
      `, [finalScore, candidateId]);
    }
  }
}

export const kekaAssessmentService = new KekaAssessmentService();
