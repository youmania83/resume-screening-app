// src/api/server.ts
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
const { json, urlencoded } = bodyParser;
import resumeRouter from "./routes/resumeRouter";
import healthRouter from "./routes/healthRouter";
import scoreRouter from "./routes/scoreRouter";
import jobRouter from "./routes/jobRouter";
import rankingRouter from "./routes/rankingRouter";
import evaluateRouter from "./routes/evaluateRouter";
import candidateRouter from "./routes/candidateRouter";
import assessmentRouter from "./routes/assessmentRouter";
import interviewRouter from "./routes/interviewRouter";
import kekaRouter from "../integrations/keka/routes/keka.routes";
import "../lib/initDb";
dotenv.config();


const app = express();
app.use(cors());
app.use(json());
app.use(urlencoded({ extended: true }));

app.use("/api/resumes", resumeRouter);
app.use("/api/health", healthRouter);
app.use("/api/score", scoreRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/evaluate", evaluateRouter);
app.use("/api/candidates", candidateRouter);
app.use("/api/assessment", assessmentRouter);
app.use("/api/interview", interviewRouter);
app.use("/api", kekaRouter);

const PORT = Number(process.env.PORT) || 4000;
const server1 = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server listening on http://0.0.0.0:${PORT}`);
});

if (PORT !== 3000) {
  const server2 = app.listen(3000, "0.0.0.0", () => {
    console.log(`🚀 Backend server also listening on http://0.0.0.0:3000`);
  });
  server2.on("error", (err: any) => {
    console.log(`⚠️ Port 3000 listen error: ${err.message}`);
  });
}

if (PORT !== 4000) {
  const server3 = app.listen(4000, "0.0.0.0", () => {
    console.log(`🚀 Backend server also listening on http://0.0.0.0:4000`);
  });
  server3.on("error", (err: any) => {
    console.log(`⚠️ Port 4000 listen error: ${err.message}`);
  });
}

export default app;
