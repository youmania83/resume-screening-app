// src/lib/jobMapper.ts
import { queryTenant } from "./tenantDb.js";

export interface JobMappingInput {
  targetJobTitle: string;
  targetLocation?: string;
  jobCode?: string;
  candidateCity?: string;
  candidateState?: string;
}

/**
 * Resolves candidate applications to the exact matching Job ID,
 * supporting multi-opening roles (e.g. Sales Engineer in Hyderabad vs Bengaluru vs Delhi).
 */
export async function resolvePrecisionJobId(input: JobMappingInput): Promise<string | null> {
  const { targetJobTitle, targetLocation, jobCode, candidateCity, candidateState } = input;
  if (!targetJobTitle || !targetJobTitle.trim()) return null;

  const cleanTitle = targetJobTitle.trim().toLowerCase();
  const cleanLoc = (targetLocation || candidateCity || candidateState || "").trim().toLowerCase();
  const cleanCode = (jobCode || "").trim().toLowerCase();

  try {
    // 1. Match by exact Job Code if specified
    if (cleanCode) {
      const codeRes = await queryTenant(
        `SELECT id FROM jobs
         WHERE LOWER(job_code) = $1
           AND tenant_id = :tenant_id
           AND COALESCE(status, 'active') = 'active'
           AND sync_status IS DISTINCT FROM 'removed'
         LIMIT 1;`,
        [cleanCode]
      );
      if (codeRes.rowCount && codeRes.rowCount > 0) {
        return codeRes.rows[0].id;
      }
    }

    // 2. Fetch all open jobs matching title
    const jobsRes = await queryTenant(
      `SELECT id, title, location, job_code FROM jobs
       WHERE (LOWER(title) = $1 OR LOWER(title) LIKE '%' || $1 || '%')
         AND tenant_id = :tenant_id
         AND COALESCE(status, 'active') = 'active'
         AND sync_status IS DISTINCT FROM 'removed';`,
      [cleanTitle]
    );

    if (!jobsRes.rowCount || jobsRes.rowCount === 0) {
      return null;
    }

    const matches = jobsRes.rows;

    // If only 1 job matches title, return it
    if (matches.length === 1) {
      return matches[0].id;
    }

    // If multiple openings exist for the same title, match location
    if (cleanLoc) {
      for (const j of matches) {
        const jLoc = (j.location || "").toLowerCase();
        if (jLoc.includes(cleanLoc) || cleanLoc.includes(jLoc)) {
          console.log(`⚡ [Job Mapper] Precision location match: "${j.title}" (${j.location}) -> Job ID ${j.id}`);
          return j.id;
        }
      }
    }

    // Default to first active opening if no location match
    return matches[0].id;
  } catch (err: any) {
    console.error("🚨 [Job Mapper] Error resolving precision job ID:", err.message);
    return null;
  }
}
