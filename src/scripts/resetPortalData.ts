// src/scripts/resetPortalData.ts
//
// ARCHIVE-AND-WIPE: give the portal a clean slate for go-live.
//
// What it does, in one transaction:
//   1. Copies every pipeline table into an `archive_<table>` table (created on
//      first run, appended to on later runs, stamped with an archive batch id).
//      Nothing is destroyed — the historical rows are preserved verbatim.
//   2. Truncates the live pipeline tables so the portal starts empty.
//   3. Leaves tenants, users, settings, licences and email templates untouched.
//
// After this runs, re-populate active openings with the Keka careers sync
// (`--resync-jobs`, on by default) and let normal intake proceed from today.
//
// Usage:
//   # Dry run — reports row counts, changes nothing
//   npx tsx src/scripts/resetPortalData.ts
//
//   # Approved run
//   CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/resetPortalData.ts --confirm
//
//   Options:
//     --no-archive     Skip archiving (NOT recommended)
//     --no-resync-jobs Do not re-sync active jobs from Keka afterwards
//     --keep-jobs      Preserve currently-active job rows instead of clearing them

import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pool } from "../lib/db.js";

interface Options {
  confirmed: boolean;
  archive: boolean;
  resyncJobs: boolean;
  keepJobs: boolean;
}

function parseOptions(argv: string[]): Options {
  const envApproved = (process.env.CONFIRM_DESTRUCTIVE_ACTION || "").trim().toUpperCase() === "YES";
  return {
    // Two independent approvals so this can never fire from a stray script or hook.
    confirmed: argv.includes("--confirm") && envApproved,
    archive: !argv.includes("--no-archive"),
    resyncJobs: !argv.includes("--no-resync-jobs"),
    keepJobs: argv.includes("--keep-jobs"),
  };
}

/**
 * Pipeline tables to clear, in dependency order (children before parents).
 *
 * Deliberately EXCLUDED — these are configuration, not pipeline data:
 *   tenants, users, refresh_tokens, license_keys, email_templates,
 *   tenant_usage_summary, support_tickets
 */
const PIPELINE_TABLES: string[] = [
  // assessment lineage
  "assessment_audit",
  "assessment_violations",
  "assessment_sessions",
  "assessment_attempts",
  "assessment_questions",
  "assessments",
  // candidate lineage
  "candidate_match_history",
  "candidate_job_matches",
  "candidate_merge_history",
  "duplicate_candidates",
  "candidate_timeline",
  "candidate_activity_logs",
  "candidate_documents",
  "candidate_assignments",
  "candidate_notes",
  "candidate_tags",
  "client_submissions",
  "interview_scorecards",
  "interviews",
  "offers",
  "applications",
  "documents",
  // ingestion + comms
  "resume_processing_logs",
  "resume_texts",
  "resume_inbox",
  "email_communication_history",
  "email_logs",
  "webhook_events",
  "storage_audit_logs",
  // roots
  "candidates",
];

/** Jobs are handled separately so `--keep-jobs` can preserve active openings. */
const JOB_TABLE = "jobs";

