// src/api/routes/webhookRouter.ts
import { Router } from "express";
import { queryGlobal, queryTenant } from "../../lib/tenantDb.js";
import { tenantStorage } from "../../lib/tenantContext.js";
import { logTimelineEvent } from "../../lib/timeline.js";

const router = Router();

/**
 * POST /api/webhooks/calcom
 * Public webhook endpoint for Cal.com events.
 * Exempt from global auth middleware and CSRF guards.
 */
router.post("/webhooks/calcom", async (req: any, res: any, next: any) => {
  try {
    const { triggerEvent, payload } = req.body;
    console.log(`📡 [Cal.com Webhook] Received event: ${triggerEvent}`);

    if (!payload) {
      res.status(400).json({ error: "Missing payload in request body." });
      return;
    }

    // Supported events: BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
    if (!["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"].includes(triggerEvent)) {
      res.json({ success: true, message: `Event ${triggerEvent} ignored.` });
      return;
    }

    const { startTime, attendees, videoCallData, uid: bookingUid } = payload;
    const candidateEmail = attendees?.[0]?.email;
    const candidateName = attendees?.[0]?.name;
    const meetingLink = videoCallData?.url || "";
    const scheduledDate = startTime ? new Date(startTime) : null;

    if (!candidateEmail) {
      res.status(400).json({ error: "No attendee/candidate email found in payload." });
      return;
    }

    // 1. Find candidate globally by email
    const candRes = await queryGlobal(
      `SELECT c.id, c.name, c.email, c.job_id, c.tenant_id, j.title as job_title 
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       WHERE LOWER(c.email) = LOWER($1)
       ORDER BY c.created_at DESC
       LIMIT 1;`,
      [candidateEmail]
    );

    if (candRes.rowCount === 0) {
      console.warn(`⚠️ [Cal.com Webhook] Candidate with email ${candidateEmail} not found in database.`);
      res.status(404).json({ error: "Candidate not found." });
      return;
    }

    const candidate = candRes.rows[0];
    const tenantId = candidate.tenant_id;

    // Run database modifications scoped to the candidate's tenant context
    await tenantStorage.run({ tenantId, userId: "system", role: "system" }, async () => {
      
      if (triggerEvent === "BOOKING_CREATED" || triggerEvent === "BOOKING_RESCHEDULED") {
        if (!scheduledDate) {
          throw new Error("Missing startTime for scheduled booking.");
        }

        // Check if there is already an active/pending interview for this candidate
        const checkInt = await queryTenant(
          "SELECT id FROM interviews WHERE candidate_id = $1 AND tenant_id = :tenant_id LIMIT 1;",
          [candidate.id]
        );

        const isUpdate = triggerEvent === "BOOKING_RESCHEDULED";
        const interviewId = checkInt.rowCount && checkInt.rowCount > 0
          ? checkInt.rows[0].id
          : `calcom-${bookingUid || Date.now()}`;

        if (checkInt.rowCount && checkInt.rowCount > 0) {
          // Update the existing interview slot
          await queryTenant(
            `UPDATE interviews 
             SET scheduled_date = $1, status = 'scheduled', meeting_link = $2 
             WHERE id = $3 AND tenant_id = :tenant_id;`,
            [scheduledDate, meetingLink, interviewId]
          );
        } else {
          // Create new interview slot
          await queryTenant(
            `INSERT INTO interviews (id, candidate_id, job_id, scheduled_date, status, meeting_link, tenant_id)
             VALUES ($1, $2, $3, $4, 'scheduled', $5, :tenant_id);`,
            [interviewId, candidate.id, candidate.job_id, scheduledDate, meetingLink]
          );
        }

        // Update candidate general status to interviewing
        await queryTenant(
          `UPDATE candidates 
           SET status = 'interviewing', interview_scheduled_date = $1 
           WHERE id = $2 AND tenant_id = :tenant_id;`,
          [scheduledDate, candidate.id]
        );

        // Log Activity Logs & Timeline Event
        const logMsg = isUpdate
          ? `Interview rescheduled via Cal.com to ${scheduledDate.toLocaleString()}. Meet: ${meetingLink}`
          : `Interview booked via Cal.com for ${scheduledDate.toLocaleString()}. Meet: ${meetingLink}`;

        await queryTenant(
          `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
           VALUES ($1, 'interview_scheduled', $2, :tenant_id);`,
          [candidate.id, logMsg]
        );

        await logTimelineEvent(
          candidate.id,
          isUpdate ? "interview_rescheduled" : "interview_scheduled",
          isUpdate ? "Interview Rescheduled (Cal.com)" : "Interview Booked (Cal.com)",
          logMsg,
          null
        );

        console.log(`✅ [Cal.com Webhook] Successfully processed ${triggerEvent} for ${candidateEmail}`);

      } else if (triggerEvent === "BOOKING_CANCELLED") {
        // Cancel the interview in database
        await queryTenant(
          `UPDATE interviews 
           SET status = 'cancelled' 
           WHERE candidate_id = $1 AND tenant_id = :tenant_id;`,
          [candidate.id]
        );

        // Update candidate status back to applied/shortlisted depending on pipeline
        await queryTenant(
          `UPDATE candidates 
           SET status = 'shortlisted', interview_scheduled_date = NULL 
           WHERE id = $2 AND tenant_id = :tenant_id;`,
          [candidate.id]
        );

        const cancelMsg = "Interview cancelled by candidate/manager via Cal.com.";

        await queryTenant(
          `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
           VALUES ($1, 'interview_cancelled', $2, :tenant_id);`,
          [candidate.id, cancelMsg]
        );

        await logTimelineEvent(
          candidate.id,
          "interview_cancelled",
          "Interview Cancelled (Cal.com)",
          cancelMsg,
          null
        );

        console.log(`✅ [Cal.com Webhook] Successfully processed BOOKING_CANCELLED for ${candidateEmail}`);
      }
    });

    res.json({ success: true, message: `Processed ${triggerEvent} successfully.` });
  } catch (err: any) {
    console.error(`🚨 [Cal.com Webhook] Error:`, err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

export default router;
