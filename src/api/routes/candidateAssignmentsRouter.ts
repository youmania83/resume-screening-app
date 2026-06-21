// src/api/routes/candidateAssignmentsRouter.ts
import { Router } from "express";
import crypto from "crypto";
import { queryTenant } from "../../lib/tenantDb.js";
import { logTimelineEvent } from "../../lib/timeline.js";

const router = Router({ mergeParams: true });

async function checkCandidateExists(candidateId: string): Promise<boolean> {
  const result = await queryTenant(
    "SELECT id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
    [candidateId]
  );
  return result.rowCount! > 0;
}

// GET /api/candidates/:id/assignments - Get all assignments log
router.get("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const result = await queryTenant(
      `SELECT a.*, r.name as recruiter_name, u.name as assigner_name 
       FROM candidate_assignments a 
       JOIN users r ON a.recruiter_id = r.id 
       LEFT JOIN users u ON a.assigned_by = u.id 
       WHERE a.candidate_id = $1 AND a.tenant_id = :tenant_id 
       ORDER BY a.assigned_at DESC;`,
      [id]
    );

    res.json({ success: true, assignments: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/:id/assignments - Assign candidate to a recruiter
router.post("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    const { recruiterId } = req.body;
    const assignerId = req.user?.userId || null;

    if (!recruiterId) {
       res.status(400).json({ success: false, error: "recruiterId is required" });
       return;
    }

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    // Verify recruiter exists in tenant
    const recCheck = await queryTenant(
      "SELECT name FROM users WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [recruiterId]
    );

    if (recCheck.rowCount === 0) {
       res.status(404).json({ success: false, error: "Recruiter not found under this tenant account" });
       return;
    }

    const assignmentId = crypto.randomUUID();
    await queryTenant(
      `INSERT INTO candidate_assignments (id, tenant_id, candidate_id, recruiter_id, assigned_by)
       VALUES ($1, :tenant_id, $2, $3, $4);`,
      [assignmentId, id, recruiterId, assignerId]
    );

    // Sync recruiter_owner_id in candidate details
    await queryTenant(
      "UPDATE candidates SET recruiter_owner_id = $1 WHERE id = $2 AND tenant_id = :tenant_id;",
      [recruiterId, id]
    );

    // Auto-log to timeline
    await logTimelineEvent(
      id,
      "candidate_assigned",
      "Candidate Assigned",
      `Assigned to recruiter: ${recCheck.rows[0].name}.`,
      assignerId
    );

    res.json({ success: true, assignmentId, message: "Recruiter assigned successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
