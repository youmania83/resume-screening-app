// src/api/routes/candidateTimelineRouter.ts
import { Router } from "express";
import { queryTenant } from "../../lib/tenantDb.js";

const router = Router({ mergeParams: true });

// GET /api/candidates/:id/timeline - Fetch timeline feed chronologically
router.get("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    const result = await queryTenant(
      `SELECT t.*, u.name as creator_name 
       FROM candidate_timeline t 
       LEFT JOIN users u ON t.created_by = u.id 
       WHERE t.candidate_id = $1 AND t.tenant_id = :tenant_id 
       ORDER BY t.created_at DESC;`,
      [id]
    );

    res.json({ success: true, timeline: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
