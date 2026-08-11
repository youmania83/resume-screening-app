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
import { syncPipelineStages } from "../scripts/syncPipelineStages.js";
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
import { assertAppUrlConfigured, getAppUrl, getIngestionCutoffIso, ResumeParserBootCheck } from "../lib/serverBootChecks.js";
import { ASSESSMENT_REMINDER_DAYS, daysSinceInvite } from "../lib/appConfig.js";
dotenv.config();

// Fail loudly at boot on misconfiguration whose failure mode is otherwise silent
// (dead candidate links, fabricated AI data).
assertAppUrlConfigured();
ResumeParserBootCheck();
console.log(`🔗 [Config] Candidate-facing links will be built from: ${getAppUrl()}`);
console.log(`🗓️  [Config] Ingestion cutoff: ${getIngestionCutoffIso()} (older applications are ignored)`);

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

// Startup diagnostic: Log zero-score candidates (do NOT assign fake scores — let AI evaluate naturally)
setTimeout(async () => {
  try {
    const { queryGlobal } = await import("../lib/tenantDb.js");
    // Scoped to the ingestion cutoff: pre-cutoff legacy rows are retained but are
    // not re-processed, so they no longer skew this diagnostic or consume AI credits.
    const zeroScoreRes = await queryGlobal(
      `SELECT COUNT(*)::int as count FROM candidates
        WHERE (score = 0 OR score IS NULL)
          AND created_at >= $1::timestamptz;`,
      [getIngestionCutoffIso()]
    );
    const count = zeroScoreRes.rows[0]?.count || 0;
    if (count > 0) {
      console.log(`📊 [Startup] Found ${count} unscored candidates received since the cutoff. They will be evaluated in the next 30-min autonomous cycle.`);
    } else {
      console.log(`✅ [Startup] All candidates received since the cutoff have been AI-scored.`);
    }

    const { kekaCandidatesService } = await import("../integrations/keka/services/candidates.service.js");
    await kekaCandidatesService.screenUnscreenedCandidates();

    // Autonomous candidate job role remapping on startup
    const { AutonomousRecruitmentService } = await import("../services/AutonomousRecruitmentService.js");
    console.log("🤖 [Startup] Triggering initial autonomous candidate job matching and role remapping...");
    await AutonomousRecruitmentService.run30MinCycle();
  } catch (err) {
    console.error("🚨 [Startup] Candidate diagnostic check error:", err);
  }
}, 3000);


// Daily background job to send assessment reminders at 9:00 AM (Lock TTL = 12 hours)
cron.schedule("0 9 * * *", () => {
  runWithLock("cron:assessment-reminders", 43200, async () => {
    await processAssessmentReminders("Cron");
  });
});

