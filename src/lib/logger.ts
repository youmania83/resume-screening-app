// src/lib/logger.ts
import fs from "fs";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");

// Ensure logs directory exists
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
} catch (err) {
  console.error("Failed to create logs directory:", err);
}

const COMBINED_LOG_PATH = path.join(LOGS_DIR, "combined.log");
const ERROR_LOG_PATH = path.join(LOGS_DIR, "error.log");

function formatMessage(level: string, message: string, meta?: any): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | Metadata: ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

function writeLog(level: string, message: string, meta?: any) {
  const formatted = formatMessage(level, message, meta);

  // Write to combined log asynchronously
  fs.appendFile(COMBINED_LOG_PATH, formatted, (err) => {
    if (err) {
      console.error("Failed to write to combined log:", err);
    }
  });

  // Write to error log if level is ERROR
  if (level === "ERROR") {
    fs.appendFile(ERROR_LOG_PATH, formatted, (err) => {
      if (err) {
        console.error("Failed to write to error log:", err);
      }
    });
  }
}

export const logger = {
  info(message: string, meta?: any) {
    console.log(`[INFO] ${message}`, meta ? meta : "");
    writeLog("INFO", message, meta);
  },

  warn(message: string, meta?: any) {
    console.warn(`[WARN] ${message}`, meta ? meta : "");
    writeLog("WARN", message, meta);
  },

  error(message: string, error?: any) {
    let errorDetails = error;
    if (error instanceof Error) {
      errorDetails = {
        stack: error.stack,
        ...error,
        message: error.message
      };
    }
    
    console.error(`[ERROR] ${message}`, error ? error : "");
    writeLog("ERROR", message, errorDetails);
  }
};