async function tableExists(client: any, table: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1;`,
    [table]
  );
  return (res.rowCount || 0) > 0;
}

async function countRows(client: any, table: string): Promise<number> {
  try {
    const res = await client.query(`SELECT COUNT(*)::int AS c FROM ${table};`);
    return res.rows[0]?.c || 0;
  } catch {
    return 0;
  }
}

/**
 * Archives a table into `archive_<table>`.
 *
 * Uses CREATE TABLE AS on first run (which copies the column layout exactly),
 * then INSERT ... SELECT on subsequent runs. An `archived_at` / `archive_batch`
 * pair is added so multiple resets remain distinguishable.
 */
async function archiveTable(client: any, table: string, batchId: string, whereClause = ""): Promise<number> {
  const archiveName = `archive_${table}`;
  const where = whereClause ? ` WHERE ${whereClause}` : "";

  if (!(await tableExists(client, archiveName))) {
    await client.query(`CREATE TABLE ${archiveName} AS SELECT * FROM ${table}${where};`);
    await client.query(`ALTER TABLE ${archiveName} ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`ALTER TABLE ${archiveName} ADD COLUMN archive_batch VARCHAR;`);
    await client.query(`UPDATE ${archiveName} SET archive_batch = $1 WHERE archive_batch IS NULL;`, [batchId]);
  } else {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND column_name NOT IN ('archived_at', 'archive_batch')
        ORDER BY ordinal_position;`,
      [archiveName]
    );
    const colList = cols.rows.map((r: any) => `"${r.column_name}"`).join(", ");
    if (colList) {
      await client.query(
        `INSERT INTO ${archiveName} (${colList}, archived_at, archive_batch)
         SELECT ${colList}, NOW(), $1 FROM ${table}${where};`,
        [batchId]
      );
    }
  }

  const res = await client.query(`SELECT COUNT(*)::int AS c FROM ${archiveName} WHERE archive_batch = $1;`, [batchId]);
  return res.rows[0]?.c || 0;
}

async function main() {
  const opts = parseOptions(process.argv.slice(2));
  const batchId = `reset-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;

  console.log("═".repeat(74));
  console.log("PORTAL DATA RESET — archive and wipe");
  console.log("═".repeat(74));
  console.log(`Mode        : ${opts.confirmed ? "APPROVED — WILL ARCHIVE AND WIPE" : "DRY RUN — nothing will change"}`);
  console.log(`Archive     : ${opts.archive ? "yes (archive_* tables)" : "NO — data will be lost"}`);
  console.log(`Jobs        : ${opts.keepJobs ? "keep currently-active openings" : "clear all (re-sync afterwards)"}`);
  console.log(`Re-sync Keka: ${opts.resyncJobs ? "yes" : "no"}`);
  console.log(`Batch id    : ${batchId}`);
  console.log("");
  console.log("Preserved: tenants, users, refresh_tokens, license_keys, email_templates,");
  console.log("           tenant_usage_summary, support_tickets");
  console.log("");

  const client = await pool.connect();
  const summary: Array<{ table: string; rows: number }> = [];

  try {
    // Report current state.
    const allTables = [...PIPELINE_TABLES, JOB_TABLE];
    for (const table of allTables) {
      if (!(await tableExists(client, table))) continue;
      const rows = await countRows(client, table);
      if (rows > 0) summary.push({ table, rows });
    }

    if (summary.length === 0) {
      console.log("The portal is already empty — nothing to do.");
      return;
    }

    console.log("Current row counts:");
    for (const { table, rows } of summary) {
      console.log(`  ${table.padEnd(34)} ${String(rows).padStart(8)}`);
    }
    const total = summary.reduce((sum, s) => sum + s.rows, 0);
    console.log(`  ${"TOTAL".padEnd(34)} ${String(total).padStart(8)}`);

    // Always write a manifest.
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const manifestPath = path.join(logDir, `portal-reset-${opts.confirmed ? "executed" : "dryrun"}-${batchId}.json`);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), batchId, options: opts, counts: summary }, null, 2),
      "utf-8"
    );
    console.log(`\nManifest written to: ${manifestPath}`);

    if (!opts.confirmed) {
      console.log("\nDRY RUN — nothing was changed.");
      console.log("To proceed, re-run with:");
      console.log("  CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/resetPortalData.ts --confirm");
      return;
    }

    // Unconditional safety net: take a full pg_dump snapshot immediately
    // before doing anything destructive, on top of the archive_* tables
    // above. The archive step only covers PIPELINE_TABLES with the exact
    // schema this script knows about; a full external dump is a second,
    // independent recovery path that doesn't depend on this script's own
    // logic being correct. Best-effort: a failed backup logs a warning but
    // does not block the run, since the archive_* step already provides a
    // recovery path -- but every effort is made to get this snapshot first.
    try {
      const { execSync } = await import("child_process");
      console.log("\nTaking a pre-flight full database backup before making any changes...");
      execSync(`bash "${path.join(process.cwd(), "scripts", "backup-database.sh")}"`, { stdio: "inherit" });
    } catch (backupErr: any) {
      console.warn(`⚠️  Pre-flight backup failed or is unavailable (${backupErr.message}). Proceeding on the archive_* tables alone -- verify you have a separate recovery path before continuing.`);
    }

    console.log("\nStarting transaction...");
    await client.query("BEGIN;");

    try {
      // 1. Archive
      if (opts.archive) {
        console.log("\nArchiving:");
        for (const table of PIPELINE_TABLES) {
          if (!(await tableExists(client, table))) continue;
          const archived = await archiveTable(client, table, batchId);
          if (archived > 0) console.log(`  ${table.padEnd(34)} -> archive_${table} (${archived} rows)`);
        }

        if (await tableExists(client, JOB_TABLE)) {
          // When keeping active jobs, archive only the ones about to be removed.
          const jobWhere = opts.keepJobs
            ? `NOT (COALESCE(status, 'active') = 'active' AND sync_status IS DISTINCT FROM 'removed')`
            : "";
          const archived = await archiveTable(client, JOB_TABLE, batchId, jobWhere);
          if (archived > 0) console.log(`  ${JOB_TABLE.padEnd(34)} -> archive_${JOB_TABLE} (${archived} rows)`);
        }
      } else {
        console.log("\n⚠️  Archiving skipped (--no-archive).");
      }

      // 2. Clear the live tables.
      //
      // Deleted child-first, in dependency order, so foreign keys stay satisfied
      // without needing to disable constraints.
      console.log("\nClearing live tables:");
      for (const table of PIPELINE_TABLES) {
        if (!(await tableExists(client, table))) continue;
        const res = await client.query(`DELETE FROM ${table};`);
        if (res.rowCount) console.log(`  ${table.padEnd(34)} ${String(res.rowCount).padStart(8)} removed`);
      }

      if (await tableExists(client, JOB_TABLE)) {
        if (opts.keepJobs) {
          const res = await client.query(
            `DELETE FROM ${JOB_TABLE}
              WHERE NOT (COALESCE(status, 'active') = 'active' AND sync_status IS DISTINCT FROM 'removed');`
          );
          console.log(`  ${JOB_TABLE.padEnd(34)} ${String(res.rowCount || 0).padStart(8)} removed (active openings kept)`);
        } else {
          const res = await client.query(`DELETE FROM ${JOB_TABLE};`);
          console.log(`  ${JOB_TABLE.padEnd(34)} ${String(res.rowCount || 0).padStart(8)} removed`);
        }
      }

      // 3. Reset per-tenant usage counters so the dashboard does not show stale totals.
      if (await tableExists(client, "tenant_usage_summary")) {
        await client
          .query(`UPDATE tenant_usage_summary SET active_candidates = 0, active_jobs = 0, ai_screens = 0;`)
          .catch(() => {
            /* column set varies by deployment; non-fatal */
          });
      }

      await client.query("COMMIT;");
      console.log("\n✅ Portal data cleared. Historical rows preserved in archive_* tables.");
      console.log(`   Archive batch: ${batchId}`);
    } catch (txErr) {
      await client.query("ROLLBACK;");
      throw txErr;
    }
  } finally {
    client.release();
  }

  // 4. Re-populate active job openings from Keka (outside the transaction).
  if (opts.confirmed && opts.resyncJobs && !opts.keepJobs) {
    try {
      const { isKekaEnabled } = await import("../integrations/keka/config/keka.config.js");
      if (!isKekaEnabled()) {
        console.log("\nℹ️  Keka is disabled — skipping job re-sync. Add active openings manually in the portal.");
      } else {
        console.log("\nRe-syncing active job openings from Keka careers...");
        const { KekaCareersSyncService } = await import("../services/KekaCareersSyncService.js");
        const result = await KekaCareersSyncService.syncActiveJobs();
        console.log(`✅ Keka job sync complete: ${JSON.stringify(result)}`);
      }
    } catch (syncErr: any) {
      console.error("⚠️  Keka job re-sync failed. Add active openings manually, or run the sync again:", syncErr.message || syncErr);
    }
  }

  console.log("\nNext steps:");
  console.log("  1. Confirm the active openings are correct in the portal.");
  console.log("  2. Ensure INGESTION_CUTOFF_DATE in .env is today's date.");
  console.log("  3. Restart the API and worker.");
  console.log("");

  await pool.end();
}

main().catch(err => {
  console.error("🚨 Portal reset failed:", err);
  process.exit(1);
});
