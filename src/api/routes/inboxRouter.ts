import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { queryTenant, queryGlobal } from "../../lib/tenantDb.js";
import { IngestQueue } from "../../lib/queue/ingestQueue.js";
import { EmailSyncService } from "../../integrations/email/EmailSyncService.js";

const router = Router();

// GET /api/inbox - Fetch paginated and filtered list of inbox items
router.get("/", async (req: any, res: any, next: any) => {
  try {
    const status = req.query.status as string;
    const search = req.query.search as string;
    const uploadDate = req.query.uploadDate as string;
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = Math.min(parseInt(req.query.limit as string || "20", 10), 50);
    const offset = (page - 1) * limit;

    let sql = `
      SELECT ri.*, c.name as candidate_name, c.email as candidate_email
      FROM resume_inbox ri
      LEFT JOIN candidates c ON ri.candidate_id = c.id
      WHERE ri.tenant_id = :tenant_id
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      sql += ` AND ri.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (ri.file_name ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
    }

    if (uploadDate) {
      params.push(uploadDate);
      sql += ` AND ri.created_at::date = $${params.length}::date`;
    }

    // Get count for pagination
    const countSql = `SELECT COUNT(*) FROM (${sql}) AS count_query`;
    const countRes = await queryTenant(countSql, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Apply sorting & pagination
    sql += ` ORDER BY ri.created_at DESC LIMIT ${limit} OFFSET ${offset};`;
    const dataRes = await queryTenant(sql, params);

    res.json({
      success: true,
      data: dataRes.rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inbox/purge-junk - Purge non-resume junk documents
router.get("/purge-junk", async (req: any, res: any, next: any) => {
  try {
    const tenantId = req.headers["x-tenant-id"] || "default-tenant";
    const resInbox = await queryGlobal("SELECT id, candidate_id, file_name FROM resume_inbox WHERE tenant_id = $1;", [tenantId]);
    
    const BLACKLIST_KEYWORDS = [
      "payslip", "pay slip", "pay_slip", "salary",
      "challan", "ecr", "gst", "tax", "audit", "balance",
      "ticket", "boarding", "flight", "booking", "travel", "paid",
      "invoice", "receipt", "bill", "payment", "transaction", "voucher", "statement", "ledger", "wallet", "bank", "account details",
      "scan", "mri", "xray", "medical", "prescription",
      "tender", "agreement", "contract", "proposal",
      "issue", "incident", "log", "report", "reports",
      "program", "training", "certificate", "course"
    ];

    const junkInboxIds: string[] = [];
    const junkCandidateIds: string[] = [];
    const deletedFiles: string[] = [];

    for (const row of resInbox.rows) {
      const fileName = (row.file_name || "").toLowerCase();
      let isJunk = false;
      for (const keyword of BLACKLIST_KEYWORDS) {
        if (fileName.includes(keyword)) {
          isJunk = true;
          break;
        }
      }
      if (fileName.includes(" to ")) {
        isJunk = true;
      }

      if (isJunk) {
        junkInboxIds.push(row.id);
        deletedFiles.push(row.file_name);
        if (row.candidate_id) {
          junkCandidateIds.push(row.candidate_id);
        }
      }
    }

    if (junkInboxIds.length === 0) {
      return res.json({ success: true, message: "No junk files found to purge." });
    }

    if (junkCandidateIds.length > 0) {
      await queryGlobal("DELETE FROM candidate_activity_logs WHERE candidate_id = ANY($1);", [junkCandidateIds]);
      await queryGlobal("DELETE FROM candidates WHERE id = ANY($1);", [junkCandidateIds]);
    }
    await queryGlobal("DELETE FROM resume_inbox WHERE id = ANY($1);", [junkInboxIds]);

    return res.json({
      success: true,
      message: `Successfully purged ${junkInboxIds.length} junk documents.`,
      purgedFiles: deletedFiles
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inbox/stats - Fetch inbox queue SLA and storage metrics
router.get("/stats", async (req: any, res: any, next: any) => {
  try {
    const queueStats = await queryTenant(`
      SELECT 
        COUNT(CASE WHEN status = 'Queued' THEN 1 END) as queued,
        COUNT(CASE WHEN status = 'Processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'Parsed' THEN 1 END) as parsed,
        COUNT(CASE WHEN status = 'Matched' THEN 1 END) as matched,
        COUNT(CASE WHEN status = 'Needs Review' THEN 1 END) as needs_review,
        COUNT(CASE WHEN status = 'Duplicate' THEN 1 END) as duplicate,
        COUNT(CASE WHEN status = 'Failed' THEN 1 END) as failed
      FROM resume_inbox
      WHERE tenant_id = :tenant_id;
    `);

    const slaStats = await queryTenant(`
      SELECT step, ROUND(AVG(duration_ms)) as avg_duration_ms
      FROM resume_processing_logs
      WHERE tenant_id = :tenant_id
      GROUP BY step;
    `);

    // Storage cost controls
    const baseDir = path.resolve("uploads");
    let totalFiles = 0;
    let totalStorageUsed = 0;
    let tenantFiles = 0;
    let tenantStorageUsed = 0;

    const tenantId = req.headers["x-tenant-id"] || "default-tenant";

    if (fs.existsSync(baseDir)) {
      const tenants = fs.readdirSync(baseDir);
      for (const tenant of tenants) {
        const tenantPath = path.join(baseDir, tenant);
        if (fs.statSync(tenantPath).isDirectory()) {
          const files = fs.readdirSync(tenantPath);
          for (const file of files) {
            const fPath = path.join(tenantPath, file);
            if (fs.statSync(fPath).isFile()) {
              const size = fs.statSync(fPath).size;
              totalFiles++;
              totalStorageUsed += size;
              if (tenant === tenantId) {
                tenantFiles++;
                tenantStorageUsed += size;
              }
            }
          }
        }
      }
    }

    res.json({
      success: true,
      counts: queueStats.rows[0],
      sla: slaStats.rows,
      storage: {
        totalFiles,
        totalStorageUsedBytes: totalStorageUsed,
        tenantFiles,
        tenantStorageUsedBytes: tenantStorageUsed
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/merge - Merge duplicate candidate
router.post("/merge", async (req: any, res: any, next: any) => {
  try {
    const { primaryCandidateId, duplicateCandidateId, reason } = req.body;
    if (!primaryCandidateId || !duplicateCandidateId) {
       res.status(400).json({ error: "primaryCandidateId and duplicateCandidateId are required" });
       return;
    }

    const userId = req.user?.id || null;

    // 1. Move notes
    await queryTenant(
      "UPDATE candidate_notes SET candidate_id = $1 WHERE candidate_id = $2 AND tenant_id = :tenant_id;",
      [primaryCandidateId, duplicateCandidateId]
    );

    // 2. Move documents
    await queryTenant(
      "UPDATE candidate_documents SET candidate_id = $1 WHERE candidate_id = $2 AND tenant_id = :tenant_id;",
      [primaryCandidateId, duplicateCandidateId]
    );

    // 3. Move timeline
    await queryTenant(
      "UPDATE candidate_timeline SET candidate_id = $1 WHERE candidate_id = $2 AND tenant_id = :tenant_id;",
      [primaryCandidateId, duplicateCandidateId]
    );

    // 4. Move submissions
    await queryTenant(
      "UPDATE client_submissions SET candidate_id = $1 WHERE candidate_id = $2 AND tenant_id = :tenant_id;",
      [primaryCandidateId, duplicateCandidateId]
    );

    // 5. Move interviews
    await queryTenant(
      "UPDATE interviews SET candidate_id = $1 WHERE candidate_id = $2 AND tenant_id = :tenant_id;",
      [primaryCandidateId, duplicateCandidateId]
    );

    // 6. Handle Job Matches conflict
    await queryTenant(
      `INSERT INTO candidate_job_matches (tenant_id, candidate_id, job_id, match_score, matched_skills, missing_skills, strengths, concerns, recommendation_reason)
       SELECT tenant_id, $1, job_id, match_score, matched_skills, missing_skills, strengths, concerns, recommendation_reason
       FROM candidate_job_matches WHERE candidate_id = $2 AND tenant_id = :tenant_id
       ON CONFLICT (candidate_id, job_id) DO NOTHING;`,
      [primaryCandidateId, duplicateCandidateId]
    );
    await queryTenant("DELETE FROM candidate_job_matches WHERE candidate_id = $1 AND tenant_id = :tenant_id;", [duplicateCandidateId]);

    // 7. Insert merge history
    await queryTenant(
      `INSERT INTO candidate_merge_history (id, tenant_id, primary_candidate_id, merged_candidate_id, merged_by, merge_reason)
       VALUES ($1, :tenant_id, $2, $3, $4, $5);`,
      [crypto.randomUUID(), primaryCandidateId, duplicateCandidateId, userId, reason || "Manual merge resolution"]
    );

    // 8. Delete duplicate candidate & duplicate relationships
    await queryTenant("DELETE FROM duplicate_candidates WHERE (candidate_id = $1 OR duplicate_candidate_id = $1) AND tenant_id = :tenant_id;", [duplicateCandidateId]);
    await queryTenant("DELETE FROM candidates WHERE id = $1 AND tenant_id = :tenant_id;", [duplicateCandidateId]);

    // 9. Update Inbox item to point to primary candidate
    await queryTenant(
      "UPDATE resume_inbox SET candidate_id = $1, status = 'Matched' WHERE candidate_id = $2 AND tenant_id = :tenant_id;",
      [primaryCandidateId, duplicateCandidateId]
    );

    res.json({ success: true, message: "Candidates merged successfully with zero data loss." });
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/retry/:id - Re-enqueue a failed/stuck parsing job
router.post("/retry/:id", async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const itemRes = await queryTenant("SELECT * FROM resume_inbox WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;", [id]);
    if (itemRes.rowCount === 0) {
       res.status(404).json({ error: "Inbox item not found." });
       return;
    }

    const item = itemRes.rows[0];
    const ext = path.extname(item.file_name).toLowerCase();
    const tempPath = path.resolve("uploads", `${id}${ext}`);

    await queryTenant("UPDATE resume_inbox SET status = 'Queued', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1;", [id]);
    
    const tenantId = req.headers["x-tenant-id"] || "default-tenant";
    await IngestQueue.enqueue(tenantId, id, tempPath, "application/octet-stream");

    res.json({ success: true, message: "Job successfully re-queued for processing." });
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/delete/:id - Delete an inbox record and its temp file
router.post("/delete/:id", async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const itemRes = await queryTenant("SELECT * FROM resume_inbox WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;", [id]);
    if (itemRes.rowCount === 0) {
       res.status(404).json({ error: "Inbox item not found." });
       return;
    }

    const item = itemRes.rows[0];
    await queryTenant("DELETE FROM resume_inbox WHERE id = $1 AND tenant_id = :tenant_id;", [id]);

    const ext = path.extname(item.file_name).toLowerCase();
    const tempPath = path.resolve("uploads", `${id}${ext}`);
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (err) {
        console.warn("Could not delete temp file:", err);
      }
    }

    res.json({ success: true, message: "Inbox item deleted successfully." });
  } catch (err) {
    next(err);
  }
});

// GET /api/inbox/email-health - Retrieve email sync health and status
router.get("/email-health", async (_req: any, res: any, next: any) => {
  try {
    const health = EmailSyncService.getHealthStatus();
    res.json({ success: true, health });
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/email-sync - Manually trigger an email ingestion sync
router.post("/email-sync", async (req: any, res: any, next: any) => {
  try {
    const tenantId = req.headers["x-tenant-id"] || "default-tenant";
    let provider = req.body.provider;
    if (!provider) {
      const tenantRes = await queryGlobal(
        "SELECT email_config FROM tenants WHERE id = $1 LIMIT 1;",
        [tenantId]
      );
      const emailConfig = tenantRes.rows[0]?.email_config || {};
      provider = emailConfig.incomingProvider || "mock";
    }
    const ingestedCount = await EmailSyncService.syncMailbox(tenantId, provider);
    res.json({ success: true, message: `Email sync complete. Ingested ${ingestedCount} resumes.`, ingestedCount });
  } catch (err) {
    next(err);
  }
});

// GET /api/inbox/scoring-weights - Retrieve current tenant weights
router.get("/scoring-weights", async (_req: any, res: any, next: any) => {
  try {
    const weightsRes = await queryTenant("SELECT scoring_weights FROM tenants WHERE id = :tenant_id LIMIT 1;");
    res.json({ success: true, weights: weightsRes.rows[0]?.scoring_weights });
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/scoring-weights - Update current tenant weights
router.post("/scoring-weights", async (req: any, res: any, next: any) => {
  try {
    const { weights } = req.body;
    if (!weights) {
       res.status(400).json({ error: "Weights object is required" });
       return;
    }
    await queryTenant("UPDATE tenants SET scoring_weights = $1 WHERE id = :tenant_id;", [JSON.stringify(weights)]);
    res.json({ success: true, message: "Scoring weights updated successfully." });
  } catch (err) {
    next(err);
  }
});

export default router;
