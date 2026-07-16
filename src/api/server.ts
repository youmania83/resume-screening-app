// src/api/server.ts
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compressionPkg from "compression";
const compression = compressionPkg as any;
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
const { json, urlencoded } = bodyParser;
import authRouter from "./routes/authRouter.js";
import { authMiddleware } from "./middleware/authMiddleware.js";
import { cacheInvalidationMiddleware } from "../lib/cache.js";
import { csrfGuard } from "./middleware/security.js";
import resumeRouter from "./routes/resumeRouter.js";
import healthRouter from "./routes/healthRouter.js";
import scoreRouter from "./routes/scoreRouter.js";
import jobRouter from "./routes/jobRouter.js";
import rankingRouter from "./routes/rankingRouter.js";
import evaluateRouter from "./routes/evaluateRouter.js";
import candidateRouter from "./routes/candidateRouter.js";
import assessmentRouter from "./routes/assessmentRouter.js";
import interviewRouter from "./routes/interviewRouter.js";
import stageRouter from "./routes/stageRouter.js";
import dashboardRouter from "./routes/dashboardRouter.js";
import inboxRouter from "./routes/inboxRouter.js";
import candidatePortalRouter from "./routes/candidatePortalRouter.js";
import emailRouter from "./routes/emailRouter.js";
import calendarRouter from "./routes/calendarRouter.js";
import webhookRouter from "./routes/webhookRouter.js";
import kekaRouter from "../integrations/keka/routes/keka.routes.js";
import zohoRouter from "../integrations/zoho/routes/zoho.routes.js";
import supportTicketRouter from "./routes/supportTicketRouter.js";
import adminLogsRouter from "./routes/adminLogsRouter.js";
import metricsRouter, { metricsState } from "./routes/metricsRouter.js";
import { logger } from "../lib/logger.js";
import "../lib/initDb.js";
import cron from "node-cron";
import { Worker, Job } from "bullmq";
import { redisClient, isRedisConnected } from "./middleware/security.js";
import { connection } from "./queue.js";
import { parseAndEvalResume } from "../worker/resumeWorker.js";
dotenv.config();

async function runWithLock(lockKey: string, lockTtlSeconds: number, task: () => Promise<void>) {
  if (redisClient && isRedisConnected) {
    try {
      const acquired = await redisClient.set(lockKey, "locked", "EX", lockTtlSeconds, "NX");
      if (acquired !== "OK") {
        console.log(`🔒 [Cron Lock] Job '${lockKey}' already running or recently completed on another instance.`);
        return;
      }
    } catch (err: any) {
      console.warn(`⚠️ [Cron Lock] Redis locking error for ${lockKey}, running fallback:`, err.message);
    }
  }

  try {
    await task();
  } catch (err: any) {
    console.error(`🚨 [Cron Run] Error in job '${lockKey}':`, err);
  }
}


const app = express();

// Security headers (OWASP recommended)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for assessment portal
}));

// Response compression (gzip/deflate via battle-tested npm package)
app.use(compression({ threshold: 1024 }));

