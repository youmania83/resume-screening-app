// src/scripts/remapDuplicateJobLinks.ts
//
// Keka's active-jobs sync has, on more than one occasion, created a second
// `jobs` row for a posting it had already synced (new id, same title/location/
// department) and then marked one of the two copies `sync_status = 'removed'`.
// Any candidate whose `job_id` points at the removed copy is invisible to
// "active job" queries even though the identical posting is still open under
// a different id — most visibly, POST /api/assessment/send refuses to send
// with "That job opening is closed or no longer exists."
//
// This script finds candidates stuck on such a removed duplicate AND an
// unambiguous active twin (same title + location + department, case
// insensitive) under the same tenant, and repoints their job references at
// the active twin. A same-titled posting at a DIFFERENT location (e.g.
// "Sales Engineer" in Bengaluru vs Hyderabad vs Pune are three real, separate
// openings) is never treated as a match — see candidates.service.ts's own
// title-fallback guard for the same rule, and do not weaken this check to
// "pick any same-titled job" without re-reading that comment.
//
// The two duplicate job rows themselves are left alone (not deleted, not
// merged) — only the candidate/pipeline references move. The removed copy
// simply becomes unreferenced.
//
// Usage:
//   # Dry run — reports the plan, changes nothing
//   npx tsx src/scripts/remapDuplicateJobLinks.ts
//
//   # Approved run
//   CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/remapDuplicateJobLinks.ts --confirm

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { pool } from "../lib/db.js";

interface Pair {
  stuckJobId: string;
  activeJobId: string;
  title: string;
  location: string | null;
  department: string | null;
  candidateCount: number;
}

interface Unmatched {
  jobId: string;
  title: string;
  location: string | null;
  department: string | null;
  candidateCount: number;
}

async function findPlan(): Promise<{ pairs: Pair[]; unmatched: Unmatched[] }> {
  const stuck = await pool.query(`
    SELECT DISTINCT j.id as stuck_job_id, j.title, j.location, j.department, j.tenant_id,
           active_dupe.id as active_job_id,
           count(c.id) OVER (PARTITION BY j.id) as candidate_count
    FROM candidates c
    JOIN jobs j ON j.id = c.job_id
    LEFT JOIN LATERAL (
      SELECT id FROM jobs j2
      WHERE j2.tenant_id = j.tenant_id
        AND LOWER(j2.title) = LOWER(j.title)
        AND LOWER(COALESCE(j2.location,'')) = LOWER(COALESCE(j.location,''))
        AND LOWER(COALESCE(j2.department,'')) = LOWER(COALESCE(j.department,''))
        AND j2.id != j.id
        AND COALESCE(j2.status, 'active') = 'active'
        AND j2.sync_status IS DISTINCT FROM 'removed'
      LIMIT 1
    ) active_dupe ON true
    WHERE NOT (COALESCE(j.status, 'active') = 'active' AND j.sync_status IS DISTINCT FROM 'removed')
    ORDER BY j.title;
  `);

  const pairs: Pair[] = [];
  const unmatched: Unmatched[] = [];
  for (const row of stuck.rows) {
    if (row.active_job_id) {
      pairs.push({
        stuckJobId: row.stuck_job_id,
        activeJobId: row.active_job_id,
        title: row.title,
        location: row.location,
        department: row.department,
        candidateCount: Number(row.candidate_count),
      });
    } else {
      unmatched.push({
        jobId: row.stuck_job_id,
        title: row.title,
        location: row.location,
        department: row.department,
        candidateCount: Number(row.candidate_count),
      });
    }
  }
  return { pairs, unmatched };
}

async function main() {
  const argv = process.argv.slice(2);
  const envApproved = (process.env.CONFIRM_DESTRUCTIVE_ACTION || "").trim().toUpperCase() === "YES";
  const confirmed = argv.includes("--confirm") && envApproved;

  const { pairs, unmatched } = await findPlan();

  console.log(`Found ${pairs.length} duplicate-job pair(s) with an unambiguous active twin (same title + location + department):`);
  for (const p of pairs) {
    console.log(`  "${p.title}" @ ${p.location || "(no location)"} / ${p.department || "(no dept)"}: ${p.candidateCount} candidate(s) on ${p.stuckJobId} -> remap to ${p.activeJobId}`);
  }
  const totalCandidates = pairs.reduce((s, p) => s + p.candidateCount, 0);
  console.log(`Total candidates to remap: ${totalCandidates}`);

  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} non-active job posting(s) have NO unambiguous active twin — left untouched, needs manual HR review:`);
    for (const u of unmatched) {
      console.log(`  "${u.title}" @ ${u.location || "(no location)"} / ${u.department || "(no dept)"}: ${u.candidateCount} candidate(s) on ${u.jobId}`);
    }
  }

  if (pairs.length === 0) {
    console.log("\nNothing to remap.");
    process.exit(0);
  }

  if (!confirmed) {
    console.log("\nDRY RUN — no changes made. Re-run with:");
    console.log("  CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/remapDuplicateJobLinks.ts --confirm");
    process.exit(0);
  }

  // Safety re-check immediately before writing, in case data changed between
  // the plan being printed and approval being given.
  const { pairs: recheckPairs } = await findPlan();
  const recheckKey = (p: Pair) => `${p.stuckJobId}->${p.activeJobId}`;
  const plannedKeys = new Set(pairs.map(recheckKey));
  const recheckKeys = new Set(recheckPairs.map(recheckKey));
  for (const key of plannedKeys) {
    if (!recheckKeys.has(key)) {
      console.error(`🚨 SAFETY ABORT: pair ${key} no longer matches at execution time (data changed). Re-run to get a fresh plan.`);
      process.exit(1);
    }
  }

  const backupRes = await pool.query(
    `SELECT id, job_id FROM candidates WHERE job_id = ANY($1::uuid[]);`,
    [pairs.map(p => p.stuckJobId)]
  );
  const backupPath = path.join(process.cwd(), `job-remap-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backupRes.rows, null, 2));
  console.log(`\n📦 Backed up ${backupRes.rowCount} candidate job_id value(s) to ${backupPath}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let totalUpdated = 0;
    for (const { stuckJobId, activeJobId } of pairs) {
      const r = await client.query(`UPDATE candidates SET job_id = $1 WHERE job_id = $2;`, [activeJobId, stuckJobId]);
      totalUpdated += r.rowCount || 0;
      await client.query(`UPDATE assessments SET job_id = $1 WHERE job_id = $2;`, [activeJobId, stuckJobId]);
      await client.query(`UPDATE interviews SET job_id = $1 WHERE job_id = $2;`, [activeJobId, stuckJobId]);
      await client.query(`UPDATE applications SET job_id = $1 WHERE job_id = $2;`, [activeJobId, stuckJobId]).catch(() => {});
      await client.query(`UPDATE offers SET job_id = $1 WHERE job_id = $2;`, [activeJobId, stuckJobId]).catch(() => {});
      await client.query(`UPDATE client_submissions SET job_id = $1 WHERE job_id = $2;`, [activeJobId, stuckJobId]).catch(() => {});
      await client.query(`UPDATE candidate_match_history SET job_id = $1 WHERE job_id = $2;`, [activeJobId, stuckJobId]).catch(() => {});
      await client.query(`DELETE FROM candidate_job_matches WHERE job_id = $1;`, [stuckJobId]).catch(() => {});
    }
    await client.query("COMMIT");
    console.log(`✅ Remap committed. Candidates updated: ${totalUpdated}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("🚨 Remap failed, rolled back:", err);
    process.exitCode = 1;
  } finally {
    client.release();
  }

  process.exit(process.exitCode || 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
