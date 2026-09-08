// src/api/routes/adminLogsRouter.ts
import { Router } from "express";
import fs from "fs";
import path from "path";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { logger } from "../../lib/logger.js";
import { queryGlobal } from "../../lib/tenantDb.js";

const router = Router();
const LOGS_DIR = path.join(process.cwd(), "logs");

router.get("/", authMiddleware, requireRole(["owner"]), async (req, res) => {
  try {
    const level = (req.query.level as string) || "error";
    const requestedLines = parseInt((req.query.lines as string) || "100", 10);
    const linesCount = Math.min(Math.max(requestedLines, 1), 500);

    const logFile = level === "combined" ? "combined.log" : "error.log";
    const filePath = path.join(LOGS_DIR, logFile);

    if (!fs.existsSync(filePath)) {
      res.json({
        success: true,
        data: {
          file: logFile,
          lines: [],
          count: 0
        }
      });
      return;
    }

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    if (fileSize === 0) {
      res.json({
        success: true,
        data: {
          file: logFile,
          lines: [],
          count: 0
        }
      });
      return;
    }

    // Read the last 128KB of the log file
    const bufferSize = Math.min(fileSize, 128 * 1024);
    const buffer = Buffer.alloc(bufferSize);
    
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, bufferSize, fileSize - bufferSize);
    fs.closeSync(fd);

    const logContent = buffer.toString("utf8");
    const allLines = logContent.split("\n").filter(line => line.trim() !== "");
    const lastLines = allLines.slice(-linesCount);

    res.json({
      success: true,
      data: {
        file: logFile,
        lines: lastLines,
        count: lastLines.length
      }
    });
  } catch (error: any) {
    logger.error("Failed to retrieve admin logs", error);
    res.status(500).json({ success: false, error: error.message || "Failed to fetch logs" });
  }
});

// POST /api/admin/logs/cleanup-mock-jobs
// Closes all mock/fake jobs created by MockEmailProvider and unlinks real
// candidates who were incorrectly assigned to those jobs.
// Secured: owner role only.
router.post("/cleanup-mock-jobs", authMiddleware, requireRole(["owner"]), async (_req, res) => {
  try {
    const MOCK_TITLES = ["React Architect", "Python / AI Engineer", "Python Developer", "Product Manager"];

    // 1. Find all mock jobs
    const findRes = await queryGlobal(`
      SELECT id, title, location, source_system, external_id, status
      FROM jobs
      WHERE
        external_id LIKE 'mock-email-%'
        OR source_system = 'mock'
        OR (
          title = ANY($1)
          AND (source_system = 'Email' OR external_id LIKE 'mock-%' OR location = 'New York City')
        )
    `, [MOCK_TITLES]);

    const mockJobs = findRes.rows;
    if (mockJobs.length === 0) {
      res.json({ success: true, message: "No mock jobs found. Database is already clean.", mockJobsClosed: 0, candidatesUnlinked: 0 });
      return;
    }

    const mockJobIds = mockJobs.map((j: any) => j.id);

    // 2. Find and unlink affected candidates
    const candidatesRes = await queryGlobal(`
      SELECT id, name, email, job_id FROM candidates WHERE job_id = ANY($1)
    `, [mockJobIds]);
    const affectedCount = candidatesRes.rowCount ?? 0;

    if (affectedCount > 0) {
      await queryGlobal(`
        UPDATE candidates
        SET
          job_id                  = NULL,
          status                  = 'applied',
          assessment_token        = NULL,
          assessment_token_expiry = NULL,
          assessment_invited_at   = NULL,
          assessment_status       = NULL
        WHERE job_id = ANY($1)
      `, [mockJobIds]);
    }

    // 3. Remove stale match records
    const matchClean = await queryGlobal(`DELETE FROM candidate_job_matches WHERE job_id = ANY($1)`, [mockJobIds]);

    // 4. Close the mock jobs (soft delete)
    await queryGlobal(`
      UPDATE jobs
      SET status = 'closed', sync_status = 'removed', last_synced_at = NOW()
      WHERE id = ANY($1)
    `, [mockJobIds]);

    const details = mockJobs.map((j: any) => ({ id: j.id, title: j.title, source: j.source_system, external_id: j.external_id }));
    const affectedCandidates = candidatesRes.rows.map((c: any) => ({ id: c.id, name: c.name, email: c.email }));

    console.log(`🧹 [Admin Cleanup] Closed ${mockJobs.length} mock job(s), unlinked ${affectedCount} candidate(s).`);

    res.json({
      success: true,
      message: `Cleanup complete. ${mockJobs.length} mock job(s) closed. ${affectedCount} candidate(s) unlinked and reset to 'applied'.`,
      mockJobsClosed: mockJobs.length,
      candidatesUnlinked: affectedCount,
      matchRecordsRemoved: matchClean.rowCount ?? 0,
      closedJobs: details,
      affectedCandidates
    });
  } catch (err: any) {
    logger.error("Mock job cleanup failed", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
