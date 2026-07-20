// src/scripts/cleanupDuplicateKekaJobs.ts
import crypto from "crypto";
import { query } from "../lib/db.js";
import { KekaCareersSyncService } from "../services/KekaCareersSyncService.js";

function generateDeterministicUuid(jobId: number | string, tenantId: string): string {
  const hash = crypto.createHash("md5").update(`keka-job-${jobId}-${tenantId}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    "a" + hash.slice(17, 20),
    hash.slice(20, 32)
  ].join("-");
}

export async function cleanupDuplicateKekaJobs() {
  console.log("🧹 [Job Deduplication] Starting database job deduplication...");

  // 1. Fetch all jobs with external_id
  const res = await query(
    "SELECT id, external_id, tenant_id, title, created_at FROM jobs WHERE external_id IS NOT NULL;"
  );

  console.log(`[Job Deduplication] Found ${res.rowCount} job records with external_id.`);

  // Group by external_id and tenant_id
  const groupMap = new Map<string, Array<{ id: string; title: string; created_at: any }>>();

  for (const row of res.rows) {
    const tenantId = row.tenant_id || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
    const key = `${row.external_id}_${tenantId}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(row);
  }

  const idsToDelete = new Set<string>();
  const remapArray: Array<{ oldId: string; newId: string }> = [];

  for (const [key, rows] of groupMap.entries()) {
    const [externalId, tenantId] = key.split("_");
    const canonicalId = generateDeterministicUuid(externalId, tenantId);

    let canonicalRow = rows.find(r => r.id === canonicalId);

    if (!canonicalRow) {
      // Pick the earliest created row as canonical base
      canonicalRow = rows.reduce((prev, curr) => (new Date(curr.created_at) < new Date(prev.created_at) ? curr : prev));
      const oldCanonicalId = canonicalRow.id;

      // Copy template row to canonicalId first
      await query(
        `INSERT INTO jobs (id, tenant_id, title, description, department, location, experience_required, jd, skills, work_mode, external_id, job_code, source_system, sync_status, last_synced_at)
         SELECT $1, tenant_id, title, description, department, location, experience_required, jd, skills, work_mode, external_id, job_code, source_system, sync_status, last_synced_at
         FROM jobs WHERE id = $2
         ON CONFLICT (id) DO NOTHING;`,
        [canonicalId, oldCanonicalId]
      );

      remapArray.push({ oldId: oldCanonicalId, newId: canonicalId });
      idsToDelete.add(oldCanonicalId);
    }

    for (const row of rows) {
      if (row.id !== canonicalId) {
        remapArray.push({ oldId: row.id, newId: canonicalId });
        idsToDelete.add(row.id);
      }
    }
  }

  const deleteIdsArray = Array.from(idsToDelete);
  console.log(`[Job Deduplication] Total ${deleteIdsArray.length} duplicate job IDs to clean up across ${groupMap.size} unique Keka jobs.`);

  if (remapArray.length > 0) {
    console.log("Remapping child records in bulk per canonical job...");
    const newToOldMap = new Map<string, string[]>();
    for (const remap of remapArray) {
      if (!newToOldMap.has(remap.newId)) {
        newToOldMap.set(remap.newId, []);
      }
      newToOldMap.get(remap.newId)!.push(remap.oldId);
    }

    for (const [newId, oldIds] of newToOldMap.entries()) {
      await query("UPDATE candidates SET job_id = $1 WHERE job_id = ANY($2);", [newId, oldIds]);
      await query("UPDATE assessments SET job_id = $1 WHERE job_id = ANY($2);", [newId, oldIds]);
      await query("UPDATE interviews SET job_id = $1 WHERE job_id = ANY($2);", [newId, oldIds]);
      await query("UPDATE applications SET job_id = $1 WHERE job_id = ANY($2);", [newId, oldIds]);
      await query("UPDATE offers SET job_id = $1 WHERE job_id = ANY($2);", [newId, oldIds]);
      await query("UPDATE client_submissions SET job_id = $1 WHERE job_id = ANY($2);", [newId, oldIds]);
      await query("UPDATE candidate_match_history SET job_id = $1 WHERE job_id = ANY($2);", [newId, oldIds]);
    }
  }

  if (deleteIdsArray.length > 0) {
    console.log("Deleting candidate matches and duplicate job records in bulk...");
    const chunkSize = 100;
    for (let i = 0; i < deleteIdsArray.length; i += chunkSize) {
      const chunk = deleteIdsArray.slice(i, i + chunkSize);
      await query("DELETE FROM candidate_job_matches WHERE job_id = ANY($1);", [chunk]);
      await query("DELETE FROM jobs WHERE id = ANY($1);", [chunk]);
    }
  }

  console.log(`✅ [Job Deduplication] Finished! Cleaned up ${deleteIdsArray.length} duplicate job records.`);

  // 2. Trigger fresh Keka Careers active jobs sync
  console.log("⏰ [Job Deduplication] Running live Keka Careers active jobs sync...");
  const syncResult = await KekaCareersSyncService.syncActiveJobs();
  console.log("✅ [Job Deduplication] Live sync finished:", syncResult);
}

if (process.argv[1] && process.argv[1].endsWith("cleanupDuplicateKekaJobs.ts")) {
  cleanupDuplicateKekaJobs()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("🚨 Deduplication script failed:", err);
      process.exit(1);
    });
}
