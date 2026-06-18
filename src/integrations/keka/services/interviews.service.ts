// src/integrations/keka/services/interviews.service.ts

import { getKekaAdapter } from "../adapters";
import { KekaInterview } from "../interfaces/Interview";
import { query } from "../../../lib/db";

export class KekaInterviewsService {
  private getAdapter() {
    return getKekaAdapter();
  }

  async createInterview(interviewData: Omit<KekaInterview, "id">): Promise<KekaInterview> {
    const interview = await this.getAdapter().createInterview(interviewData);
    
    // Fetch related job_id from candidate
    const candidateRes = await query("SELECT job_id FROM candidates WHERE id = $1", [interviewData.candidateId]);
    const jobId = candidateRes.rows[0]?.job_id || null;

    // Save to local interviews table
    await query(`
      INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, feedback, external_id, source_system, sync_status, last_synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        feedback = EXCLUDED.feedback,
        scheduled_date = EXCLUDED.scheduled_date,
        sync_status = EXCLUDED.sync_status,
        last_synced_at = EXCLUDED.last_synced_at
    `, [
      interview.id,
      interview.candidateId,
      jobId,
      interview.dateTime,
      interview.status,
      interview.feedback || null,
      interview.external_id || interview.id,
      interview.source_system || "Keka",
      "synced"
    ]);

    return interview;
  }

  async updateInterview(id: string, updates: Partial<KekaInterview>): Promise<KekaInterview> {
    const interview = await this.getAdapter().updateInterview(id, updates);
    
    // Update local interviews table
    await query(`
      UPDATE interviews
      SET status = COALESCE($1, status),
          feedback = COALESCE($2, feedback),
          scheduled_date = COALESCE($3, scheduled_date),
          last_synced_at = NOW()
      WHERE id = $4 OR external_id = $4
    `, [
      interview.status || null,
      interview.feedback || null,
      interview.dateTime || null,
      id
    ]);

    return interview;
  }
}

export const kekaInterviewsService = new KekaInterviewsService();
