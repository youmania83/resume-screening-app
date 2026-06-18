// src/api/routes/scoreRouter.ts
import { Router } from "express";
import { computeScore } from "../../lib/scoring";
import { pool } from "../../lib/db";

const router = Router();

/**
 * Common handler for scoring requests
 */
const handleScore = async (req: any, res: any) => {
  const batchId = req.params.batchId || req.body.batchId;
  const { jobId, jobDescription } = req.body as {
    jobId?: string;
    jobDescription: string;
  };

  if (!batchId || !jobDescription) {
    return res.status(400).json({ error: "batchId and jobDescription required" });
  }

  try {
    const score = await computeScore(batchId, jobDescription);
    const activeJobId = jobId || "default-job";

    // Persist score
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO candidate_scores (batch_id, job_id, overall, criteria)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (batch_id, job_id) DO UPDATE SET overall = EXCLUDED.overall, criteria = EXCLUDED.criteria;`,
        [batchId, activeJobId, score.overall, JSON.stringify(score.criteria)]
      );
    } finally {
      client.release();
    }
    res.json({ batchId, jobId: activeJobId, score });
  } catch (err: any) {
    console.error("Scoring error:", err);
    res.status(500).json({ error: err.message || "Scoring failed" });
  }
};

// Mount the same handler on both endpoints for backward and forward compatibility
router.post("/", handleScore);
router.post("/:batchId", handleScore);

export default router;
