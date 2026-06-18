// src/api/routes/rankingRouter.ts
import { Router } from "express";
import { pool } from "../../lib/db";

const router = Router();

// GET /api/ranking/:batchId – returns stored candidate score (if any)
router.get("/:batchId", async (req, res) => {
  const { batchId } = req.params;
  if (!batchId) {
    return res.status(400).json({ error: "batchId required" });
  }
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT overall, criteria FROM candidate_scores WHERE batch_id = $1 ORDER BY scored_at DESC LIMIT 1`,
        [batchId]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Score not found" });
      }
      const row = result.rows[0];
      res.json({ batchId, score: { overall: row.overall, criteria: row.criteria } });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch ranking" });
  }
});

export default router;
