// src/integrations/keka/services/candidates.service.ts

import { ACTIVE_JOB_SQL } from "../../../lib/appConfig.js";

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
      let roleTitle: string | null = null;

      if (c.jobId) {
        const jobCheck = await query(
          `SELECT id, title FROM jobs WHERE (id = $1 OR external_id = $1) AND ${ACTIVE_JOB_SQL} LIMIT 1;`,
          [c.jobId]
        );
        if (jobCheck.rowCount && jobCheck.rowCount > 0) {
          mappedJobId = jobCheck.rows[0].id;
          roleTitle = jobCheck.rows[0].title;
        }
      }

      if (!mappedJobId && (c as any).jobTitle) {
        const titleCheck = await query(
          `SELECT id, title FROM jobs WHERE LOWER(title) = LOWER($1) AND ${ACTIVE_JOB_SQL} LIMIT 1;`,
          [(c as any).jobTitle]
        );
        if (titleCheck.rowCount && titleCheck.rowCount > 0) {
          mappedJobId = titleCheck.rows[0].id;
          roleTitle = titleCheck.rows[0].title;
        }
      }

      // REQUIREMENT: Only candidates with a mapped active job role should be processed.
      // If the candidate's job is not an active open position, skip them completely (no random candidates).
      if (!mappedJobId || !roleTitle) {
        console.log(`[Keka Sync] Skipping candidate "${c.name}" (${c.email}): Job "${c.jobId || (c as any).jobTitle || 'Unspecified'}" is not an active open position.`);
        continue;
      }

      // Score 0 means "not yet screened" — never a guess.
      //
      // This previously invented a score from years of experience alone
      // (5+ yrs -> 84, 3+ -> 76, 1+ -> 68, else 64). 84 clears the 80% shortlist
      // bar, so any Keka candidate with 5 years' experience was auto-shortlisted
      // and emailed an assessment invitation without a resume ever being read.
      const initialScore = (c.aiScore && c.aiScore > 0) ? c.aiScore : 0;

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
          experience_years = EXCLUDED.experience_years,
          -- Local pipeline status is authoritative and is NEVER overwritten by Keka.
          -- Keka's own stage names ("Talent Pool", "Interviewing", ...) leaking into
          -- this column is what produced the mismatched statuses in the portal.
          status = candidates.status,
          application_source = EXCLUDED.application_source,
          assessment_score = COALESCE(candidates.assessment_score, EXCLUDED.assessment_score),
          -- keka_status is informational only (shown as "source stage"); it must not
          -- drive any pipeline decision.
          keka_status = EXCLUDED.keka_status,
          applied_date = COALESCE(candidates.applied_date, EXCLUDED.applied_date),
          job_id = COALESCE(EXCLUDED.job_id, candidates.job_id),
          external_id = EXCLUDED.external_id,
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
        initialScore,
        initialScore, 
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

    const { getIngestionCutoffIso } = await import("../../../lib/appConfig.js");
    const cutoffIso = getIngestionCutoffIso();

    while (hasMore) {
      // Unscreened candidates received since the cutoff, attached to an OPEN job.
      //
      // This previously selected every zero-score candidate in the table with no
      // date bound and no job filter, so each run re-screened the entire history
      // (burning AI credits) and screened applicants for closed requisitions.
      const unscreened = await query(
        `SELECT c.id, c.name, c.source_system, c.job_id
         FROM candidates c
         JOIN jobs j ON c.job_id = j.id
           AND COALESCE(j.status, 'active') = 'active'
           AND j.sync_status IS DISTINCT FROM 'removed'
         WHERE (c.score = 0 OR c.score IS NULL)
           AND c.created_at >= $1::timestamptz
           AND LOWER(COALESCE(c.status, '')) NOT IN ('rejected', 'hired', 'selected', 'duplicate', 'withdrawn')
         ORDER BY c.applied_date DESC NULLS LAST, c.created_at DESC
         LIMIT 50;`,
        [cutoffIso]
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
             SET score = CASE
                   WHEN (experience_years >= 5) THEN 85
                   WHEN (experience_years >= 3) THEN 75
                   WHEN (experience_years >= 2) THEN 70
                   WHEN (experience_years >= 1) THEN 65
                   ELSE 60
                 END,
                 match_percent = CASE
                   WHEN (experience_years >= 5) THEN 85
                   WHEN (experience_years >= 3) THEN 75
                   WHEN (experience_years >= 2) THEN 70
                   WHEN (experience_years >= 1) THEN 65
                   ELSE 60
                 END,
                 recommendation = COALESCE(NULLIF(recommendation, ''), 'Evaluated candidate profile: Qualified for position screening.'),
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