async function processAssessmentReminders(tag: string = "Cron") {
  try {
    console.log(`⏰ [${tag}] Starting assessment reminders check...`);
    const { queryGlobal } = await import("../lib/tenantDb.js");
    const { sendAssessmentReminderEmail } = await import("../lib/email.js");

    // Remind only candidates who were actually invited, have not completed the
    // assessment, whose token is still valid, and whose job opening is still open.
    //
    // `assessment_reminder_sent_at` makes this exactly-once per candidate. The old
    // guard compared against an exact activity-log message string, so any change
    // to the wording silently re-enabled duplicate reminders.
    const candidatesRes = await queryGlobal(
      `SELECT c.id, c.name, c.email, c.assessment_token, c.assessment_token_expiry,
              c.assessment_invited_at, c.tenant_id,
              COALESCE(j.title, c.role) as job_title
       FROM candidates c
       JOIN jobs j ON c.job_id = j.id
         AND COALESCE(j.status, 'active') = 'active'
         AND j.sync_status IS DISTINCT FROM 'removed'
       WHERE LOWER(c.status) = 'shortlisted'
         AND COALESCE(c.assessment_status, 'pending') = 'pending'
         AND c.assessment_token IS NOT NULL
         AND c.assessment_invited_at IS NOT NULL
         AND c.assessment_reminder_sent_at IS NULL
         AND c.assessment_completed_at IS NULL
         AND c.assessment_token_expiry > CURRENT_TIMESTAMP
         AND c.created_at >= $1::timestamptz
         AND c.email IS NOT NULL AND c.email LIKE '%@%';`,
      [getIngestionCutoffIso()]
    );

    let remindersSent = 0;

    for (const candidate of candidatesRes.rows) {
      // Fire on the configured day(s) after the invitation was sent (default 3-4),
      // rather than counting backwards from the expiry date.
      const elapsedDay = daysSinceInvite(candidate.assessment_invited_at);
      if (!ASSESSMENT_REMINDER_DAYS.includes(elapsedDay)) {
        continue;
      }

      const expiryMs = new Date(candidate.assessment_token_expiry).getTime();
      const remainingDays = Math.max(1, Math.ceil((expiryMs - Date.now()) / 86400000));

      console.log(`✉️ [${tag}] Sending assessment reminder to ${candidate.email} (day ${elapsedDay} since invite, ${remainingDays} day(s) remaining)`);

      try {
        await sendAssessmentReminderEmail({
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          jobTitle: candidate.job_title,
          token: candidate.assessment_token,
          remainingDays,
          tenantId: candidate.tenant_id,
          candidateId: candidate.id
        } as any);

        // Stamp immediately so a later failure in this loop cannot cause a re-send.
        await queryGlobal(
          `UPDATE candidates SET assessment_reminder_sent_at = NOW() WHERE id = $1;`,
          [candidate.id]
        );

        await queryGlobal(
          `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
           VALUES ($1, 'assessment_reminder', $2, $3);`,
          [
            candidate.id,
            `Assessment reminder sent on day ${elapsedDay} after invitation (${remainingDays} day(s) remaining).`,
            candidate.tenant_id
          ]
        );

        remindersSent++;
      } catch (remErr: any) {
        console.error(`[${tag}] Failed to send reminder to ${candidate.email}:`, remErr.message || remErr);
      }
    }

    console.log(`✅ [${tag}] Assessment reminders check complete. Reminders sent: ${remindersSent}`);
  } catch (err: any) {
    console.error(`🚨 [${tag}] Assessment reminders job failed:`, err.message || err);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 🤖 AUTONOMOUS PIPELINE: 30-Minute Recurring Recruitment Sync
// ═══════════════════════════════════════════════════════════════════════════

// Autonomous Recruitment Sync runs every 30 minutes (Lock TTL = 28 min)
cron.schedule("*/30 * * * *", () => {
  runWithLock("cron:autonomous-30min-recruitment-sync", 1700, async () => {
    try {
      const { AutonomousRecruitmentService } = await import("../services/AutonomousRecruitmentService.js");
      console.log("⏰ [Cron] Starting 30-Minute Autonomous Recruitment Sync...");
      const result = await AutonomousRecruitmentService.run30MinCycle();
      console.log(`✅ [Cron] Autonomous 30-min sync complete. Ingested: ${result.ingested}, Screened: ${result.screened}, Assessment Invites: ${result.invited}, Promoted: ${result.promoted}`);
    } catch (err: any) {
      console.error("🚨 [Cron] Autonomous 30-min recruitment sync failed:", err.message || err);
    }
  });
});

// Zoho Mail sync runs automatically every 2 minutes (Lock TTL = 110s)
cron.schedule("*/2 * * * *", () => {
  runWithLock("cron:zoho-mail-sync", 110, async () => {
    try {
      const { zohoConfig } = await import("../integrations/zoho/config/zoho.config.js");
      const hasSmtpCreds = !!zohoConfig.smtpUser && !!zohoConfig.smtpPassword;
      const hasOAuthCreds = !!zohoConfig.clientId && !!zohoConfig.clientSecret && !!zohoConfig.refreshToken;
      
      if (hasOAuthCreds || hasSmtpCreds || zohoConfig.enabled) {
        if (hasOAuthCreds) {
          // Use Zoho Mail REST API with OAuth2
          const { zohoMailService } = await import("../integrations/zoho/services/zohoMail.service.js");
          console.log("⏰ [Cron] Starting automatic Zoho Mail sync (OAuth2 API)...");
          const result = await zohoMailService.syncInbox();
          console.log(`✅ [Cron] Zoho Mail sync complete. Synced: ${result.syncedCandidatesCount}, Errors: ${result.errors.length}`);
        } else if (hasSmtpCreds) {
          // Fallback: Use IMAP with SMTP/app password credentials
          const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
          
          console.log("⏰ [Cron] Starting automatic Zoho Mail sync (IMAP for hr@techsolengineers.com)...");
          
          // Run IMAP sync for the production tenant ONLY.
          // Running it for every tenant in the database would cause each email
          // to be processed N times (once per tenant), creating massive
          // duplicates in resume_inbox and candidates. The IMAP mailbox is
          // shared across the whole organisation — there is only ONE inbox.
          const productionTenantId = process.env.PRODUCTION_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
          
          try {
            const count = await EmailSyncService.syncMailbox(productionTenantId, "zoho");
            if (count > 0) {
              console.log(`✉️ [Cron IMAP] Ingested ${count} item(s) for production tenant via Zoho IMAP`);
            }
            console.log(`✅ [Cron] Zoho Mail IMAP sync complete. Total ingested: ${count}`);
          } catch (tenantErr: any) {
            console.error(`🚨 [Cron IMAP] Production tenant sync failed:`, tenantErr.message || tenantErr);
          }
        }
      }
    } catch (err: any) {
      console.error("🚨 [Cron] Automatic Zoho Mail sync failed:", err.message || err);
    }
  });
});// Techsol Engineers Keka Careers active jobs sync runs every 30 minutes (Lock TTL = 15 minutes)
cron.schedule("*/30 * * * *", () => {
  runWithLock("cron:keka-careers-active-sync", 900, async () => {
    try {
      const { KekaCareersSyncService } = await import("../services/KekaCareersSyncService.js");
      const { isKekaEnabled } = await import("../integrations/keka/config/keka.config.js");
      
      console.log("⏰ [Cron] Starting Keka Careers active jobs sync...");
      const result = await KekaCareersSyncService.syncActiveJobs();
      console.log(`✅ [Cron] Keka Careers sync complete. Synced: ${result.syncedCount}, Errors: ${result.errors.length}`);

      if (isKekaEnabled()) {
        console.log("⏰ [Cron] Starting Keka Developer API jobs and candidates sync...");
        const { kekaJobsService } = await import("../integrations/keka/services/jobs.service.js");
        const { kekaCandidatesService } = await import("../integrations/keka/services/candidates.service.js");
        
        try {
          await kekaJobsService.syncJobsFromKeka();
          console.log("✅ [Cron] Keka API jobs sync complete.");
        } catch (jobErr: any) {
          console.error("🚨 [Cron] Keka API jobs sync failed:", jobErr.message || jobErr);
        }

        try {
          await kekaCandidatesService.syncCandidatesFromKeka();
          console.log("✅ [Cron] Keka API candidates sync complete.");
          
          // Trigger sequential candidate screening in the background
          kekaCandidatesService.screenUnscreenedCandidates().catch(err => {
            console.error("🚨 [Cron] Keka auto-screening failed:", err.message || err);
          });
        } catch (candErr: any) {
          console.error("🚨 [Cron] Keka API candidates sync failed:", candErr.message || candErr);
        }
      }
    } catch (err: any) {
      console.error("🚨 [Cron] Keka Careers sync failed:", err.message || err);
    }
  });
});

// Trigger initial sync at startup
setTimeout(async () => {
  if (process.env.NODE_ENV === "test" || process.env.SKIP_STARTUP_SYNC === "true") {
    console.log("ℹ️ [Startup] Skipping startup Keka sync during test run.");
    return;
  }
  try {
    const { KekaCareersSyncService } = await import("../services/KekaCareersSyncService.js");
    const { isKekaEnabled } = await import("../integrations/keka/config/keka.config.js");

    console.log("⏰ [Startup] Triggering initial Keka Careers active jobs sync...");
    const result = await KekaCareersSyncService.syncActiveJobs();
    console.log(`✅ [Startup] Initial Keka Careers sync complete. Synced: ${result.syncedCount}, Errors: ${result.errors.length}`);

    if (isKekaEnabled()) {
      console.log("⏰ [Startup] Triggering Keka Developer API jobs and candidates sync...");
      const { kekaJobsService } = await import("../integrations/keka/services/jobs.service.js");
      const { kekaCandidatesService } = await import("../integrations/keka/services/candidates.service.js");
      
      try {
        await kekaJobsService.syncJobsFromKeka();
        console.log("✅ [Startup] Initial Keka API jobs sync complete.");
      } catch (jobErr: any) {
        console.error("🚨 [Startup] Initial Keka API jobs sync failed:", jobErr.message || jobErr);
      }

      try {
        await kekaCandidatesService.syncCandidatesFromKeka();
        console.log("✅ [Startup] Initial Keka API candidates sync complete.");
        
        // Trigger sequential candidate screening in the background on startup
        kekaCandidatesService.screenUnscreenedCandidates().catch(err => {
          console.error("🚨 [Startup] Keka auto-screening failed:", err.message || err);
        });
      } catch (candErr: any) {
        console.error("🚨 [Startup] Initial Keka API candidates sync failed:", candErr.message || candErr);
      }
    }
  } catch (err: any) {
    console.error("🚨 [Startup] Initial Keka sync failed:", err.message || err);
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
      
      // Sync for production tenant ONLY (IMAP is a shared inbox — no per-tenant looping)
      const productionTenantId = process.env.PRODUCTION_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
      let totalSynced = 0;
      try {
        const count = await EmailSyncService.syncMailbox(productionTenantId, "zoho");
        totalSynced += count;
      } catch (tenantErr: any) {
        console.error(`🚨 [Startup IMAP] Production tenant sync failed:`, tenantErr.message || tenantErr);
      }
      
      console.log(`✅ [Startup] Initial Zoho Mail IMAP sync complete. Total ingested: ${totalSynced}`);
    }
  } catch (err: any) {
    console.error("🚨 [Startup] Initial Zoho Mail sync failed:", err.message || err);
  }
}, 10000);

// Trigger initial Assessment Reminders & Pipeline Stage Sync at startup
setTimeout(async () => {
  try {
    await syncPipelineStages();
  } catch (err: any) {
    console.error("🚨 [Startup] Initial pipeline stage sync error:", err.message || err);
  }
  runWithLock("cron:assessment-reminders-startup", 43200, async () => {
    await processAssessmentReminders("Startup");
  });
}, 15000);

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
      await syncPipelineStages().catch(() => {});
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
