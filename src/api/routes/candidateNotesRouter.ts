// src/api/routes/candidateNotesRouter.ts
import { Router } from "express";
import crypto from "crypto";
import { queryTenant } from "../../lib/tenantDb.js";
import { logTimelineEvent } from "../../lib/timeline.js";

const router = Router({ mergeParams: true });

// Helper to check if candidate belongs to active tenant
async function checkCandidateExists(candidateId: string): Promise<boolean> {
  const result = await queryTenant(
    "SELECT id FROM candidates WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
    [candidateId]
  );
  return result.rowCount! > 0;
}

// GET /api/candidates/:id/notes - Get all notes for candidate (pinned first, then newest)
router.get("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    
    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const result = await queryTenant(
      `SELECT n.*, u.name as author_name 
       FROM candidate_notes n 
       LEFT JOIN users u ON n.author_id = u.id 
       WHERE n.candidate_id = $1 AND n.tenant_id = :tenant_id 
       ORDER BY n.is_pinned DESC, n.created_at DESC;`,
      [id]
    );

    res.json({ success: true, notes: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/:id/notes - Create a new internal note
router.post("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    const { noteText, isPinned } = req.body;
    const authorId = req.user?.userId || null;

    if (!noteText) {
       res.status(400).json({ success: false, error: "Note text cannot be empty" });
       return;
    }

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const noteId = crypto.randomUUID();
    await queryTenant(
      `INSERT INTO candidate_notes (id, tenant_id, candidate_id, author_id, note_text, is_pinned)
       VALUES ($1, :tenant_id, $2, $3, $4, $5);`,
      [noteId, id, authorId, noteText, isPinned || false]
    );

    // Auto-log to candidate timeline
    await logTimelineEvent(
      id,
      "feedback_submitted",
      "Recruiter Feedback Added",
      `Internal note added by ${req.user?.name || "system"}.`,
      authorId
    );

    res.status(201).json({ success: true, noteId, message: "Note added successfully" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/candidates/:id/notes/:noteId/pin - Toggle pin status on a note
router.put("/:noteId/pin", async (req: any, res, next) => {
  try {
    const { id, noteId } = req.params;
    const { isPinned } = req.body;

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const checkRes = await queryTenant(
      "SELECT * FROM candidate_notes WHERE id = $1 AND candidate_id = $2 AND tenant_id = :tenant_id LIMIT 1;",
      [noteId, id]
    );

    if (checkRes.rowCount === 0) {
       res.status(404).json({ success: false, error: "Note not found" });
       return;
    }

    await queryTenant(
      "UPDATE candidate_notes SET is_pinned = $1 WHERE id = $2 AND tenant_id = :tenant_id;",
      [isPinned === true, noteId]
    );

    res.json({ success: true, message: `Note ${isPinned ? "pinned" : "unpinned"} successfully` });
  } catch (err) {
    next(err);
  }
});

export default router;
