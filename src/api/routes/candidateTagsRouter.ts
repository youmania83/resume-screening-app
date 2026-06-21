// src/api/routes/candidateTagsRouter.ts
import { Router } from "express";
import crypto from "crypto";
import { queryTenant } from "../../lib/tenantDb.js";

const router = Router({ mergeParams: true });

async function checkCandidateExists(candidateId: string): Promise<boolean> {
  const result = await queryTenant(
    "SELECT id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
    [candidateId]
  );
  return result.rowCount! > 0;
}

// GET /api/candidates/:id/tags - Get all tags of a candidate
router.get("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    
    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const result = await queryTenant(
      "SELECT * FROM candidate_tags WHERE candidate_id = $1 AND tenant_id = :tenant_id ORDER BY created_at ASC;",
      [id]
    );
    res.json({ success: true, tags: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/:id/tags - Add a tag to a candidate
router.post("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    const { tagName } = req.body;

    if (!tagName) {
       res.status(400).json({ success: false, error: "Tag name is required" });
       return;
    }

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const cleanTag = tagName.trim();

    // Check if tag already exists on candidate
    const checkRes = await queryTenant(
      "SELECT id FROM candidate_tags WHERE candidate_id = $1 AND tag_name = $2 AND tenant_id = :tenant_id LIMIT 1;",
      [id, cleanTag]
    );

    if (checkRes.rowCount! > 0) {
       res.status(400).json({ success: false, error: "Tag already exists on candidate" });
       return;
    }

    const tagId = crypto.randomUUID();
    await queryTenant(
      "INSERT INTO candidate_tags (id, tenant_id, candidate_id, tag_name) VALUES ($1, :tenant_id, $2, $3);",
      [tagId, id, cleanTag]
    );

    res.status(201).json({ success: true, tagId, tagName: cleanTag });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/candidates/:id/tags/:tagId - Remove a tag from candidate
router.delete("/:tagId", async (req: any, res, next) => {
  try {
    const { id, tagId } = req.params;

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const result = await queryTenant(
      "DELETE FROM candidate_tags WHERE id = $1 AND candidate_id = $2 AND tenant_id = :tenant_id;",
      [tagId, id]
    );

    if (result.rowCount === 0) {
       res.status(404).json({ success: false, error: "Tag not found on candidate" });
       return;
    }

    res.json({ success: true, message: "Tag removed successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
