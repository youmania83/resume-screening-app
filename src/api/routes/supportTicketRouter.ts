// src/api/routes/supportTicketRouter.ts
import { Router } from "express";
import crypto from "crypto";
import { queryGlobal, queryTenant } from "../../lib/tenantDb.js";
import { sendSupportTicketNotification } from "../../lib/email.js";

const router = Router();

/**
 * POST /api/support-tickets/public
 * Guest route used by candidates during assessments or from their portals
 * to report issues without requiring recruiter authentication.
 */
router.post("/public", async (req: any, res: any, next: any) => {
  const { name, email, subject, message, assessmentToken } = req.body;

  if (!subject || !message) {
    res.status(400).json({ success: false, error: "Subject and message are required." });
    return;
  }

  try {
    let tenantId: string | null = null;
    let candidateId: string | null = null;
    let ticketName = name;
    let ticketEmail = email;
    let source = "anonymous";

    // If an assessment token is provided, try to resolve the candidate and tenant details
    if (assessmentToken) {
      const candRes = await queryGlobal(
        "SELECT id, tenant_id, name, email FROM candidates WHERE assessment_token = $1 LIMIT 1;",
        [assessmentToken]
      );

      if (candRes.rowCount && candRes.rowCount > 0) {
        const candidate = candRes.rows[0];
        tenantId = candidate.tenant_id;
        candidateId = candidate.id;
        if (!ticketName) ticketName = candidate.name;
        if (!ticketEmail) ticketEmail = candidate.email;
        source = "candidate";
      } else {
        res.status(404).json({ success: false, error: "Invalid or expired assessment token." });
        return;
      }
    }

    if (!ticketName || !ticketEmail) {
      res.status(400).json({ success: false, error: "Name and email are required." });
      return;
    }

    const ticketId = crypto.randomUUID();
    
    // Insert ticket globally (since we are in public context, we use queryGlobal)
    await queryGlobal(
      `INSERT INTO support_tickets (id, tenant_id, candidate_id, name, email, subject, message, status, priority, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
      [ticketId, tenantId, candidateId, ticketName, ticketEmail, subject, message, "open", "medium", source]
    );

    // Dispatch email notification to recruiters
    sendSupportTicketNotification({
      tenantId,
      ticketId,
      name: ticketName,
      email: ticketEmail,
      subject,
      message,
      priority: "medium",
      source
    }).catch(err => console.error("Failed to send support email notification:", err));

    res.status(201).json({ success: true, ticketId, message: "Support ticket created successfully." });
  } catch (err: any) {
    next(err);
  }
});

/**
 * POST /api/support-tickets
 * Authenticated route used by recruiters/owners to submit support requests.
 */
router.post("/", async (req: any, res: any, next: any) => {
  const { subject, message, priority = "medium" } = req.body;
  const userPayload = req.user; // populated by authMiddleware

  if (!subject || !message) {
    res.status(400).json({ success: false, error: "Subject and message are required." });
    return;
  }

  try {
    // Query user details from DB to get the name
    const userRes = await queryTenant(
      "SELECT name, email FROM users WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [userPayload.userId]
    );

    const user = userRes.rows[0] || { name: "Workspace Member", email: userPayload.email };
    const ticketId = crypto.randomUUID();

    await queryTenant(
      `INSERT INTO support_tickets (id, tenant_id, user_id, name, email, subject, message, status, priority, source)
       VALUES ($1, :tenant_id, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [ticketId, userPayload.userId, user.name, user.email, subject, message, "open", priority, "recruiter"]
    );

    // Dispatch email notification
    sendSupportTicketNotification({
      tenantId: userPayload.tenantId,
      ticketId,
      name: user.name,
      email: user.email,
      subject,
      message,
      priority,
      source: "recruiter"
    }).catch(err => console.error("Failed to send recruiter support email:", err));

    res.status(201).json({ success: true, ticketId, message: "Support ticket created successfully." });
  } catch (err: any) {
    next(err);
  }
});

/**
 * GET /api/support-tickets
 * Authenticated route to list all tickets for the active tenant.
 */
router.get("/", async (req: any, res: any, next: any) => {
  try {
    const result = await queryTenant(
      `SELECT * FROM support_tickets WHERE tenant_id = :tenant_id ORDER BY created_at DESC;`
    );
    res.json({ success: true, tickets: result.rows });
  } catch (err: any) {
    next(err);
  }
});

/**
 * PATCH /api/support-tickets/:id
 * Authenticated route to update status or priority of a ticket.
 */
router.patch("/:id", async (req: any, res: any, next: any) => {
  const { id } = req.params;
  const { status, priority } = req.body;

  if (!status && !priority) {
    res.status(400).json({ success: false, error: "Status or priority is required to update." });
    return;
  }

  try {
    // 1. Fetch current ticket to verify ownership/existence
    const checkRes = await queryTenant(
      "SELECT id, status, priority FROM support_tickets WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [id]
    );

    if (checkRes.rowCount === 0) {
      res.status(404).json({ success: false, error: "Support ticket not found under your account." });
      return;
    }

    const currentTicket = checkRes.rows[0];
    const finalStatus = status || currentTicket.status;
    const finalPriority = priority || currentTicket.priority;

    const updateRes = await queryTenant(
      `UPDATE support_tickets 
       SET status = $1, priority = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND tenant_id = :tenant_id
       RETURNING *;`,
      [finalStatus, finalPriority, id]
    );

    res.json({ success: true, ticket: updateRes.rows[0], message: "Support ticket updated." });
  } catch (err: any) {
    next(err);
  }
});

export default router;
