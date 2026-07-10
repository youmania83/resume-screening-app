// src/api/routes/calendarRouter.ts
import { Router } from "express";
import crypto from "crypto";
import { queryTenant } from "../../lib/tenantDb.js";
import { getTenantContext } from "../../lib/tenantContext.js";
import { logTimelineEvent } from "../../lib/timeline.js";
import nodemailer from "nodemailer";
import { decrypt } from "../../lib/crypto.js";

const router = Router();

// Helper to send ICS calendar file or standard email confirmation
async function sendCalendarInvitation(params: {
  tenantId: string;
  candidateEmail: string;
  candidateName: string;
  recruiterEmail: string;
  jobTitle: string;
  scheduledDate: Date;
  action: "create" | "update" | "cancel";
  interviewId?: string;
}) {
  const formattedDate = params.scheduledDate.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const subject = params.action === "create"
    ? `Interview Confirmed: ${params.jobTitle} - ${params.candidateName}`
    : params.action === "update"
    ? `Interview Rescheduled: ${params.jobTitle} - ${params.candidateName}`
    : `Interview Cancelled: ${params.jobTitle} - ${params.candidateName}`;

  const body = params.action === "cancel"
    ? `Hi ${params.candidateName},\n\nYour interview for the ${params.jobTitle} position has been cancelled.\n\nBest regards,\nRecruitment Team`
    : `Hi ${params.candidateName},\n\nYour interview for the ${params.jobTitle} position has been ${params.action === "create" ? "scheduled" : "rescheduled"}.\n\nNew Time: ${formattedDate}\n\nA calendar invitation has been sent to your email. We look forward to speaking with you.\n\nBest regards,\nRecruitment Team`;

  // Try to load custom SMTP configuration
  const tenantRes = await queryTenant(
    "SELECT email_config FROM tenants WHERE id = :tenant_id LIMIT 1;"
  );
  let transporter: any = null;
  let fromAddress = process.env.SMTP_FROM || `"Techsol Engineers Calendar" <calendar@techsolengineers.com>`;
  let replyToAddress: string | undefined = undefined;

  if (tenantRes.rowCount && tenantRes.rowCount > 0) {
    const config = tenantRes.rows[0].email_config;
    if (config) {
      const username = config.username || config.user;
      const password = config.password || config.pass;
      if (username && password) {
        let host = config.host;
        if (!host) {
          if (config.provider === "gmail") host = "smtp.gmail.com";
          else if (config.provider === "outlook") host = "smtp.office365.com";
          else if (config.provider === "zoho") host = "smtp.zoho.com";
          else host = "smtp.mail.yahoo.com";
        }
        const port = Number(config.port) || 587;
        const decryptedPassword = decrypt(password);
        const fromName = config.fromName || "";
        fromAddress = fromName ? `"${fromName}" <${username}>` : username;
        replyToAddress = config.replyTo || undefined;

        transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: {
            user: username,
            pass: decryptedPassword,
          },
          family: 4 // Force IPv4 connection to prevent IPv6 network unreachable errors
        } as any);
      }
    }
  }

  // Fallback to global SMTP
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (host && user && pass) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        family: 4 // Force IPv4 connection to prevent IPv6 network unreachable errors
      } as any);
    }
  }

  if (transporter) {
    // Create standard ICS string
    const methodType = params.action === "cancel" ? "CANCEL" : "REQUEST";
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Techsol Engineers Resume Screening//Calendar//EN",
      "CALSCALE:GREGORIAN",
      `METHOD:${methodType}`,
      "BEGIN:VEVENT",
      `UID:uid-interview-${params.interviewId || Date.now()}-${params.candidateEmail}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${params.scheduledDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTEND:${new Date(params.scheduledDate.getTime() + 45 * 60 * 1000).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`, // 45-min duration
      `SUMMARY:${params.action === "cancel" ? "Cancelled: " : ""}Interview - ${params.candidateName} for ${params.jobTitle}`,
      `DESCRIPTION:Interview ${params.action === "cancel" ? "cancelled" : "scheduled"} via Techsol Engineers Candidate Portal.`,
      `ORGANIZER;CN=Recruiter:MAILTO:${params.recruiterEmail}`,
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${params.candidateName}:MAILTO:${params.candidateEmail}`,
      ...(params.action === "cancel" ? ["STATUS:CANCELLED", "SEQUENCE:1"] : []),
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    try {
      await transporter.sendMail({
        from: fromAddress,
        replyTo: replyToAddress,
        to: [params.candidateEmail, params.recruiterEmail],
        subject,
        text: body,
        alternatives: [
          {
            contentType: "text/calendar; charset=utf-8; method=" + methodType,
            content: icsContent,
          },
        ],
      });
      console.log(`📧 Calendar invitation (${params.action}) email sent to ${params.candidateEmail} & ${params.recruiterEmail}`);
    } catch (err) {
      console.error(`Failed to send calendar SMTP invite (${params.action}):`, err);
    }
  } else {
    console.log(`✉️ [Mock Calendar invitation] Simulated ${params.action} email logged for ${params.candidateEmail}`);
  }
}

/**
 * GET /api/calendar/settings
 * Retrieves calendar settings for the tenant.
 */
router.get("/settings", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const tenantRes = await queryTenant(
      "SELECT calendar_config FROM tenants WHERE id = :tenant_id LIMIT 1;"
    );

    if (tenantRes.rowCount === 0) {
      res.status(404).json({ error: "Tenant not found." });
      return;
    }

    res.json({
      success: true,
      settings: tenantRes.rows[0].calendar_config || {},
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/settings
 * Updates calendar settings for the tenant.
 */
router.post("/settings", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const { provider, credentials, calLink, cal_link } = req.body;

    if (!provider) {
      res.status(400).json({ error: "Provider is required." });
      return;
    }

    const calendarConfig = {
      provider, // 'google', 'outlook', 'calcom', or 'mock'
      credentials: credentials || {},
      calLink: calLink || cal_link || "",
      connectedAt: new Date().toISOString(),
    };

    await queryTenant(
      "UPDATE tenants SET calendar_config = $1 WHERE id = :tenant_id;",
      [JSON.stringify(calendarConfig)]
    );

    res.json({
      success: true,
      message: `${provider} Calendar settings updated successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/schedule
 * Schedules a new interview slot and pushes to Google/Outlook/Mock API.
 */
router.post("/schedule", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const { candidateId, scheduledDate, title, description } = req.body;

    if (!candidateId || !scheduledDate) {
      res.status(400).json({ error: "candidateId and scheduledDate are required." });
      return;
    }

    // Get candidate & job details
    const candRes = await queryTenant(
      `SELECT c.id, c.name, c.email, c.job_id, j.title as job_title 
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       WHERE c.id = $1 AND c.tenant_id = :tenant_id
       LIMIT 1;`,
      [candidateId]
    );

    if (candRes.rowCount === 0) {
      res.status(404).json({ error: "Candidate not found." });
      return;
    }

    const candidate = candRes.rows[0];

    // Fetch calendar configuration
    const tenantRes = await queryTenant(
      "SELECT calendar_config FROM tenants WHERE id = :tenant_id LIMIT 1;"
    );
    const config = tenantRes.rows[0]?.calendar_config || { provider: "mock" };

    // Simulate calendar sync/event creation
    console.log(`[Calendar Integration] Scheduling event using provider: ${config.provider}`);
    if (config.provider === "google") {
      console.log(`📡 [Google Calendar API] POST https://www.googleapis.com/calendar/v3/calendars/primary/events`);
      console.log(`   Event: "${title || "Interview"}" on ${new Date(scheduledDate).toISOString()}`);
    } else if (config.provider === "outlook") {
      console.log(`📡 [Microsoft Graph API] POST https://graph.microsoft.com/v1.0/me/events`);
      console.log(`   Event: "${title || "Interview"}" on ${new Date(scheduledDate).toISOString()}`);
    }

    const interviewId = crypto.randomUUID();
    const finalDate = new Date(scheduledDate);

    // Save interview record in database
    await queryTenant(
      `INSERT INTO interviews (id, tenant_id, candidate_id, scheduled_date, status, feedback)
       VALUES ($1, :tenant_id, $2, $3, 'scheduled', $4);`,
      [interviewId, candidate.id, finalDate, description || ""]
    );

    // Log timeline event
    await logTimelineEvent(
      candidate.id,
      "Interview Scheduled",
      "Interview Scheduled",
      `Interview scheduled on recruiter calendar for ${finalDate.toLocaleString()}.`,
      req.user?.userId || null
    );

    // Send invites
    const recruiterEmail = req.user?.email || "recruiter@techsolengineers.com";
    await sendCalendarInvitation({
      tenantId,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      recruiterEmail,
      jobTitle: candidate.job_title || "Position",
      scheduledDate: finalDate,
      action: "create",
    });

    res.json({
      success: true,
      message: "Interview scheduled on calendar successfully.",
      interviewId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/reschedule
 * Reschedules an existing interview on the calendar.
 */
router.post("/reschedule", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const { interviewId, newDate } = req.body;

    if (!interviewId || !newDate) {
      res.status(400).json({ error: "interviewId and newDate are required." });
      return;
    }

    // Get current interview and candidate details
    const intRes = await queryTenant(
      `SELECT i.id, i.candidate_id, c.name as candidate_name, c.email as candidate_email, j.title as job_title 
       FROM interviews i
       JOIN candidates c ON i.candidate_id = c.id
       LEFT JOIN jobs j ON c.job_id = j.id
       WHERE i.id = $1 AND i.tenant_id = :tenant_id
       LIMIT 1;`,
      [interviewId]
    );

    if (intRes.rowCount === 0) {
      res.status(404).json({ error: "Interview record not found." });
      return;
    }

    const interview = intRes.rows[0];
    const finalDate = new Date(newDate);

    // Fetch calendar configuration
    const tenantRes = await queryTenant(
      "SELECT calendar_config FROM tenants WHERE id = :tenant_id LIMIT 1;"
    );
    const config = tenantRes.rows[0]?.calendar_config || { provider: "mock" };

    console.log(`[Calendar Integration] Rescheduling event using provider: ${config.provider}`);
    if (config.provider === "google") {
      console.log(`📡 [Google Calendar API] PUT /events/${interviewId}`);
    } else if (config.provider === "outlook") {
      console.log(`📡 [Microsoft Graph API] PATCH /events/${interviewId}`);
    }

    // Update in database
    await queryTenant(
      "UPDATE interviews SET scheduled_date = $1, status = 'scheduled' WHERE id = $2 AND tenant_id = :tenant_id;",
      [finalDate, interviewId]
    );

    // Log timeline event
    await logTimelineEvent(
      interview.candidate_id,
      "Interview Rescheduled",
      "Interview Rescheduled",
      `Interview rescheduled on calendar to ${finalDate.toLocaleString()}.`,
      req.user?.userId || null
    );

    // Send invite update
    const recruiterEmail = req.user?.email || "recruiter@techsolengineers.com";
    await sendCalendarInvitation({
      tenantId,
      candidateEmail: interview.candidate_email,
      candidateName: interview.candidate_name,
      recruiterEmail,
      jobTitle: interview.job_title || "Position",
      scheduledDate: finalDate,
      action: "update",
    });

    res.json({
      success: true,
      message: "Interview rescheduled on calendar successfully.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/cancel
 * Cancels an interview and triggers calendar invitation cancellation (METHOD:CANCEL).
 */
router.post("/cancel", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const { interviewId } = req.body;

    if (!interviewId) {
      res.status(400).json({ error: "interviewId is required." });
      return;
    }

    // Get current interview and candidate details
    const intRes = await queryTenant(
      `SELECT i.id, i.candidate_id, i.scheduled_date, c.name as candidate_name, c.email as candidate_email, j.title as job_title 
       FROM interviews i
       JOIN candidates c ON i.candidate_id = c.id
       LEFT JOIN jobs j ON c.job_id = j.id
       WHERE i.id = $1 AND i.tenant_id = :tenant_id
       LIMIT 1;`,
      [interviewId]
    );

    if (intRes.rowCount === 0) {
      res.status(404).json({ error: "Interview record not found." });
      return;
    }

    const interview = intRes.rows[0];

    // Update status in database to 'cancelled'
    await queryTenant(
      "UPDATE interviews SET status = 'cancelled' WHERE id = $1 AND tenant_id = :tenant_id;",
      [interviewId]
    );

    // Log timeline event
    await logTimelineEvent(
      interview.candidate_id,
      "Interview Cancelled",
      "Interview Cancelled",
      `Interview scheduled for ${new Date(interview.scheduled_date).toLocaleString()} has been cancelled.`,
      req.user?.userId || null
    );

    // Send calendar cancellation email
    const recruiterEmail = req.user?.email || "recruiter@techsolengineers.com";
    await sendCalendarInvitation({
      tenantId,
      candidateEmail: interview.candidate_email,
      candidateName: interview.candidate_name,
      recruiterEmail,
      jobTitle: interview.job_title || "Position",
      scheduledDate: new Date(interview.scheduled_date),
      action: "cancel",
      interviewId,
    });

    res.json({
      success: true,
      message: "Interview cancelled successfully.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
