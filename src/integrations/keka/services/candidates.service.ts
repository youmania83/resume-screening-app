// src/integrations/keka/services/candidates.service.ts

import { getKekaAdapter } from "../adapters/index.js";
import { KekaCandidate } from "../interfaces/Candidate.js";
import { query } from "../../../lib/db.js";
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
      // Isolate each candidate: a malformed record or a transient DB error
      // must not abort the whole cron cycle and skip every candidate still
      // queued behind it in this batch.
      try {
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

      // Title fallback only fires when the Job ID lookup above found nothing
      // (e.g. the two Keka sync jobs disagree on ID scheme for this posting).
      // It must never guess between same-titled postings at different
      // locations — that collapsed every "Project Engineer" applicant onto
      // whichever same-titled row happened to sync first (e.g. "...- Assam"),
      // regardless of which specific opening (Job ID) they actually applied
      // to. Only auto-map when the title identifies exactly one active job.
      if (!mappedJobId && (c as any).jobTitle) {
        const titleCheck = await query(
          `SELECT id, title FROM jobs WHERE LOWER(title) = LOWER($1) AND ${ACTIVE_JOB_SQL};`,
          [(c as any).jobTitle]
        );
        if (titleCheck.rowCount === 1) {
          mappedJobId = titleCheck.rows[0].id;
          roleTitle = titleCheck.rows[0].title;
        } else if (titleCheck.rowCount && titleCheck.rowCount > 1) {
          console.warn(`[Keka Sync] Candidate "${c.name}" (${c.email}): Job ID "${c.jobId}" did not match a known posting and title "${(c as any).jobTitle}" matches ${titleCheck.rowCount} active postings (likely different locations). Refusing to guess — candidate will be skipped for HR to map manually.`);
        }
      }

      // REQUIREMENT: Skip candidates with invalid placeholder names or invalid job mappings
      const cleanNameStr = (c.name || "").trim();
      if (!cleanNameStr || /candidate name not found|name not found|not found|unknown candidate|unknown/i.test(cleanNameStr)) {
        console.log(`[Keka Sync] Skipping candidate with placeholder name: "${c.name}" (${c.email})`);
        continue;
      }

      if (!mappedJobId || !roleTitle) {
        console.log(`[Keka Sync] Skipping candidate "${c.name}" (${c.email}): Job "${c.jobId || (c as any).jobTitle || 'Unspecified'}" is not an active open position.`);
        continue;
      }

      const candidateSkills = Array.isArray(c.skills) ? c.skills : [];
      const matchedSkills = candidateSkills.slice(0, 5);

      const initialScore = (c.aiScore && c.aiScore > 0) ? c.aiScore : 0;

      let targetId = c.id;
      if (c.email) {
        const dupCheck = await query(
          `SELECT id FROM candidates WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) AND id != $3 LIMIT 1;`,
          [targetTenantId, c.email, c.id]
        );
        if (dupCheck.rowCount && dupCheck.rowCount > 0) {
          targetId = dupCheck.rows[0].id;
        }
      }
      if (targetId === c.id && c.phone) {
        const phoneDigits = c.phone.replace(/[^0-9]/g, "");
        if (phoneDigits.length >= 10) {
          const dupCheck = await query(
            `SELECT id FROM candidates
             WHERE tenant_id = $1 AND phone IS NOT NULL AND phone != ''
               AND regexp_replace(phone, '[^0-9]', '', 'g') = $2 AND id != $3 LIMIT 1;`,
            [targetTenantId, phoneDigits, c.id]
          );
          if (dupCheck.rowCount && dupCheck.rowCount > 0) {
            targetId = dupCheck.rows[0].id;
          }
        }
      }

      await query(`
        INSERT INTO candidates (
          id, tenant_id, name, email, phone, role, score, match_percent, experience_years,
          skills, matched_skills, education,
          status, application_source, assessment_score, keka_status, applied_date,
          job_id, external_id, source_system, sync_status, last_synced_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
        ON CONFLICT (id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          role = CASE WHEN candidates.role = 'Candidate' THEN EXCLUDED.role ELSE candidates.role END,
          experience_years = EXCLUDED.experience_years,
          skills = CASE WHEN array_length(EXCLUDED.skills, 1) > 0 THEN EXCLUDED.skills ELSE candidates.skills END,
          matched_skills = CASE WHEN array_length(EXCLUDED.matched_skills, 1) > 0 THEN EXCLUDED.matched_skills ELSE candidates.matched_skills END,
          education = COALESCE(EXCLUDED.education, candidates.education),
          status = candidates.status,
          application_source = EXCLUDED.application_source,
          assessment_score = COALESCE(candidates.assessment_score, EXCLUDED.assessment_score),
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
        targetId,
        targetTenantId,
        c.name,
        c.email,
        c.phone || null,
        roleTitle,
        initialScore,
        initialScore, 
        c.experience || 0,
        candidateSkills,
        matchedSkills,
        c.education || null,
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
      } catch (err: any) {
        console.error(`[Keka Sync] Failed to sync candidate "${c.name}" (${c.email || c.id}), skipping and continuing with the rest of the batch:`, err.message || err);
        continue;
      }
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
