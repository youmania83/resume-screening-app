// src/scripts/purgeRejectedCandidates.ts
//
// Approval-gated weekly purge of REJECTED candidates only.
//
// Retention policy implemented here:
//   • Every candidate record is retained indefinitely by default.
//   • The ONLY records eligible for deletion are candidates whose status is
//     'rejected' and who have been in that state for at least the retention
//     window (default 7 days).
//   • Nothing is deleted unless a human explicitly approves the run. This script
//     is intentionally NOT wired to any cron job.
//
// Usage:
//   Dry run (default — reports what *would* be deleted, deletes nothing):
//     npx tsx src/scripts/purgeRejectedCandidates.ts
//
//   Approved run (both flags required):
//     CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/purgeRejectedCandidates.ts --confirm
//
//   Options:
//     --days=N        Retention window in days (default 7).
//     --tenant=<id>   Restrict to a single tenant.

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { pool } from "../lib/db.js";

interface Options {
  confirmed: boolean;
  retentionDays: number;
  tenantId: string | null;
}

function parseOptions(argv: string[]): Options {
  const flagConfirm = argv.includes("--confirm");
  const envConfirm = (process.env.CONFIRM_DESTRUCTIVE_ACTION || "").trim().toUpperCase() === "YES";

  const daysArg = argv.find(a => a.startsWith("--days="));
  const parsedDays = daysArg ? Number(daysArg.split("=")[1]) : NaN;

  const tenantArg = argv.find(a => a.startsWith("--tenant="));

  return {
    // Two independent approvals are required so that neither a stray shell
    // history entry nor a lingering env var can trigger a deletion on its own.
    confirmed: flagConfirm && envConfirm,
    retentionDays: Number.isFinite(parsedDays) && parsedDays >= 1 ? Math.floor(parsedDays) : 7,
    tenantId: tenantArg ? tenantArg.split("=")[1] : null,
  };
}

/** Child tables that reference candidates, in safe deletion order. */
const CHILD_TABLES: Array<{ table: string; column: string }> = [
  { table: "candidate_job_matches", column: "candidate_id" },
  { table: "candidate_match_history", column: "candidate_id" },
  { table: "candidate_notes", column: "candidate_id" },
  { table: "candidate_tags", column: "candidate_id" },
  { table: "candidate_timeline", column: "candidate_id" },
  { table: "candidate_documents", column: "candidate_id" },
  { table: "candidate_assignments", column: "candidate_id" },
  { table: "client_submissions", column: "candidate_id" },
  { table: "candidate_activity_logs", column: "candidate_id" },
  { table: "applications", column: "candidate_id" },
  { table: "offers", column: "candidate_id" },
  { table: "documents", column: "candidate_id" },
  { table: "email_communication_history", column: "candidate_id" },
  { table: "email_logs", column: "candidate_id" },
  { table: "assessment_violations", column: "candidate_id" },
  { table: "assessment_sessions", column: "candidate_id" },
  { table: "assessment_attempts", column: "candidate_id" },
  { table: "interviews", column: "candidate_id" },
  { table: "resume_processing_logs", column: "candidate_id" },
];

