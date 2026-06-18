// src/routes/rankingRouter.ts
import { Router } from "express";
import { pool } from "../lib/db";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

/**
 * GET /api/ranking/:jobId
 * Returns a list of candidates for the specified job sorted by overall score descending.
 */
router.get("/:jobId", async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) {
    return res.status(400).json({ error: "jobId is required" });
  }
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT batch_id, overall, criteria, scored_at FROM candidate_scores WHERE job_id = $1 ORDER BY overall DESC;`,
        [jobId]
      );
      res.json({ jobId, candidates: result.rows });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve rankings" });
  }
});

export default router;
