// src/api/routes/scoreRouter.ts
import { Router } from "express";
import { computeScore } from "../../lib/scoring.js";
import { queryTenant } from "../../lib/tenantDb.js";

const router = Router();

/**
 * Common handler for scoring requests
 */
const handleScore = async (req: any, res: any, next: any) => {
  const batchId = req.params.batchId || req.body.batchId;
  const { jobId, jobDescription } = req.body as {
    jobId?: string;
    jobDescription: string;
  };

  if (!batchId || !jobDescription) {
     res.status(400).json({ error: "batchId and jobDescription required" });
     return;
  }

  try {
    // 1. Enforce tenant isolation on the uploaded resume text
    const checkResume = await queryTenant(
      "SELECT batch_id FROM resume_texts WHERE batch_id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [batchId]
    );

    if (checkResume.rowCount === 0) {
       res.status(404).json({ error: "Access Denied: Resume batch not found under your account." });
       return;
    }

    const score = await computeScore(batchId, jobDescription);
    const activeJobId = jobId || "default-job";

    // 2. Persist score with tenant scoping
    await queryTenant(
      `INSERT INTO candidate_scores (batch_id, job_id, overall, criteria, tenant_id)
       VALUES ($1, $2, $3, $4, :tenant_id)
       ON CONFLICT (batch_id, job_id) DO UPDATE SET overall = EXCLUDED.overall, criteria = EXCLUDED.criteria, tenant_id = EXCLUDED.tenant_id;`,
      [batchId, activeJobId, score.overall, JSON.stringify(score.criteria)]
    );

    res.json({ batchId, jobId: activeJobId, score });
  } catch (err: any) {
    next(err);
  }
};

// Mount the same handler on both endpoints for backward and forward compatibility
router.post("/", handleScore);
router.post("/:batchId", handleScore);

export default router;
