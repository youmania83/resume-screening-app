// src/api/routes/healthRouter.ts
import { Router } from "express";
import { IngestQueue } from "../../lib/queue/ingestQueue.js";
import { StoragePruningService } from "../../services/StoragePruningService.js";
import { queryGlobal } from "../../lib/tenantDb.js";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { StorageManager } from "../../lib/storage/StorageProvider.js";
import nodemailer from "nodemailer";

const router = Router();

// Basic health check (public)
router.get("/", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Admin-only Platform Health Diagnostics
router.get("/diagnostics", authMiddleware, requireRole(["owner"]), async (req, res) => {
  try {
    // 1. Queue statistics
    const queueStats = await IngestQueue.getQueueStats();

    // 2. DLQ and Failed jobs count from resume_inbox
    const dlqRes = await queryGlobal(`
      SELECT COUNT(*) as count FROM resume_inbox WHERE status = 'Failed';
    `);
    const dlqCount = parseInt(dlqRes.rows[0].count || "0", 10);

    // 3. Redis connectivity
    const redisStatus = queueStats.isRedisConnected ? "connected" : "disconnected";

    // 4. Email provider status
    let emailStatus = "unconfigured";
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          timeout: 2000 // fast verification
        } as any);
        await transporter.verify();
        emailStatus = "connected";
      } catch (err: any) {
        emailStatus = `failed: ${err.message || err}`;
      }
    }

    // 5. Storage stats (total files and usage)
    const storageProvider = StorageManager.getProvider();
    const files = await storageProvider.listAllFiles();
    const storageUsage = files.reduce((acc, f) => acc + f.sizeBytes, 0);
    const storageFilesCount = files.length;

    // 6. Active tenants
    const tenantsRes = await queryGlobal("SELECT COUNT(*) as count FROM tenants;");
    const activeTenants = parseInt(tenantsRes.rows[0].count || "0", 10);

    // 7. Average Parse/Processing Time
    const avgTimeRes = await queryGlobal(`
      SELECT AVG(duration_ms) as avg_time 
      FROM resume_processing_logs 
      WHERE step = 'Parsing' AND status = 'Success';
    `);
    const avgParseTime = Math.round(parseFloat(avgTimeRes.rows[0].avg_time || "0"));

    res.json({
      success: true,
      data: {
        queue: {
          provider: queueStats.provider,
          depth: queueStats.queued,
          active: queueStats.active,
          completed: queueStats.completed,
          failed: queueStats.failed,
          dlqCount
        },
        redis: {
          status: redisStatus
        },
        email: {
          status: emailStatus,
          provider: process.env.SMTP_HOST || "Local log fallback"
        },
        storage: {
          provider: process.env.STORAGE_PROVIDER || "local",
          totalBytes: storageUsage,
          filesCount: storageFilesCount
        },
        tenants: {
          activeCount: activeTenants
        },
        metrics: {
          averageParseTimeMs: avgParseTime || 120 // fallback default
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error("Health diagnostics failed:", error);
    res.status(500).json({ success: false, error: error.message || "Internal diagnostics error" });
  }
});

// Admin-only Storage Pruning trigger
router.post("/prune-storage", authMiddleware, requireRole(["owner"]), async (req, res) => {
  try {
    console.log(`[Storage Pruning] Manual trigger initiated by user ${req.user?.userId}...`);
    const results = await StoragePruningService.pruneOrphanedFiles();
    res.json({
      success: true,
      message: "Storage pruning completed successfully",
      ...results
    });
  } catch (error: any) {
    console.error("Storage pruning failed:", error);
    res.status(500).json({ success: false, error: error.message || "Storage pruning execution failed" });
  }
});

export default router;
