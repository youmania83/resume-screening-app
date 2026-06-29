// src/api/server.ts
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
const { json, urlencoded } = bodyParser;
import authRouter from "./routes/authRouter.js";
import { authMiddleware } from "./middleware/authMiddleware.js";
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
import kekaRouter from "../integrations/keka/routes/keka.routes.js";
import zohoRouter from "../integrations/zoho/routes/zoho.routes.js";
import "../lib/initDb.js";
import cron from "node-cron";
import { redisClient, isRedisConnected } from "./middleware/security.js";
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

// Response compression
app.use(compression());

app.use(cors({
  origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  credentials: true
}));
app.use(cookieParser());
app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true, limit: "10mb" }));
app.use(csrfGuard);

// Apply Auth Middleware Globally for API Scoping
app.use(authMiddleware);

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
app.use("/api", kekaRouter);
app.use("/api", zohoRouter);

// 4. Global Express Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("🔥 Express Global Error caught:", err.stack || err);
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

// Twice-daily background job to sync emails for all tenants (Lock TTL = 1 hour)
cron.schedule("0 9,21 * * *", () => { // Run at 9 AM and 9 PM daily
  runWithLock("cron:email-sync-all-tenants", 3600, async () => {
    try {
      const { queryGlobal } = await import("../lib/tenantDb.js");
      const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
      
      console.log("✉️ [Email Sync Job] Starting twice-daily email sync for all tenants...");
      
      const tenantsRes = await queryGlobal(
        "SELECT id, email_config FROM tenants WHERE email_config IS NOT NULL;"
      );
      
      let totalIngested = 0;
      
      for (const tenant of tenantsRes.rows) {
        const tenantId = tenant.id;
        const config = tenant.email_config;
        const provider = config?.provider;
        
        if (provider && provider !== "mock") {
          try {
            console.log(`✉️ [Email Sync Job] Syncing ${provider} for tenant ${tenantId}...`);
            const count = await EmailSyncService.syncMailbox(tenantId, provider);
            totalIngested += count;
          } catch (err: any) {
            console.error(`🚨 [Email Sync Job] Failed syncing for tenant ${tenantId}:`, err.message || err);
          }
        }
      }
      
      console.log(`✉️ [Email Sync Job] Finished email sync. Total resumes ingested: ${totalIngested}`);
    } catch (err) {
      console.error("🚨 [Email Sync Job] Twice-daily email sync failed:", err);
    }
  });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server listening on http://0.0.0.0:${PORT}`);
});

// 5. Node Process Crash-Guards for Asynchronous Background Workflows
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("🚨 Unhandled Promise Rejection at:", promise, "reason:", reason?.stack || reason);
});

process.on("uncaughtException", (error: Error) => {
  console.error("🚨 Uncaught Exception thrown in backend process:", error.stack || error);
  // Node.js is in an undefined state after uncaught exceptions — must exit
  process.exit(1);
});

export default app;
