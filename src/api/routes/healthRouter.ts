// src/api/routes/healthRouter.ts
import { Router } from "express";
import { IngestQueue } from "../../lib/queue/ingestQueue.js";
import { StoragePruningService } from "../../services/StoragePruningService.js";
import { queryGlobal } from "../../lib/tenantDb.js";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { StorageManager } from "../../lib/storage/StorageProvider.js";
import nodemailer from "nodemailer";

import { isRedisConnected } from "../middleware/security.js";
import fs from "fs";

const router = Router();

// Basic health check (public)
router.get("/", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Liveness probe (public) - verify the node process is alive and responsive
router.get("/liveness", (req, res) => {
  res.json({ status: "alive", timestamp: Date.now() });
});

// Temporary diagnostic endpoint to export MCQ details of specific candidates from VPS database
router.get("/export-data", async (req, res) => {
  const token = req.query.token;
  if (token !== "antigravity-secret-12345-vps-export") {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const candidatesRes = await queryGlobal(`
      SELECT 
        c.id as candidate_id,
        c.name as candidate_name,
        c.email as candidate_email,
        c.role as candidate_role,
        c.status as candidate_status,
        c.final_score as candidate_final_score,
        c.violation_count as candidate_violation_count,
        c.assessment_completed_at as candidate_completed_at,
        a.id as attempt_id,
        a.assessment_id as assessment_id,
        a.score as attempt_score,
        a.correct_answers as attempt_correct_answers,
        a.incorrect_answers as attempt_incorrect_answers,
        a.time_taken as attempt_time_taken,
        a.started_at as attempt_started_at,
        a.completed_at as attempt_completed_at,
        a.current_answers as attempt_current_answers
      FROM candidates c
      LEFT JOIN assessment_attempts a ON c.id = a.candidate_id
      WHERE c.email IN ('darshanjgowdaa@gmail.com', 'vanirameshbabu09@gmail.com')
    `);

    const candidates = candidatesRes.rows;
    const assessmentIds = Array.from(new Set(candidates.map((c: any) => c.assessment_id).filter(Boolean)));

    let questions: any[] = [];
    if (assessmentIds.length > 0) {
      const questionsRes = await queryGlobal(`
        SELECT id, assessment_id, question_text, options, correct_answer, topic, difficulty 
        FROM assessment_questions 
        WHERE assessment_id = ANY($1)
      `, [assessmentIds]);
      questions = questionsRes.rows;
    }

    let violations: any[] = [];
    const attemptIds = Array.from(new Set(candidates.map((c: any) => c.attempt_id).filter(Boolean)));
    if (attemptIds.length > 0) {
      const violationsRes = await queryGlobal(`
        SELECT id, candidate_id, attempt_id, violation_type, details, logged_at 
        FROM assessment_violations 
        WHERE attempt_id = ANY($1)
      `, [attemptIds]);
      violations = violationsRes.rows;
    }

    res.json({
      success: true,
      candidates,
      questions,
      violations
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Readiness probe (public) - checks database, redis, and system dependencies
router.get("/readiness", async (req, res) => {
  const checks: any = {
    database: "offline",
    redis: "offline",
    disk: "unknown",
    memory: "unknown",
    bullmq: "offline",
    smtp: "offline",
    storage: "unknown"
  };
  let isReady = true;

  // 1. Check Database
  try {
    const start = Date.now();
    await queryGlobal("SELECT 1;");
    checks.database = `online (${Date.now() - start}ms)`;
  } catch (err: any) {
    checks.database = `error: ${err.message || err}`;
    isReady = false;
  }

  // 2. Check Redis
  if (isRedisConnected) {
    checks.redis = "online";
  } else {
    checks.redis = "offline";
    isReady = false;
  }

  // 3. Check Disk Space
  try {
    const stats = fs.statfsSync(process.cwd());
    const freeSpaceGb = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);
    checks.disk = `${freeSpaceGb.toFixed(2)} GB free`;
    if (freeSpaceGb < 1) { // Alert if less than 1GB free
      checks.disk = `WARNING: low disk space (${checks.disk})`;
    }
  } catch (err: any) {
    checks.disk = `error: ${err.message || err}`;
  }

  // 4. Check Memory Usage
  try {
    const memUsage = process.memoryUsage();
    checks.memory = `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB heap used`;
  } catch (err: any) {
    checks.memory = `error: ${err.message || err}`;
  }

  // 5. Check BullMQ
  try {
    const stats = await IngestQueue.getQueueStats();
    checks.bullmq = stats.isRedisConnected ? "online" : "offline";
  } catch (err: any) {
    checks.bullmq = `error: ${err.message || err}`;
  }

  // 6. Check SMTP
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    checks.smtp = "configured";
  } else {
    checks.smtp = "unconfigured";
  }

  // 7. Check Storage Manager
  try {
    const provider = StorageManager.getProvider();
    checks.storage = `configured (${process.env.STORAGE_PROVIDER || "local"})`;
  } catch (err: any) {
    checks.storage = `error: ${err.message || err}`;
  }

  if (isReady) {
    res.json({
      success: true,
      status: "ready",
      checks,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(503).json({
      success: false,
      status: "not_ready",
      checks,
      timestamp: new Date().toISOString()
    });
  }
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
          timeout: 2000, // fast verification
          family: 4 // Force IPv4 connection to prevent IPv6 network unreachable errors
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
