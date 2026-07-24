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
          score = EXCLUDED.score,
          match_percent = EXCLUDED.match_percent,
          experience_years = EXCLUDED.experience_years,
          status = EXCLUDED.status,
          application_source = EXCLUDED.application_source,
          assessment_score = EXCLUDED.assessment_score,
          keka_status = EXCLUDED.keka_status,
          applied_date = EXCLUDED.applied_date,
          job_id = EXCLUDED.job_id,
          external_id = EXCLUDED.external_id,
          source_system = EXCLUDED.source_system,
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
        new Date().toISOString(), 
        mappedJobId,
        c.external_id || c.id,
        c.source_system || "Keka",
        "synced"
      ]);
    }
  }

  // Sequentially screen candidates that have not been evaluated yet
  async screenUnscreenedCandidates(): Promise<void> {
    const unscreened = await query(
      "SELECT id, name FROM candidates WHERE source_system = 'Keka' AND (score = 0 OR score IS NULL) LIMIT 10;"
    );
    if (!unscreened.rowCount || unscreened.rowCount === 0) {
      return;
    }

    console.log(`[Auto Screening] Found ${unscreened.rowCount} unscreened Keka candidates. Screening them sequentially...`);
    
    for (const row of unscreened.rows) {
      try {
        const { kekaWorkflowService } = await import("./workflow.service.js");
        console.log(`[Auto Screening] Screening Keka candidate: ${row.name} (${row.id})...`);
        await kekaWorkflowService.screenCandidate(row.id);
        // Sleep for 3 seconds between candidates to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err: any) {
        console.error(`[Auto Screening] Failed to screen candidate ${row.name}:`, err.message || err);
      }
    }
  }
}

export const kekaCandidatesService = new KekaCandidatesService();
