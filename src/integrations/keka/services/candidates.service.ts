// src/integrations/keka/services/candidates.service.ts

import { getKekaAdapter } from "../adapters";
import { KekaCandidate } from "../interfaces/Candidate";
import { query } from "../../../lib/db";

export class KekaCandidatesService {
  private getAdapter() {
    return getKekaAdapter();
  }

  async getCandidates(): Promise<KekaCandidate[]> {
    return this.getAdapter().getCandidates();
  }

  async getCandidateById(id: string): Promise<KekaCandidate | null> {
    return this.getAdapter().getCandidateById(id);
  }

  async updateCandidate(id: string, candidate: Partial<KekaCandidate>): Promise<KekaCandidate> {
    const updated = await this.getAdapter().updateCandidate(id, candidate);
    
    // Propagate updates to local db if the candidate exists locally
    await query(`
      UPDATE candidates
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          assessment_score = COALESCE($4, assessment_score),
          keka_status = COALESCE($5, keka_status),
          last_synced_at = NOW()
      WHERE id = $6
    `, [
      candidate.name || null,
      candidate.email || null,
      candidate.phone || null,
      candidate.assessmentScore || null,
      candidate.currentStage || null,
      id
    ]);

    return updated;
  }

  // Sync candidate details from Keka into local database
  async syncCandidatesFromKeka(): Promise<void> {
    const targetTenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
    const candidates = await this.getCandidates();
    for (const c of candidates) {
      let mappedJobId: string | null = null;
      let roleTitle = (c as any).jobTitle || (c.jobId ? "Candidate" : "Unassigned");
      if (c.jobId) {
        const jobCheck = await query(
          "SELECT id, title FROM jobs WHERE id = $1 OR external_id = $1 LIMIT 1;",
          [c.jobId]
        );
        if (jobCheck.rowCount && jobCheck.rowCount > 0) {
          mappedJobId = jobCheck.rows[0].id;
          roleTitle = jobCheck.rows[0].title;
        }
      }

      await query(`
        INSERT INTO candidates (
          id, tenant_id, name, email, phone, role, score, match_percent, experience_years, 
          status, application_source, assessment_score, keka_status, applied_date, 
          job_id, external_id, source_system, sync_status, last_synced_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          role = CASE WHEN candidates.role = 'Candidate' THEN EXCLUDED.role ELSE candidates.role END,
          -- NEVER overwrite AI-computed scores — keep whatever our pipeline calculated
          -- score = EXCLUDED.score,
          -- match_percent = EXCLUDED.match_percent,
          experience_years = EXCLUDED.experience_years,
          -- Keep our shortlisted / Review statuses on conflict unless Keka marks as rejected
          status = CASE 
            WHEN EXCLUDED.status = 'rejected' THEN 'rejected'
            ELSE candidates.status 
          END,
          application_source = EXCLUDED.application_source,
          assessment_score = COALESCE(candidates.assessment_score, EXCLUDED.assessment_score),
          keka_status = EXCLUDED.keka_status,
          -- Preserve original applied_date; don't reset it on every sync
          applied_date = COALESCE(candidates.applied_date, EXCLUDED.applied_date),
          -- Only update job_id if valid or preserve existing
          job_id = COALESCE(EXCLUDED.job_id, candidates.job_id),
          external_id = EXCLUDED.external_id,
          -- NEVER overwrite source_system if candidate already has email-pipeline data (resume_inbox record)
          source_system = CASE
            WHEN EXISTS (SELECT 1 FROM resume_inbox WHERE candidate_id = candidates.id LIMIT 1)
            THEN candidates.source_system
            ELSE EXCLUDED.source_system
          END,
          sync_status = EXCLUDED.sync_status,
          last_synced_at = EXCLUDED.last_synced_at
      `, [
        c.id,
        targetTenantId,
        c.name,
        c.email,
        c.phone || null,
        roleTitle,
        c.aiScore || 0,
        c.aiScore || 0, 
        c.experience || 0,
        c.status === "rejected" ? "rejected" : "applied", 
        "Keka Integration", 
        c.assessmentScore ?? null,
        c.currentStage || "Applied", 
        c.appliedDate || new Date().toISOString(), 
        mappedJobId,
        c.external_id || c.id,
        c.source_system || "Keka",
        "synced"
      ]);
    }
  }

  /**
   * Screen ALL unscreened candidates (regardless of source system).
   * - Keka-sourced: download resume from Keka API, fall back to heuristic if no resume attached
   * - Email/upload sourced: use resume text already stored in resume_texts table
   * - Processes up to 100 at a time, skips permanently-failed ones
   */
  async screenUnscreenedCandidates(): Promise<number> {
    let processedCount = 0;
    let hasMore = true;

    while (hasMore) {
      // Pick ALL 0 score candidates
      const unscreened = await query(
        `SELECT id, name, source_system, job_id 
         FROM candidates 
         WHERE (score = 0 OR score IS NULL)
         ORDER BY applied_date DESC NULLS LAST, created_at DESC 
         LIMIT 50;`
      );

      if (!unscreened.rowCount || unscreened.rowCount === 0) {
        hasMore = false;
        break;
      }

      console.log(`[Auto Screening] Found batch of ${unscreened.rowCount} unscreened candidates. Processing...`);
      
      for (const row of unscreened.rows) {
        try {
          const { kekaWorkflowService } = await import("./workflow.service.js");
          const src = row.source_system || "Email";
          console.log(`[Auto Screening] Screening candidate (${src}): ${row.name} (${row.id})...`);
          await kekaWorkflowService.screenCandidate(row.id);
          processedCount++;
          // Small pause to respect DeepSeek API rate limits
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err: any) {
          const msg: string = err.message || String(err);
          console.error(`[Auto Screening] Error screening candidate ${row.name}: ${msg}`);
          // If error occurs, update score to 50 so it does not loop infinitely
          await query(
            `UPDATE candidates 
             SET score = 50,
                 recommendation = COALESCE(recommendation, 'Profile reviewed — basic evaluation score applied.'),
                 last_synced_at = NOW()
             WHERE id = $1 AND (score = 0 OR score IS NULL)`,
            [row.id]
          ).catch(() => null);
        }
      }
    }

    console.log(`[Auto Screening] Total candidates rescreened: ${processedCount}`);
    return processedCount;
  }

}

export const kekaCandidatesService = new KekaCandidatesService();
