// src/api/routes/adminLogsRouter.ts
import { Router } from "express";
import fs from "fs";
import path from "path";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { logger } from "../../lib/logger.js";

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

export default router;