async function main() {
  const opts = parseOptions(process.argv.slice(2));

  console.log("═".repeat(72));
  console.log("REJECTED CANDIDATE PURGE");
  console.log("═".repeat(72));
  console.log(`Mode              : ${opts.confirmed ? "APPROVED — WILL DELETE" : "DRY RUN — nothing will be deleted"}`);
  console.log(`Retention window  : ${opts.retentionDays} day(s)`);
  console.log(`Tenant scope      : ${opts.tenantId || "all tenants"}`);
  console.log("");

  const client = await pool.connect();
  try {
    // Eligibility: rejected, and rejected long enough ago. We date the rejection
    // from the most recent rejection activity log, falling back to created_at.
    const params: any[] = [opts.retentionDays];
    let tenantFilter = "";
    if (opts.tenantId) {
      params.push(opts.tenantId);
      tenantFilter = `AND c.tenant_id = $${params.length}`;
    }

    const eligibleRes = await client.query(
      `SELECT c.id, c.name, c.email, c.tenant_id, c.created_at,
              COALESCE(
                (SELECT MAX(a.logged_at) FROM candidate_activity_logs a
                  WHERE a.candidate_id = c.id
                    AND (a.event_type ILIKE '%reject%' OR a.message ILIKE '%reject%')),
                c.created_at
              ) AS rejected_at
         FROM candidates c
        WHERE LOWER(COALESCE(c.status, '')) = 'rejected'
          ${tenantFilter}
          AND COALESCE(
                (SELECT MAX(a.logged_at) FROM candidate_activity_logs a
                  WHERE a.candidate_id = c.id
                    AND (a.event_type ILIKE '%reject%' OR a.message ILIKE '%reject%')),
                c.created_at
              ) < (CURRENT_TIMESTAMP - ($1 || ' days')::interval)
        ORDER BY rejected_at ASC;`,
      params
    );

    const candidates = eligibleRes.rows;
    console.log(`Eligible rejected candidates: ${candidates.length}`);

    if (candidates.length === 0) {
      console.log("Nothing to purge. Exiting.");
      return;
    }

    for (const c of candidates.slice(0, 50)) {
      console.log(`  • ${c.id}  ${c.name || "(no name)"} <${c.email || "no email"}>  rejected ${new Date(c.rejected_at).toISOString().slice(0, 10)}`);
    }
    if (candidates.length > 50) {
      console.log(`  … and ${candidates.length - 50} more`);
    }

    // Always write a manifest so a purge is auditable and reversible-by-report.
    const manifestDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });
    const manifestPath = path.join(
      manifestDir,
      `rejected-purge-${opts.confirmed ? "executed" : "dryrun"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), options: opts, candidates }, null, 2),
      "utf-8"
    );
    console.log(`\nManifest written to: ${manifestPath}`);

    if (!opts.confirmed) {
      console.log("\nDRY RUN — no records were deleted.");
      console.log("To approve this purge, re-run with:");
      console.log("  CONFIRM_DESTRUCTIVE_ACTION=YES npx tsx src/scripts/purgeRejectedCandidates.ts --confirm");
      return;
    }

    const candidateIds = candidates.map(c => c.id);

    await client.query("BEGIN;");
    try {
      // Detach resume_inbox rows rather than deleting them: the inbox is the
      // ingestion audit trail and must survive candidate deletion.
      await client.query(
        `UPDATE resume_inbox SET candidate_id = NULL WHERE candidate_id = ANY($1::text[]);`,
        [candidateIds]
      );

      await client.query(
        `DELETE FROM assessment_audit
          WHERE session_id IN (SELECT id FROM assessment_sessions WHERE candidate_id = ANY($1::text[]));`,
        [candidateIds]
      ).catch((e: any) => console.warn(`  (skipped assessment_audit: ${e.message})`));

      for (const { table, column } of CHILD_TABLES) {
        try {
          const res = await client.query(
            `DELETE FROM ${table} WHERE ${column} = ANY($1::text[]);`,
            [candidateIds]
          );
          if (res.rowCount) {
            console.log(`  deleted ${res.rowCount} row(s) from ${table}`);
          }
        } catch (e: any) {
          console.warn(`  (skipped ${table}: ${e.message})`);
        }
      }

      const finalRes = await client.query(
        `DELETE FROM candidates WHERE id = ANY($1::text[]);`,
        [candidateIds]
      );

      await client.query("COMMIT;");
      console.log(`\n✅ Purged ${finalRes.rowCount} rejected candidate record(s).`);
      console.log(`   Ingestion audit trail (resume_inbox) and storage audit logs were preserved.`);
    } catch (txErr) {
      await client.query("ROLLBACK;");
      throw txErr;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("🚨 Rejected candidate purge failed:", err);
  process.exit(1);
});
