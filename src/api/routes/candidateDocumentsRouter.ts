// src/api/routes/candidateDocumentsRouter.ts
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

// GET /api/candidates/:id/documents - Fetch all documents for candidate
router.get("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const result = await queryTenant(
      `SELECT d.*, u.name as uploader_name 
       FROM candidate_documents d 
       LEFT JOIN users u ON d.uploaded_by = u.id 
       WHERE d.candidate_id = $1 AND d.tenant_id = :tenant_id 
       ORDER BY d.uploaded_at DESC, d.version DESC;`,
      [id]
    );

    res.json({ success: true, documents: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/candidates/:id/documents - Add candidate document (handles version increments)
router.post("/", async (req: any, res, next) => {
  try {
    const { id } = req.params; // candidateId
    const { title, fileUrl, documentType } = req.body as {
      title: string;
      fileUrl: string;
      documentType: string;
    };

    if (!title || !fileUrl || !documentType) {
       res.status(400).json({ success: false, error: "title, fileUrl, and documentType are required" });
       return;
    }

    if (!(await checkCandidateExists(id))) {
      res.status(404).json({ success: false, error: "Candidate not found" });
      return;
    }

    const docType = documentType.toLowerCase().trim();
    const cleanTitle = title.trim();

    // Determine Version Number
    const versionRes = await queryTenant(
      `SELECT COALESCE(MAX(version), 0) as max_ver 
       FROM candidate_documents 
       WHERE candidate_id = $1 AND title = $2 AND tenant_id = :tenant_id;`,
      [id, cleanTitle]
    );
    const nextVersion = (versionRes.rows[0]?.max_ver ?? 0) + 1;
    const docId = crypto.randomUUID();
    const uploaderId = req.user?.userId || null;

    await queryTenant(
      `INSERT INTO candidate_documents (id, tenant_id, candidate_id, title, file_url, document_type, version, uploaded_by)
       VALUES ($1, :tenant_id, $2, $3, $4, $5, $6, $7);`,
      [docId, id, cleanTitle, fileUrl, docType, nextVersion, uploaderId]
    );

    // Auto-log to timeline if document is a resume
    if (docType === "resume") {
      await logTimelineEvent(
        id,
        "resume_uploaded",
        `Resume Uploaded (v${nextVersion})`,
        `New resume version uploaded: "${cleanTitle}".`,
        uploaderId
      );
    } else {
      await logTimelineEvent(
        id,
        "resume_uploaded",
        `Document Attached: ${cleanTitle}`,
        `Attached a document of type ${docType} (v${nextVersion}).`,
        uploaderId
      );
    }

    res.status(201).json({ success: true, documentId: docId, version: nextVersion });
  } catch (err) {
    next(err);
  }
});

export default router;
