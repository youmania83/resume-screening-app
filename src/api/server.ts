// src/api/server.ts
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
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
dotenv.config();


const app = express();
app.use(cors({
  origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  credentials: true
}));
app.use(cookieParser());
app.use(json());
app.use(urlencoded({ extended: true }));
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

// Hourly cleanup job to prune expired refresh tokens from the database
setInterval(async () => {
  try {
    const { queryGlobal } = await import("../lib/tenantDb.js");
    const result = await queryGlobal("DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP;");
    if (result.rowCount && result.rowCount > 0) {
      console.log(`🧹 [Session Cleanup] Pruned ${result.rowCount} expired refresh tokens.`);
    }
  } catch (err) {
    console.error("🚨 [Session Cleanup] Failed to prune expired refresh tokens:", err);
  }
}, 60 * 60 * 1000);

// Daily background job to prune orphaned files from the storage provider
setInterval(async () => {
  try {
    const { StoragePruningService } = await import("../services/StoragePruningService.js");
    console.log("🧹 [Storage Pruning] Daily background pruning job started...");
    const result = await StoragePruningService.pruneOrphanedFiles();
    console.log(`🧹 [Storage Pruning] Finished daily cleanup. Pruned ${result.deletedCount} files, freeing ${result.bytesFreed} bytes.`);
  } catch (err) {
    console.error("🚨 [Storage Pruning] Daily background pruning job failed:", err);
  }
}, 24 * 60 * 60 * 1000);

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
  // Log critical error and prevent immediate process termination
});

export default app;
