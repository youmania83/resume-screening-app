// src/routes/scoreRouter.ts
import { Router } from "express";
import { computeScore } from "../lib/scoring";
import { pool } from "../lib/db";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

/**
 * POST /api/score/:batchId
 * Body: { jobId: string, jobDescription: string }
 * Calculates the score using DeepSeek and stores it in candidate_scores.
 */
router.post("/:batchId", async (req, res) => {
  const { batchId } = req.params;
  const { jobId, jobDescription } = req.body as {
    jobId: string;
    jobDescription: string;
  };

  if (!jobId || !jobDescription) {
    return res.status(400).json({ error: "jobId and jobDescription required" });
  }

  try {
    // Compute the score via DeepSeek
    const result = await computeScore(batchId, jobDescription);

    // Persist result
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO candidate_scores (batch_id, job_id, overall, criteria)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (batch_id, job_id) DO UPDATE SET overall = EXCLUDED.overall, criteria = EXCLUDED.criteria;`,
        [batchId, jobId, result.overall, result.criteria]
      );
    } finally {
      client.release();
    }

    res.json({ batchId, jobId, score: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute or store score" });
  }
});

export default router;
