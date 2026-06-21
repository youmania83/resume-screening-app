// src/api/routes/rankingRouter.ts
import { Router } from "express";
import { queryTenant } from "../../lib/tenantDb.js";

const router = Router();

// GET /api/ranking/:batchId – returns stored candidate score scoped by tenant
router.get("/:batchId", async (req: any, res: any, next: any) => {
  const { batchId } = req.params;
  if (!batchId) {
     res.status(400).json({ error: "batchId required" });
     return;
  }
  try {
    const result = await queryTenant(
      `SELECT overall, criteria FROM candidate_scores WHERE batch_id = $1 AND tenant_id = :tenant_id LIMIT 1`,
      [batchId]
    );
    if (result.rowCount === 0) {
       res.status(404).json({ error: "Score not found" });
       return;
    }
    const row = result.rows[0];
    res.json({ batchId, score: { overall: row.overall, criteria: row.criteria } });
  } catch (err) {
    next(err);
  }
});

export default router;