const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  "https://resume-screening-app-sage.vercel.app",
  "https://risonaitech.com",
  "https://www.risonaitech.com",
  "https://techsolengineers.com",
  "https://www.techsolengineers.com",
  "http://localhost:3000"
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or postman)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.includes(origin) || 
                      origin.endsWith(".vercel.app") || 
                      origin.endsWith("risonaitech.com") ||
                      origin.endsWith("techsolengineers.com");
                      
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use(cookieParser());
app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  metricsState.apiRequestsTotal++;
  const start = Date.now();
  res.on("finish", () => {
    // Skip logging logs, metrics or health check routes to avoid log pollution
    if (req.path.startsWith("/api/admin/logs") || req.path.startsWith("/api/metrics") || req.path === "/api/health") return;
    const duration = Date.now() - start;
    logger.info(`[HTTP] ${req.method} ${req.originalUrl || req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use(csrfGuard);

// Apply Auth Middleware Globally for API Scoping
app.use(authMiddleware);

// Apply cache invalidation for mutating requests
app.use(cacheInvalidationMiddleware);

app.use("/api/auth", authRouter);
app.use("/api/resumes", resumeRouter);
app.use("/api/health", healthRouter);
app.use("/api/score", scoreRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/evaluate", evaluateRouter);
app.use("/api/candidates", candidateRouter);
app.use("/api/assessment", assessmentRouter);
app.use("/api/interview", interviewRouter);
app.use("/api/stages", stageRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/inbox", inboxRouter);
app.use("/api/candidate-portal", candidatePortalRouter);
app.use("/api/email", emailRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/support-tickets", supportTicketRouter);
app.use("/api/admin/logs", adminLogsRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api", webhookRouter);
app.use("/api", kekaRouter);
app.use("/api", zohoRouter);

// 4. Global Express Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`🔥 Express Global Error caught on ${req.method} ${req.url}:`, err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
});

// Hourly cleanup job to prune expired refresh tokens from the database (Lock TTL = 30 minutes)
cron.schedule("0 * * * *", () => {
  runWithLock("cron:session-cleanup", 1800, async () => {
    try {
      const { queryGlobal } = await import("../lib/tenantDb.js");
      const result = await queryGlobal("DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP;");
      if (result.rowCount && result.rowCount > 0) {
        console.log(`🧹 [Session Cleanup] Pruned ${result.rowCount} expired refresh tokens.`);
      }
    } catch (err) {
      console.error("🚨 [Session Cleanup] Failed to prune expired refresh tokens:", err);
    }
  });
});

// Daily background job to prune orphaned files from the storage provider (Lock TTL = 12 hours)
cron.schedule("0 2 * * *", () => { // Run at 2 AM daily
  runWithLock("cron:storage-pruning", 43200, async () => {
    try {
      const { StoragePruningService } = await import("../services/StoragePruningService.js");
      console.log("🧹 [Storage Pruning] Daily background pruning job started...");
      const result = await StoragePruningService.pruneOrphanedFiles();
      console.log(`🧹 [Storage Pruning] Finished daily cleanup. Pruned ${result.deletedCount} files, freeing ${result.bytesFreed} bytes.`);
    } catch (err) {
      console.error("🚨 [Storage Pruning] Daily background pruning job failed:", err);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 AUTONOMOUS PIPELINE: Email Sync (every 5 minutes) + Inline Resume Worker
// ═══════════════════════════════════════════════════════════════════════════

// Email sync runs every 30 minutes for ingestion (Lock TTL = 28 min)
cron.schedule("*/30 * * * *", () => {
  runWithLock("cron:email-sync-all-tenants", 1700, async () => {
    try {
      const { queryGlobal } = await import("../lib/tenantDb.js");
      const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
      
      const tenantsRes = await queryGlobal(
        "SELECT id, email_config FROM tenants WHERE email_config IS NOT NULL;"
      );
      
      let totalIngested = 0;
      
      for (const tenant of tenantsRes.rows) {
        const tenantId = tenant.id;
        const config = tenant.email_config;
        const incomingSyncEnabled = config?.incomingSyncEnabled === true;
        const incomingProvider = config?.incomingProvider;
        
        if (incomingSyncEnabled && incomingProvider) {
          try {
            const count = await EmailSyncService.syncMailbox(tenantId, incomingProvider);
            if (count > 0) {
              console.log(`✉️ [Auto-Sync] Ingested ${count} item(s) for tenant ${tenantId} via ${incomingProvider}`);
            }
            totalIngested += count;
          } catch (err: any) {
            console.error(`🚨 [Auto-Sync] Failed for tenant ${tenantId}:`, err.message || err);
          }
        }
      }
      
      if (totalIngested > 0) {
        console.log(`✉️ [Auto-Sync] Cycle complete. Total ingested: ${totalIngested}`);
      }
    } catch (err) {
      console.error("🚨 [Auto-Sync] Email sync cycle failed:", err);
    }
  });
});

// Zoho Mail sync runs every 5 minutes if enabled (Lock TTL = 4 min)
// Uses OAuth2 API when credentials are available, falls back to IMAP with app password
cron.schedule("*/5 * * * *", () => {
  runWithLock("cron:zoho-mail-sync", 240, async () => {
    try {
      const { zohoConfig } = await import("../integrations/zoho/config/zoho.config.js");
      if (zohoConfig.enabled) {
        // Check if OAuth2 API credentials are available
        const hasOAuthCreds = !!zohoConfig.clientId && !!zohoConfig.clientSecret && !!zohoConfig.refreshToken;
        
        if (hasOAuthCreds) {
          // Use Zoho Mail REST API with OAuth2
          const { zohoMailService } = await import("../integrations/zoho/services/zohoMail.service.js");
          console.log("⏰ [Cron] Starting automatic Zoho Mail sync (OAuth2 API)...");
          const result = await zohoMailService.syncInbox();
          console.log(`✅ [Cron] Zoho Mail sync complete. Synced: ${result.syncedCandidatesCount}, Errors: ${result.errors.length}`);
        } else if (zohoConfig.smtpUser && zohoConfig.smtpPassword) {
          // Fallback: Use IMAP with SMTP/app password credentials
          const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
          const { queryGlobal } = await import("../lib/tenantDb.js");
          
          console.log("⏰ [Cron] Starting automatic Zoho Mail sync (IMAP fallback — no OAuth2 credentials)...");
          
          // Find all tenants that use Zoho
          const tenantsRes = await queryGlobal(
            "SELECT id, email_config FROM tenants WHERE email_config IS NOT NULL;"
          );
          
          let totalSynced = 0;
          for (const tenant of tenantsRes.rows) {
            try {
              const count = await EmailSyncService.syncMailbox(tenant.id, "zoho");
              totalSynced += count;
              if (count > 0) {
                console.log(`✉️ [Cron IMAP] Ingested ${count} item(s) for tenant ${tenant.id} via Zoho IMAP`);
              }
            } catch (tenantErr: any) {
              console.error(`🚨 [Cron IMAP] Tenant ${tenant.id} sync failed:`, tenantErr.message || tenantErr);
            }
          }
          
          console.log(`✅ [Cron] Zoho Mail IMAP sync complete. Total ingested: ${totalSynced}`);
        } else {
          console.warn("⚠️ [Cron] Zoho Mail is enabled but no credentials (OAuth2 or SMTP) are configured. Skipping sync.");
        }
      }
    } catch (err: any) {
      console.error("🚨 [Cron] Zoho Mail sync failed:", err.message || err);
    }
  });
});// Techsol Engineers Keka Careers active jobs sync runs every 3 hours (Lock TTL = 1 hour)
cron.schedule("0 */3 * * *", () => {
  runWithLock("cron:keka-careers-active-sync", 3600, async () => {
    try {
      const { KekaCareersSyncService } = await import("../services/KekaCareersSyncService.js");
      console.log("⏰ [Cron] Starting Keka Careers active jobs sync...");
      const result = await KekaCareersSyncService.syncActiveJobs();
      console.log(`✅ [Cron] Keka Careers sync complete. Synced: ${result.syncedCount}, Errors: ${result.errors.length}`);
    } catch (err: any) {
      console.error("🚨 [Cron] Keka Careers sync failed:", err.message || err);
    }
  });
});

// Trigger initial sync at startup
setTimeout(async () => {
  try {
    const { KekaCareersSyncService } = await import("../services/KekaCareersSyncService.js");
    console.log("⏰ [Startup] Triggering initial Keka Careers active jobs sync...");
    const result = await KekaCareersSyncService.syncActiveJobs();
    console.log(`✅ [Startup] Initial Keka Careers sync complete. Synced: ${result.syncedCount}, Errors: ${result.errors.length}`);
  } catch (err: any) {
    console.error("🚨 [Startup] Initial Keka Careers sync failed:", err.message || err);
  }
}, 5000);

// Trigger initial Zoho Mail IMAP sync at startup (10s delay to let DB connections settle)
setTimeout(async () => {
  try {
    const zohoEnabled = process.env.ZOHO_MAIL_ENABLED === "true";
    const smtpUser = process.env.ZOHO_SMTP_USER;
    const smtpPass = process.env.ZOHO_SMTP_PASSWORD;
    
    if (zohoEnabled && smtpUser && smtpPass) {
      const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
      const { queryGlobal } = await import("../lib/tenantDb.js");
      
      console.log("📥 [Startup] Triggering initial Zoho Mail inbox sync (IMAP)...");
      
      const tenantsRes = await queryGlobal(
        "SELECT id FROM tenants WHERE email_config IS NOT NULL LIMIT 10;"
      );
      
      let totalSynced = 0;
      for (const tenant of tenantsRes.rows) {
        try {
          const count = await EmailSyncService.syncMailbox(tenant.id, "zoho");
          totalSynced += count;
        } catch (tenantErr: any) {
          console.error(`🚨 [Startup IMAP] Tenant ${tenant.id} sync failed:`, tenantErr.message || tenantErr);
        }
      }
      
      console.log(`✅ [Startup] Initial Zoho Mail IMAP sync complete. Total ingested: ${totalSynced}`);
    }
  } catch (err: any) {
    console.error("🚨 [Startup] Initial Zoho Mail sync failed:", err.message || err);
  }
}, 10000);

// Boot inline BullMQ Resume Worker — processes queue items automatically
try {
  const inlineResumeWorker = new Worker(
    "resume-eval-queue",
    async (job: Job) => {
      const { tenantId, inboxId, filePath, mimeType, jobId: targetJobId } = job.data as {
        tenantId: string;
        inboxId: string;
        filePath: string;
        mimeType: string;
        jobId?: string;
      };
      console.log(`🤖 [Pipeline Worker] Processing inbox ${inboxId} for tenant ${tenantId}...`);
      await parseAndEvalResume(tenantId, inboxId, filePath, mimeType, targetJobId);
      console.log(`✅ [Pipeline Worker] Finished processing inbox ${inboxId}`);
    },
    { connection }
  );

  inlineResumeWorker.on("failed", (job, err) => {
    console.error(`❌ [Pipeline Worker] Job ${job?.id} failed:`, err);
  });

  inlineResumeWorker.on("error", (err) => {
    console.error("🚨 [Pipeline Worker] Connection/Runtime error:", err.message || err);
  });

  console.log("🤖 [Autonomous Pipeline] Inline Resume Worker booted — listening on BullMQ queue 'resume-eval-queue'");
} catch (workerErr) {
  console.error("🚨 [Autonomous Pipeline] Failed to boot inline resume worker:", workerErr);
}

console.log("\n" + "═".repeat(70));
console.log("🤖 AUTONOMOUS RECRUITMENT PIPELINE ACTIVE");
console.log("   📧 Email Sync: Every 5 minutes (all tenants)");
console.log("   📄 Resume Parse + AI Score: Automatic via BullMQ worker");
console.log("   🧪 Assessment: Auto-generated MCQs via DeepSeek API");
console.log("   📊 Scoring: Resume×40% + Assessment×60%");
console.log("   📧 HR Interview: Auto-scheduled for score ≥ 80%");
console.log("═".repeat(70) + "\n");

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server listening on http://0.0.0.0:${PORT}`);
});

// 5. Node Process Crash-Guards for Asynchronous Background Workflows
process.on("unhandledRejection", (reason: any) => {
  logger.error("🚨 Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error: Error) => {
  logger.error("🚨 Uncaught Exception thrown in backend process:", error);
  // Node.js is in an undefined state after uncaught exceptions — must exit
  process.exit(1);
});

export default app;
