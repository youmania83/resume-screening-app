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
      let mappedJobId = c.jobId || null;
      if (c.jobId) {
        const jobCheck = await query(
          "SELECT id FROM jobs WHERE id = $1 OR external_id = $1 LIMIT 1;",
          [c.jobId]
        );
        if (jobCheck.rowCount && jobCheck.rowCount > 0) {
          mappedJobId = jobCheck.rows[0].id;
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
          role = EXCLUDED.role,
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
          applied_date = EXCLUDED.applied_date,
          -- Only update job_id if we don't already have one from email pipeline
          job_id = COALESCE(candidates.job_id, EXCLUDED.job_id),
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
        c.jobId ? "Candidate" : "Unassigned", 
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
  async screenUnscreenedCandidates(): Promise<void> {
    const targetTenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";

    // Pick ALL 0% candidates that aren't rejected and haven't been permanently marked as no-resume
    const unscreened = await query(
      `SELECT id, name, source_system, job_id 
       FROM candidates 
       WHERE tenant_id = $1
         AND (score = 0 OR score IS NULL)
         AND status NOT IN ('rejected')
         AND (recommendation IS NULL OR recommendation = '')
       ORDER BY applied_date DESC NULLS LAST, created_at DESC 
       LIMIT 100;`,
      [targetTenantId]
    );

    if (!unscreened.rowCount || unscreened.rowCount === 0) {
      return;
    }

    console.log(`[Auto Screening] Found ${unscreened.rowCount} unscreened candidates. Processing...`);
    
    for (const row of unscreened.rows) {
      try {
        const { kekaWorkflowService } = await import("./workflow.service.js");
        const src = row.source_system || "Email";
        console.log(`[Auto Screening] Screening candidate (${src}): ${row.name} (${row.id})...`);
        await kekaWorkflowService.screenCandidate(row.id);
        // Small pause to respect DeepSeek API rate limits
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err: any) {
        const msg: string = err.message || String(err);
        console.error(`[Auto Screening] Failed to screen candidate ${row.name}: ${msg}`);

        // If Keka says "No resume attached", mark this candidate so it stops retrying
        // and set a minimal placeholder so it won't be picked up in future screener runs
        if (msg.includes("No resume attached")) {
          await query(
            `UPDATE candidates 
             SET recommendation = 'No resume available in Keka — manual review required.',
                 risk_level = 'High',
                 last_synced_at = NOW()
             WHERE id = $1`,
            [row.id]
          );
          console.log(`[Auto Screening] Marked ${row.name} as no-resume-available. Will not retry.`);
        }
      }
    }
  }
}

export const kekaCandidatesService = new KekaCandidatesService();
