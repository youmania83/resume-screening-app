// src/lib/email.ts
import nodemailer from "nodemailer";
import crypto from "crypto";
import dns from "dns";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { query } from "./db.js";
import { decrypt } from "./crypto.js";
import { getTenantContext } from "./tenantContext.js";
import { zohoConfig } from "../integrations/zoho/config/zoho.config.js";
import { zohoMailService } from "../integrations/zoho/services/zohoMail.service.js";
import { CircuitBreaker, retryWithBackoff } from "./circuitBreaker.js";
import { buildAssessmentLink, getFallbackHrEmail, hrNotificationsEnabled } from "./appConfig.js";

dotenv.config();

// Create circuit breakers for Resend and SendGrid
const resendBreaker = new CircuitBreaker("Resend-Email-API", {
  failureThreshold: 3,
  recoveryTimeoutMs: 30000,
  requestTimeoutMs: 10000,
  maxConcurrentRequests: 3
});

const sendgridBreaker = new CircuitBreaker("SendGrid-Email-API", {
  failureThreshold: 3,
  recoveryTimeoutMs: 30000,
  requestTimeoutMs: 10000,
  maxConcurrentRequests: 3
});

// Create SMTP transporter using env variables
const getTransporter = async () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // Return null to signify missing config and use fallback logs
    return null;
  }

  try {
    const resolvedIp = await new Promise<string>((resolve, reject) => {
      dns.lookup(host, { family: 4 }, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });

    return nodemailer.createTransport({
      host: resolvedIp,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000, // 10s connection timeout
      socketTimeout: 10000, // 10s socket timeout
      tls: {
        servername: host
      }
    } as any);
  } catch (err) {
    console.error(`Failed to resolve SMTP host ${host} to IPv4:`, err);
    return null;
  }
};

const FROM_EMAIL = process.env.SMTP_FROM || '"Techsol Engineers Recruitment" <recruiting@techsolengineers.com>';

// Ensure logs directory exists for email fallbacks
const ensureLogsDir = () => {
  const dir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "email_logs.txt");
};

// Log email helper
const logEmailFallback = (to: string, subject: string, html: string) => {
  const logFile = ensureLogsDir();
  const timestamp = new Date().toISOString();
  const divider = "=".repeat(80);
  const logContent = `
${divider}
DATE: ${timestamp}
TO: ${to}
SUBJECT: ${subject}
${divider}
${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 1000)}... (Full HTML written)
${divider}
`;
  
  fs.appendFileSync(logFile, logContent, "utf-8");
  console.log(`✉️ [Email Logger] Mock email logged for ${to}. Subject: "${subject}". Details written to: ${logFile}`);
};

/**
 * Escapes characters in a string to prevent XSS/HTML Injection
 */
function escapeHtml(text: string): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function resolveTransporter(tenantId?: string): Promise<{ transporter: any; fromEmail: string }> {
  const resolvedTenantId = tenantId || getTenantContext()?.tenantId;
  const FROM_EMAIL = process.env.SMTP_FROM || '"Techsol Engineers Recruitment" <recruiting@techsolengineers.com>';

  if (resolvedTenantId) {
    try {
      const res = await query("SELECT email_config FROM tenants WHERE id = $1 LIMIT 1", [resolvedTenantId]);
      if (res.rowCount && res.rows[0]?.email_config) {
        const config = typeof res.rows[0].email_config === "string" 
          ? JSON.parse(res.rows[0].email_config)
          : res.rows[0].email_config;

        if (config && config.username) {
          // Auto-override hello@risonaitech.com to Zoho Mail SMTP
          if (config.username === "hello@risonaitech.com" || config.user === "hello@risonaitech.com") {
            config.provider = "zoho";
            config.username = "hr@techsolengineers.com";
            config.user = "hr@techsolengineers.com";
            config.host = "smtp.zoho.com";
            config.port = 587;
            config.fromName = "Techsol Engineers HR";
            config.replyTo = "hr@techsolengineers.com";
            config.password = process.env.ZOHO_SMTP_PASSWORD || "sQL2EaDr3RPP";
            config.pass = process.env.ZOHO_SMTP_PASSWORD || "sQL2EaDr3RPP";
          }

          const decryptedPass = config.username === "hr@techsolengineers.com" 
            ? (process.env.ZOHO_SMTP_PASSWORD || "sQL2EaDr3RPP")
            : decrypt(config.password || config.pass || "");
          const fromName = config.fromName || "Techsol Engineers HR";
          const fromEmail = `"${fromName}" <${config.username}>`;

          if (config.provider === "resend") {
            const transporter = {
              sendMail: async (mailParams: any) => {
                return resendBreaker.execute(async () => {
                  return retryWithBackoff(async () => {
                    console.log(`[Resend HTTP API] Dispatching email to ${mailParams.to}`);
                    const response = await fetch("https://api.resend.com/emails", {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${decryptedPass}`,
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                        from: mailParams.from || fromEmail,
                        to: Array.isArray(mailParams.to) ? mailParams.to : [mailParams.to],
                        subject: mailParams.subject,
                        html: mailParams.html,
                        reply_to: config.replyTo || undefined
                      })
                    });
                    if (!response.ok) {
                      const errText = await response.text();
                      throw new Error(`Resend API Error: ${errText}`);
                    }
                    return await response.json();
                  }, 2, 1000, 2);
                });
              }
            };
            return { transporter, fromEmail };
          }

          if (config.provider === "sendgrid") {
            const transporter = {
              sendMail: async (mailParams: any) => {
                return sendgridBreaker.execute(async () => {
                  return retryWithBackoff(async () => {
                    console.log(`[SendGrid HTTP API] Dispatching email to ${mailParams.to}`);
                    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${decryptedPass}`,
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                        personalizations: [{
                          to: (Array.isArray(mailParams.to) ? mailParams.to : [mailParams.to]).map((email: string) => ({ email }))
                        }],
                        from: {
                          email: config.username,
                          name: fromName || undefined
                        },
                        reply_to: config.replyTo ? { email: config.replyTo } : undefined,
                        subject: mailParams.subject,
                        content: [{
                          type: "text/html",
                          value: mailParams.html
                        }]
                      })
                    });
                    if (!response.ok) {
                      const errText = await response.text();
                      throw new Error(`SendGrid API Error: ${errText}`);
                    }
                    return {};
                  }, 2, 1000, 2);
                });
              }
            };
            return { transporter, fromEmail };
          }

          if (config.host) {
            const resolvedIp = await new Promise<string>((resolve, reject) => {
              dns.lookup(config.host, { family: 4 }, (err, address) => {
                if (err) reject(err);
                else resolve(address);
              });
            });

            const transporter = nodemailer.createTransport({
              host: resolvedIp,
              port: Number(config.port) || 587,
              secure: Number(config.port) === 465,
              auth: {
                user: config.username,
                pass: decryptedPass
              },
              connectionTimeout: 10000, // 10s connection timeout
              socketTimeout: 10000, // 10s socket timeout
              tls: {
                servername: config.host
              }
            } as any);
            return { transporter, fromEmail };
          }
        }
      }
    } catch (err) {
      console.error("Failed to load tenant custom email config, falling back to system defaults:", err);
    }
  }

  // Fallback to env config
  const transporter = await getTransporter();
  return { transporter, fromEmail: FROM_EMAIL };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Email delivery policy
 *
 * Each recruitment stage sends exactly one email. Templates are therefore
 * classified as either ONCE_PER_CANDIDATE (a stage notification that must never
 * repeat) or repeatable-with-cooldown (reminders).
 *
 * The previous policy was the root cause of two production defects:
 *   1. A flat 24-hour dedup window meant every stage email could be re-sent once
 *      a day for as long as the candidate stayed in that stage. Combined with the
 *      30-minute autonomous cycle, shortlisted candidates received a fresh
 *      assessment invitation every single day.
 *   2. A hard lifetime cap of 5 emails per recipient silently swallowed
 *      late-stage notifications (interview schedule, offer) for any candidate who
 *      had already received earlier ones.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Templates that must be delivered at most once per candidate, ever. */
const ONCE_PER_CANDIDATE_TEMPLATES = new Set([
  "application_acknowledgement",
  "assessment_invitation",
  "assessment_results",
  "interview_schedule",
  "offer_letter",
  "candidate_decision",
]);

/** Repeatable templates and their minimum gap between sends, in hours. */
const REPEATABLE_TEMPLATE_COOLDOWN_HOURS: Record<string, number> = {
  assessment_reminder: 20,
  support_ticket: 1,
  restricted_link: 24,
};

/** Absolute safety net against a runaway loop hammering a single recipient. */
const MAX_EMAILS_PER_RECIPIENT_PER_DAY = Number(process.env.MAX_EMAILS_PER_RECIPIENT_PER_DAY) > 0
  ? Number(process.env.MAX_EMAILS_PER_RECIPIENT_PER_DAY)
  : 6;

/** Absolute lifetime ceiling — generous enough to cover the full funnel. */
const MAX_EMAILS_PER_RECIPIENT_LIFETIME = Number(process.env.MAX_EMAILS_PER_RECIPIENT_LIFETIME) > 0
  ? Number(process.env.MAX_EMAILS_PER_RECIPIENT_LIFETIME)
  : 25;

/**
 * Anti-duplicate / anti-spam guard.
 *
 * Returns `canSend: false` (with a reason) when delivering `templateName` to this
 * candidate would produce a duplicate or breach a rate ceiling. Only successful
 * sends (`delivery_status = 'sent'`) count towards duplicate detection, so a
 * failed delivery is correctly retried on the next cycle.
 */
export async function canSendEmailToCandidate(candidateEmail: string, templateName: string, candidateId?: string): Promise<{ canSend: boolean; reason?: string }> {
  if (!candidateEmail || !candidateEmail.trim()) {
    return { canSend: false, reason: "No recipient email address" };
  }

  const emailClean = candidateEmail.trim().toLowerCase();
  if (!emailClean.includes("@") || emailClean.endsWith("@localhost.com") || emailClean.includes("@example.com")) {
    return { canSend: false, reason: `Recipient address "${emailClean}" is not a deliverable address.` };
  }

  // Match on candidate id when we have one, otherwise on the address. Matching on
  // "id OR address" would leak dedup state between distinct candidates that share
  // a shared/team mailbox.
  const identityClause = candidateId
    ? `(candidate_id = $2 OR (candidate_id IS NULL AND LOWER(recipient) = $1))`
    : `LOWER(recipient) = $1`;
  const identityParams = candidateId ? [emailClean, candidateId] : [emailClean];

  try {
    // 1. Per-template idempotency.
    if (ONCE_PER_CANDIDATE_TEMPLATES.has(templateName)) {
      const everSentRes = await query(
        `SELECT COUNT(*)::int as count
           FROM email_logs
          WHERE ${identityClause}
            AND template = $${identityParams.length + 1}
            AND delivery_status = 'sent';`,
        [...identityParams, templateName]
      );
      if ((everSentRes.rows[0]?.count || 0) > 0) {
        return { canSend: false, reason: `Stage email '${templateName}' has already been delivered to this candidate (one-time template).` };
      }
    } else {
      const cooldownHours = REPEATABLE_TEMPLATE_COOLDOWN_HOURS[templateName] ?? 24;
      const recentRes = await query(
        `SELECT COUNT(*)::int as count
           FROM email_logs
          WHERE ${identityClause}
            AND template = $${identityParams.length + 1}
            AND delivery_status = 'sent'
            AND sent_time > (CURRENT_TIMESTAMP - ($${identityParams.length + 2} || ' hours')::interval);`,
        [...identityParams, templateName, String(cooldownHours)]
      );
      if ((recentRes.rows[0]?.count || 0) > 0) {
        return { canSend: false, reason: `Template '${templateName}' was already sent within the last ${cooldownHours}h cooldown.` };
      }
    }

    // 2. Rate ceilings (safety net against runaway loops).
    const volumeRes = await query(
      `SELECT
         COUNT(*)::int AS lifetime,
         COUNT(*) FILTER (WHERE sent_time > CURRENT_TIMESTAMP - INTERVAL '24 hours')::int AS last_day
       FROM email_logs
       WHERE ${identityClause}
         AND delivery_status = 'sent';`,
      identityParams
    );

    const lastDay = volumeRes.rows[0]?.last_day || 0;
    if (lastDay >= MAX_EMAILS_PER_RECIPIENT_PER_DAY) {
      return { canSend: false, reason: `Daily email cap reached for this candidate (${lastDay}/${MAX_EMAILS_PER_RECIPIENT_PER_DAY} in 24h). Anti-spam protection active.` };
    }

    const lifetime = volumeRes.rows[0]?.lifetime || 0;
    if (lifetime >= MAX_EMAILS_PER_RECIPIENT_LIFETIME) {
      return { canSend: false, reason: `Lifetime email cap reached for this candidate (${lifetime}/${MAX_EMAILS_PER_RECIPIENT_LIFETIME}).` };
    }

    return { canSend: true };
  } catch (err: any) {
    console.error("⚠️ Error checking email rate limits:", err.message);
    // Fail closed: a DB hiccup must not turn into a mail storm.
    return { canSend: false, reason: "Email rate check failed due to database error. Blocking to prevent spam." };
  }
}

/**
 * Records an email sending log in PostgreSQL database for anti-spam tracking.
 */
export async function recordEmailLog(candidateId: string | null, recipient: string, subject: string, template: string, tenantId?: string, status: string = 'sent', errorMessage?: string) {
  try {
    let validCandId: string | null = null;
    if (candidateId) {
      const checkCand = await query(`SELECT id FROM candidates WHERE id = $1 LIMIT 1;`, [candidateId]);
      if (checkCand.rowCount && checkCand.rowCount > 0) {
        validCandId = candidateId;
      }
    }

    const id = crypto.randomUUID();
    await query(
      `INSERT INTO email_logs (id, candidate_id, recipient, subject, template, delivery_status, error_message, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [id, validCandId, recipient, subject, template, status, errorMessage || null, tenantId || null]
    );
  } catch (err: any) {
    console.error("⚠️ Failed to record email log:", err.message);
  }
}

/**
 * Send candidate decision notification email (selected, rejected, shortlisted, hold, interviewing)
 */
export async function sendCandidateDecisionEmail(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  decision: string;
  remarks?: string;
  tenantId?: string;
}) {
  const safeName = escapeHtml(params.candidateName);
  const safeJob = escapeHtml(params.jobTitle);
  const safeRemarks = params.remarks ? escapeHtml(params.remarks) : "";
  const decisionLower = params.decision.toLowerCase();

  // Build decision-specific copy
  let headerBg = "";
  let headerSubtitle = "";
  let greeting = "";
  let bodyMessage = "";
  let remarksBlock = "";

  if (decisionLower === "selected" || decisionLower === "hired") {
    headerBg = "linear-gradient(135deg, #059669 0%, #047857 100%)";
    headerSubtitle = "Candidate Selection Notification";
    greeting = `Congratulations, ${safeName}!`;
    bodyMessage = `We are delighted to inform you that you have been <strong>selected</strong> for the <strong>${safeJob}</strong> position at Techsol Engineers. Our HR team will contact you shortly with the next steps regarding your onboarding process.`;
  } else if (decisionLower === "rejected") {
    headerBg = "linear-gradient(135deg, #64748b 0%, #475569 100%)";
    headerSubtitle = "Application Status Update";
    greeting = `Dear ${safeName},`;
    bodyMessage = `Thank you for your interest in the <strong>${safeJob}</strong> position and for the time you invested in our evaluation process. After careful consideration, we regret to inform you that we have decided to move forward with other candidates whose qualifications more closely match the requirements of this role. We encourage you to apply for future openings that align with your skills and experience.`;
  } else if (decisionLower === "shortlisted") {
    headerBg = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
    headerSubtitle = "Shortlist Notification";
    greeting = `Great news, ${safeName}!`;
    bodyMessage = `We are pleased to inform you that your application for the <strong>${safeJob}</strong> position has been <strong>shortlisted</strong>. You have successfully passed our initial screening criteria. Our recruitment team will reach out to you with next steps shortly.`;
  } else if (decisionLower === "interviewing") {
    headerBg = "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)";
    headerSubtitle = "Interview Stage Notification";
    greeting = `Dear ${safeName},`;
    bodyMessage = `Your application for the <strong>${safeJob}</strong> position has progressed to the <strong>interview stage</strong>. Our HR team will contact you shortly with interview scheduling details. Please ensure your contact information is up to date.`;
  } else if (decisionLower === "interview_scheduled") {
    headerBg = "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)";
    headerSubtitle = "Interview Scheduled";
    greeting = `Dear ${safeName},`;
    bodyMessage = `Your HR interview for the <strong>${safeJob}</strong> position has been officially <strong>scheduled</strong>. A calendar invitation with the date, time, and meeting details has been sent to your email. Please check your inbox (and spam/junk folder) for the calendar invite.${safeRemarks ? `<br/><br/><strong>Schedule:</strong> ${safeRemarks}` : ""}`;
  } else if (decisionLower === "hold") {
    headerBg = "linear-gradient(135deg, #d97706 0%, #b45309 100%)";
    headerSubtitle = "Application Status Update";
    greeting = `Dear ${safeName},`;
    bodyMessage = `Thank you for your application for the <strong>${safeJob}</strong> position. Your profile is currently <strong>under review</strong> and has been placed on hold. We will update you as soon as there is further progress on your application.`;
  } else {
    // Generic fallback
    headerBg = "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)";
    headerSubtitle = "Application Status Update";
    greeting = `Dear ${safeName},`;
    bodyMessage = `Your application for the <strong>${safeJob}</strong> position has been updated to: <strong>${escapeHtml(params.decision)}</strong>. Our team will contact you with further details if required.`;
  }

  if (safeRemarks) {
    remarksBlock = `
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; border-left: 4px solid #94a3b8;">
        <p style="font-size: 13px; font-weight: 600; color: #64748b; margin: 0 0 4px 0;">HR Remarks:</p>
        <p style="font-size: 14px; color: #1e293b; margin: 0; line-height: 1.5;">${safeRemarks}</p>
      </div>`;
  }

  const subject = decisionLower === "selected" || decisionLower === "hired"
    ? `Selection Notification: ${safeJob} - Techsol Engineers`
    : decisionLower === "rejected"
    ? `Application Status: ${safeJob} - Techsol Engineers`
    : `Application Status Update: ${safeJob} - Techsol Engineers`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Application Status</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: ${headerBg}; padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; }
        .header p { color: rgba(255,255,255,0.8); font-size: 13px; margin: 8px 0 0 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.7; color: #475569; margin: 16px 0; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Techsol Engineers</h1>
          <p>${headerSubtitle}</p>
        </div>
        <div class="content">
          <p class="greeting">${greeting}</p>
          <p class="message">${bodyMessage}</p>
          ${remarksBlock}
          <p class="message" style="font-size: 13px; color: #94a3b8; margin-top: 28px;">If you have any questions, please reach out to our recruitment team.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
          <p style="font-size: 10px; color: #94a3b8; margin-top: 6px;">Powered by IRA from Rison Ai Tech</p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (zohoConfig.enabled) {
    await zohoMailService.sendEmail(params.candidateEmail, subject, html);
    return { success: true, mock: false };
  }

  const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
  if (!transporter) {
    logEmailFallback(params.candidateEmail, subject, html);
    return { success: true, mock: true };
  }

  await transporter.sendMail({
    from: fromEmail,
    to: params.candidateEmail,
    subject,
    html,
  });

  console.log(`📧 Decision email (${params.decision}) sent to ${params.candidateEmail}`);
  return { success: true, mock: false };
}

/**
 * Send candidate assessment invite email
 */
export async function sendAssessmentInviteEmail(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  token: string;
  expiryDate: Date;
  tenantId?: string;
  candidateId?: string;
  /** Set true only when the caller has already run canSendEmailToCandidate. */
  skipGuard?: boolean;
}) {
  const safeCandidateName = escapeHtml(params.candidateName);
  const safeJobTitle = escapeHtml(params.jobTitle);

  if (!params.token) {
    throw new Error("Cannot send an assessment invitation without an assessment token.");
  }

  // Self-guard: this sender is invoked from the resume worker, the 30-minute
  // autonomous cycle and manual HR actions. Guarding here (rather than only at
  // each call site) is what makes the invitation exactly-once.
  if (!params.skipGuard) {
    const guard = await canSendEmailToCandidate(params.candidateEmail, "assessment_invitation", params.candidateId);
    if (!guard.canSend) {
      console.log(`⏭️ [Email] Skipping assessment invitation to ${params.candidateEmail}: ${guard.reason}`);
      return { success: false, mock: false, skipped: true, reason: guard.reason };
    }
  }

  const assessmentLink = buildAssessmentLink(params.token);
  const formattedExpiry = params.expiryDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = `Assessment Invitation: ${safeJobTitle} Role - Techsol Engineers`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Assessment Invitation</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px border #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; tracking: -0.025em; }
        .header p { color: #94a3b8; font-size: 13px; margin: 8px 0 0 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.6; color: #475569; margin: 16px 0; }
        .details-box { background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #0f172a; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-label { font-weight: 600; color: #64748b; }
        .detail-val { font-weight: 700; color: #0f172a; text-align: right; }
        .btn-container { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background-color: #0f172a; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.15); transition: background-color 0.2s; }
        .btn:hover { background-color: #1e293b; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Techsol Engineers</h1>
          <p>Candidate Assessment Portal</p>
        </div>
        <div class="content">
          <p class="greeting">Hello ${safeCandidateName},</p>
          <p class="message">Thank you for your interest in the <strong>${safeJobTitle}</strong> position. Your resume matching evaluation has passed our initial screening filters. We are pleased to invite you to the next stage of our recruitment process: a short technical assessment.</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Role:</span>
              <span class="detail-val">${safeJobTitle}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time Limit:</span>
              <span class="detail-val">15 Minutes (15 MCQs)</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Deadline:</span>
              <span class="detail-val">${formattedExpiry}</span>
            </div>
          </div>
          
          <p class="message">Please complete this assessment in a quiet, distraction-free environment. Ensure you have a stable internet connection. Note that browser focus loss, tab switching, and exiting full-screen mode will be monitored and flagged by our cheating prevention safeguards.</p>
          
          <div class="btn-container">
            <a href="${assessmentLink}" class="btn" target="_blank">Start Assessment</a>
          </div>
          
          <p class="message" style="font-size: 12px; color: #64748b; text-align: center;">If the button above does not work, copy and paste this URL into your browser:<br>${assessmentLink}</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
          <p>This is an automated message. Please do not reply directly to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    if (zohoConfig.enabled) {
      await zohoMailService.sendEmail(params.candidateEmail, subject, html);
      await recordEmailLog(params.candidateId || null, params.candidateEmail, subject, "assessment_invitation", params.tenantId, "sent");
      console.log(`📧 Invitation email sent successfully to ${params.candidateEmail} (Zoho Mail)`);
      return { success: true, mock: false };
    }

    const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
    if (!transporter) {
      logEmailFallback(params.candidateEmail, subject, html);
      // A file-log fallback is NOT a delivery: record it as failed so the real
      // invitation is retried once SMTP is configured.
      await recordEmailLog(
        params.candidateId || null,
        params.candidateEmail,
        subject,
        "assessment_invitation",
        params.tenantId,
        "failed",
        "No SMTP transport configured; email written to local fallback log only."
      );
      return { success: false, mock: true };
    }

    await transporter.sendMail({
      from: fromEmail,
      to: params.candidateEmail,
      subject,
      html,
    });

    await recordEmailLog(params.candidateId || null, params.candidateEmail, subject, "assessment_invitation", params.tenantId, "sent");
    console.log(`📧 Invitation email sent successfully to ${params.candidateEmail}`);
    return { success: true, mock: false };
  } catch (err: any) {
    await recordEmailLog(
      params.candidateId || null,
      params.candidateEmail,
      subject,
      "assessment_invitation",
      params.tenantId,
      "failed",
      err?.message || String(err)
    );
    throw err;
  }
}

/**
 * Send automated HR interview invite email to candidate and HR
 */
export async function sendInterviewScheduleEmail(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  resumeScore: number;
  assessmentScore: number;
  finalScore: number;
  scheduledDate: Date;
  hrEmail?: string;
  tenantId?: string;
  candidateId?: string;
  /** Stable interview id — used as the iCalendar UID so reschedules update the
   *  existing calendar entry instead of creating a duplicate. */
  interviewId?: string;
  /** Set true only when the caller has already run canSendEmailToCandidate. */
  skipGuard?: boolean;
}) {
  const safeCandidateName = escapeHtml(params.candidateName);
  const safeJobTitle = escapeHtml(params.jobTitle);

  if (!params.skipGuard) {
    const guard = await canSendEmailToCandidate(params.candidateEmail, "interview_schedule", params.candidateId);
    if (!guard.canSend) {
      console.log(`⏭️ [Email] Skipping interview schedule email to ${params.candidateEmail}: ${guard.reason}`);
      return { success: false, mock: false, skipped: true, reason: guard.reason };
    }
  }

  const formattedDate = params.scheduledDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = params.scheduledDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const candidateSubject = `HR Interview Scheduled: ${safeJobTitle} Role - Techsol Engineers`;
  const hrSubject = `[ALERT] Qualified Candidate: HR Interview Scheduled for ${safeCandidateName}`;

  // 1. HTML Email for Candidate
  const candidateHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>HR Interview Scheduled</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; tracking: -0.025em; }
        .header p { color: #a7f3d0; font-size: 13px; margin: 8px 0 0 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.6; color: #475569; margin: 16px 0; }
        .details-box { background-color: #f0fdf4; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #059669; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-label { font-weight: 600; color: #34d399; }
        .detail-label-dark { font-weight: 600; color: #065f46; }
        .detail-val { font-weight: 700; color: #065f46; text-align: right; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Techsol Engineers</h1>
          <p>Interview Scheduling Automation</p>
        </div>
        <div class="content">
          <p class="greeting">Congratulations, ${safeCandidateName}!</p>
          <p class="message">We are thrilled to inform you that you have passed our technical assessment stage. Your final integrated matching score has exceeded our benchmark. An interview has been automatically scheduled for you with our HR Manager.</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label-dark">Interview Date:</span>
              <span class="detail-val">${formattedDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label-dark">Interview Time:</span>
              <span class="detail-val">${formattedTime}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label-dark">Role:</span>
              <span class="detail-val">${safeJobTitle}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label-dark">Format:</span>
              <span class="detail-val">Video Call (Google Meet link will follow)</span>
            </div>
          </div>
          
          <p class="message">Our HR team will reach out with calendar link details shortly. If this slot does not work for you, please contact us at support@techsolengineers.com to reschedule.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // 2. HTML Email for HR
  const hrHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Qualified Candidate Alert</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; }
        .header p { color: #c7d2fe; font-size: 13px; margin: 8px 0 0 0; text-transform: uppercase; letter-spacing: 0.05em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.6; color: #475569; margin: 16px 0; }
        .score-box { background-color: #f5f3ff; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #4f46e5; }
        .score-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
        .score-row:last-child { margin-bottom: 0; }
        .score-label { font-weight: 600; color: #4f46e5; }
        .score-val { font-weight: 700; color: #1e1b4b; text-align: right; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Qualified Candidate Alert</h1>
          <p>ATS Automated Ranking System</p>
        </div>
        <div class="content">
          <p class="greeting">Hi HR Recruiter Yogesh Wadhwa,</p>
          <p class="message">A candidate has achieved <strong>QUALIFIED</strong> status by passing both stages of the screening funnel. The HR interview has been automatically scheduled.</p>
          
          <div class="score-box">
            <div class="score-row">
              <span class="score-label">Candidate Name:</span>
              <span class="score-val">${safeCandidateName}</span>
            </div>
            <div class="score-row">
              <span class="score-label">Job Role:</span>
              <span class="score-val">${safeJobTitle}</span>
            </div>
            <div class="score-row">
              <span class="score-label">Resume Match Score:</span>
              <span class="score-val">${params.resumeScore}% (40% Weight)</span>
            </div>
            <div class="score-row">
              <span class="score-label">Assessment Score:</span>
              <span class="score-val">${params.assessmentScore}% (60% Weight)</span>
            </div>
            <div class="score-row" style="border-top: 1px solid #ddd; padding-top: 8px; margin-top: 8px;">
              <span class="score-label" style="font-size: 16px; color: #4338ca;">Final Integrated Score:</span>
              <span class="score-val" style="font-size: 16px; color: #1e1b4b;">${params.finalScore.toFixed(1)}%</span>
            </div>
            <div class="score-row">
              <span class="score-label">Scheduled Slot:</span>
              <span class="score-val">${formattedDate} at ${formattedTime}</span>
            </div>
          </div>
          
          <p class="message">No actions are required at this stage. The candidate record has been marked as <strong>interviewing</strong>, and details are logged in the assessment dashboard.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const csContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Techsol Engineers//Recruitment Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:interview-${params.interviewId || params.candidateId || Date.now()}@techsolengineers.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART:${params.scheduledDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTEND:${new Date(params.scheduledDate.getTime() + 30 * 60000).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `SUMMARY:HR Interview - ${safeJobTitle} at Techsol Engineers`,
    `DESCRIPTION:HR Interview scheduled for candidate ${safeCandidateName} for position ${safeJobTitle}.`,
    "LOCATION:Google Meet / Video Call",
    `ORGANIZER;CN=Techsol Engineers HR:mailto:${params.hrEmail || "hr@techsolengineers.com"}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${safeCandidateName}:mailto:${params.candidateEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const isHrNotificationEnabled = hrNotificationsEnabled();
  const hrRecipient = isHrNotificationEnabled
    ? (params.hrEmail || process.env.RECRUITER_NOTIFICATION_EMAIL || getFallbackHrEmail() || undefined)
    : undefined;
  const hrRecipientValid = hrRecipient && hrRecipient.includes("@") && !hrRecipient.endsWith("@localhost.com")
    ? hrRecipient
    : undefined;

  try {
    if (zohoConfig.enabled) {
      await zohoMailService.sendEmail(params.candidateEmail, candidateSubject, candidateHtml);
      await recordEmailLog(params.candidateId || null, params.candidateEmail, candidateSubject, "interview_schedule", params.tenantId, "sent");
      if (hrRecipientValid) {
        await zohoMailService.sendEmail(hrRecipientValid, hrSubject, hrHtml);
      }
      return { success: true, mock: false };
    }

    const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
    if (!transporter) {
      logEmailFallback(params.candidateEmail, candidateSubject, candidateHtml);
      if (hrRecipientValid) {
        logEmailFallback(hrRecipientValid, hrSubject, hrHtml);
      }
      await recordEmailLog(
        params.candidateId || null,
        params.candidateEmail,
        candidateSubject,
        "interview_schedule",
        params.tenantId,
        "failed",
        "No SMTP transport configured; email written to local fallback log only."
      );
      return { success: false, mock: true };
    }

    // Send to candidate with calendar invite attachment
    await transporter.sendMail({
      from: fromEmail,
      to: params.candidateEmail,
      subject: candidateSubject,
      html: candidateHtml,
      icalEvent: {
        filename: "invite.ics",
        method: "REQUEST",
        content: csContent
      },
      attachments: [
        {
          filename: "invite.ics",
          content: csContent,
          contentType: "text/calendar; method=REQUEST"
        }
      ]
    });

    await recordEmailLog(params.candidateId || null, params.candidateEmail, candidateSubject, "interview_schedule", params.tenantId, "sent");

    // Send to HR if explicitly enabled. A failure here must not mark the
    // candidate-facing delivery as failed (which would trigger a re-send).
    if (hrRecipientValid) {
      try {
        await transporter.sendMail({
          from: fromEmail,
          to: hrRecipientValid,
          subject: hrSubject,
          html: hrHtml,
        });
        console.log(`📧 Interview scheduled emails sent with .ics calendar invite to candidate (${params.candidateEmail}) and HR (${hrRecipientValid})`);
      } catch (hrErr: any) {
        console.error(`⚠️ Candidate interview email delivered, but the HR copy to ${hrRecipientValid} failed:`, hrErr?.message || hrErr);
      }
    } else {
      console.log(`📧 Interview scheduled email sent to candidate (${params.candidateEmail}) [HR Email Notification Deactivated]`);
    }

    return { success: true, mock: false };
  } catch (err: any) {
    await recordEmailLog(
      params.candidateId || null,
      params.candidateEmail,
      candidateSubject,
      "interview_schedule",
      params.tenantId,
      "failed",
      err?.message || String(err)
    );
    throw err;
  }
}

/**
 * Send Offer Letter / Selection Notification Email
 */
export async function sendOfferLetterEmail(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  tenantId?: string;
}) {
  return sendCandidateDecisionEmail({
    candidateName: params.candidateName,
    candidateEmail: params.candidateEmail,
    jobTitle: params.jobTitle,
    decision: "selected",
    remarks: "Congratulations! Our HR team will reach out with your formal Offer Letter and onboarding documentation.",
    tenantId: params.tenantId
  });
}

/**
 * Sends an email notification when a support ticket is filed
 */
export async function sendSupportTicketNotification(params: {
  tenantId: string | null;
  ticketId: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: string;
  source: string;
}) {
  const { tenantId, name, email, subject, message, priority, source } = params;

  try {
    let recipientEmails: string[] = [];

    // Find recruiters/owners for this tenant to notify
    if (tenantId) {
      const usersRes = await query(
        "SELECT email FROM users WHERE tenant_id = $1 AND role IN ('owner', 'recruiter');",
        [tenantId]
      );
      if (usersRes.rowCount && usersRes.rowCount > 0) {
        recipientEmails = usersRes.rows.map((u: any) => u.email);
      }
    }

    // Always copy the system developer / platform admin on all support ticket alerts
    const developerEmail = "hello@risonaitech.com";
    if (!recipientEmails.includes(developerEmail)) {
      recipientEmails.push(developerEmail);
    }

    // Default system support fallback if no specific tenant emails found
    if (recipientEmails.length === 0) {
      recipientEmails = [process.env.SMTP_USER || "support@techsolengineers.com"];
    }

    const { transporter, fromEmail } = await resolveTransporter(tenantId || undefined);

    if (!transporter) {
      console.warn("⚠️ [Email Notification] No SMTP transporter configured. Support ticket logged in DB only.");
      return;
    }

    const recipientCsv = recipientEmails.join(", ");
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 24px; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; margin-top: 0; font-size: 18px; font-weight: 800;">New Support Ticket</h2>
        <p style="font-size: 13px; color: #334155;">A new support request was submitted by a <strong>${source}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Submitted By</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-size: 12px; color: #0f172a; font-weight: 600;">${name} (${email})</td>
          </tr>
          <tr>
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Subject</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-size: 12px; font-weight: bold; color: #0f172a;">${subject}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <th style="padding: 10px; border: 1px solid #e2e8f0; text-align: left; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Priority</th>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-size: 12px; color: #ef4444; font-weight: bold; text-transform: uppercase;">${priority}</td>
          </tr>
        </table>
        
        <div style="background-color: #f1f5f9; padding: 18px; border-radius: 8px; font-size: 12px; color: #334155; line-height: 1.6; white-space: pre-wrap; margin-bottom: 20px; font-family: monospace; border: 1px solid #e2e8f0;">
${message}
        </div>
        
        <p style="font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; pt-15; margin-top: 20px;">You can view and manage this ticket directly under <strong>Workspace Settings -> Support Tickets</strong> in your admin console.</p>
      </div>
    `;

    await transporter.sendMail({
      from: fromEmail,
      to: recipientCsv,
      subject: `[Support Ticket] ${priority.toUpperCase()}: ${subject}`,
      html: htmlContent
    });

    console.log(`✉️ [Email Notification] Support ticket notification dispatched to ${recipientCsv}`);
  } catch (err: any) {
    console.error("🚨 [Email Notification] Error dispatching support ticket email:", err);
  }
}

/**
 * Sends a restricted cloud link notification email to candidates.
 */
export async function sendRestrictedLinkEmail(params: {
  tenantId: string;
  candidateEmail: string;
  candidateName: string;
}): Promise<void> {
  const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
  const subject = "Urgent: We couldn't access your resume link";
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #1e293b;">
      <h2 style="color: #0f172a;">Hi ${escapeHtml(params.candidateName)},</h2>
      <p>We received your application, but we couldn't access your resume because the shared link is restricted or requires login.</p>
      <div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 15px 0;">
        <p style="margin: 0; font-weight: 500;">
          "We couldn't access your resume because the shared link is restricted or requires login. 
          Please upload the PDF or DOCX directly or update the sharing permission to 'Anyone with the link can view.'"
        </p>
      </div>
      <p>Please update the sharing permissions on your link, or respond directly to this email attaching your resume in PDF/DOCX format.</p>
      <br/>
      <p>Best regards,<br/>Recruitment Team</p>
    </div>
  `;

  if (!transporter) {
    logEmailFallback(params.candidateEmail, subject, html);
    return;
  }

  try {
    await transporter.sendMail({
      from: fromEmail,
      to: params.candidateEmail,
      subject,
      html
    });
    console.log(`✉️ Link failure alert email successfully sent to: ${params.candidateEmail}`);
  } catch (err) {
    console.error("Failed to dispatch restricted link notification email:", err);
    logEmailFallback(params.candidateEmail, subject, html);
  }
}

/**
 * Send application acknowledgement email immediately after receiving the application
 */
export async function sendApplicationAcknowledgementEmail(params: {
  candidateName: string;
  candidateEmail: string;
  tenantId?: string;
  candidateId?: string;
}): Promise<void> {
  const safeCandidateName = escapeHtml(params.candidateName);
  const subject = "Application Received – Next Steps";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Application Received</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; tracking: -0.025em; }
        .header p { color: #94a3b8; font-size: 13px; margin: 8px 0 0 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.6; color: #475569; margin: 16px 0; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Techsol Engineers</h1>
          <p>Application Status</p>
        </div>
        <div class="content">
          <p class="greeting">Dear ${safeCandidateName},</p>
          
          <p class="message">Thank you for your interest in joining Techsol Engineers. We have successfully received your application.</p>
          
          <p class="message">Our recruitment team will review your profile. If your profile is shortlisted, an AI Assessment link will be sent to your registered email address on the same day.</p>
          
          <p class="message">Kindly complete the assessment at the earliest. The assessment link will remain active for 7 days from the time it is issued. If the assessment is not completed within this period, the link will automatically expire, and your application will be placed on hold.</p>
          
          <p class="message">As we receive a high volume of applications, candidates who complete the assessment early and successfully qualify will be given priority during the interview scheduling process. Early completion helps us process your application faster.</p>
          
          <p class="message">Upon successfully clearing the assessment, you will receive an email containing an interview scheduling link, allowing you to select a convenient interview slot based on availability.</p>
          
          <p class="message">Our recruitment process is designed to ensure a smooth, transparent, and efficient experience for both applicants and our hiring team. We kindly request your cooperation by completing each stage of the process within the specified timelines.</p>
          
          <p class="message">We appreciate your interest in Techsol Engineers and wish you the very best.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
          <p>HR Team - Techsol Engineers</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const checkRate = await canSendEmailToCandidate(params.candidateEmail, "application_acknowledgement", params.candidateId);
  if (!checkRate.canSend) {
    console.log(`⏭️ Anti-spam active for ${params.candidateEmail}: ${checkRate.reason}. Skipping application acknowledgement email.`);
    return;
  }

  let sentStatus = "sent";
  let errMessage: string | undefined = undefined;

  try {
    if (zohoConfig.enabled) {
      await zohoMailService.sendEmail(params.candidateEmail, subject, html);
    } else {
      const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
      if (!transporter) {
        logEmailFallback(params.candidateEmail, subject, html);
      } else {
        await transporter.sendMail({
          from: fromEmail,
          to: params.candidateEmail,
          subject,
          html,
        });
      }
    }
  } catch (err: any) {
    sentStatus = "failed";
    errMessage = err.message || "Email send failed";
    console.error(`🚨 Failed to send application acknowledgement to ${params.candidateEmail}:`, err.message);
  } finally {
    await recordEmailLog(params.candidateId || null, params.candidateEmail, subject, "application_acknowledgement", params.tenantId, sentStatus, errMessage);
  }
  console.log(`✉️ Application acknowledgement email processed for: ${params.candidateEmail}`);
}


/**
 * Send AI assessment reminder email to shortlisted candidates who haven't completed the test
 */
export async function sendAssessmentReminderEmail(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  token: string;
  remainingDays: number;
  tenantId?: string;
}): Promise<void> {
  const safeCandidateName = escapeHtml(params.candidateName);
  const safeJobTitle = escapeHtml(params.jobTitle);
  const { remainingDays, token } = params;

  const assessmentLink = buildAssessmentLink(token);
  const subject = "Reminder – AI Assessment Pending";

  const daysLabel = remainingDays === 1 ? "day" : "days";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>AI Assessment Pending</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; tracking: -0.025em; }
        .header p { color: #94a3b8; font-size: 13px; margin: 8px 0 0 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.6; color: #475569; margin: 16px 0; }
        .details-box { background-color: #fffbeb; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #d97706; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-label { font-weight: 600; color: #92400e; }
        .detail-val { font-weight: 700; color: #92400e; text-align: right; }
        .btn-container { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background-color: #0f172a; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.15); transition: background-color 0.2s; }
        .btn:hover { background-color: #1e293b; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Techsol Engineers</h1>
          <p>Candidate Assessment Portal</p>
        </div>
        <div class="content">
          <p class="greeting">Dear Applicant,</p>
          
          <p class="message">This is a friendly reminder that your AI Assessment link has already been sent to your registered email address.</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Role:</span>
              <span class="detail-val">${safeJobTitle}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time Remaining:</span>
              <span class="detail-val" style="font-weight: 800;">${remainingDays} ${daysLabel}</span>
            </div>
          </div>
          
          <p class="message">Your assessment link will expire in <strong>${remainingDays} ${daysLabel}</strong> if it is not completed. Once expired, your application will be placed on hold and cannot proceed to the next stage of the recruitment process until further review.</p>
          
          <p class="message">As interview scheduling is based on assessment completion and qualification, we encourage you to complete the assessment at the earliest to avoid any delay in processing your application.</p>
          
          <div class="btn-container">
            <a href="${assessmentLink}" class="btn" target="_blank">Start Assessment</a>
          </div>
          
          <p class="message" style="font-size: 12px; color: #64748b; text-align: center;">If the button above does not work, copy and paste this URL into your browser:<br>${assessmentLink}</p>
          
          <p class="message">Thank you, and we look forward to your participation.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
          <p>HR Team - Techsol Engineers</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const guard = await canSendEmailToCandidate(params.candidateEmail, "assessment_reminder", (params as any).candidateId);
  if (!guard.canSend) {
    console.log(`⏭️ [Email] Skipping assessment reminder to ${params.candidateEmail}: ${guard.reason}`);
    return;
  }

  if (zohoConfig.enabled) {
    await zohoMailService.sendEmail(params.candidateEmail, subject, html);
    await recordEmailLog((params as any).candidateId || null, params.candidateEmail, subject, "assessment_reminder", params.tenantId, "sent");
    return;
  }

  const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
  if (!transporter) {
    logEmailFallback(params.candidateEmail, subject, html);
    await recordEmailLog(
      (params as any).candidateId || null,
      params.candidateEmail,
      subject,
      "assessment_reminder",
      params.tenantId,
      "failed",
      "No SMTP transport configured; email written to local fallback log only."
    );
    return;
  }

  try {
    await transporter.sendMail({
      from: fromEmail,
      to: params.candidateEmail,
      subject,
      html
    });
    await recordEmailLog((params as any).candidateId || null, params.candidateEmail, subject, "assessment_reminder", params.tenantId, "sent");
    console.log(`✉️ Assessment reminder email successfully sent to: ${params.candidateEmail}`);
  } catch (err: any) {
    console.error("Failed to dispatch assessment reminder email:", err);
    logEmailFallback(params.candidateEmail, subject, html);
    await recordEmailLog(
      (params as any).candidateId || null,
      params.candidateEmail,
      subject,
      "assessment_reminder",
      params.tenantId,
      "failed",
      err?.message || String(err)
    );
  }
}

/**
 * Send detailed assessment result email containing questions, correct options, candidate selections, and score calculations to candidate and HR.
 */
export async function sendAssessmentResultDetailsEmail(params: {
  candidateName: string;
  candidateEmail: string;
  hrEmail: string;
  jobTitle: string;
  resumeScore: number;
  assessmentScore: number;
  finalScore: number;
  questions: any[];
  candidateAnswers: any;
  tenantId?: string;
}): Promise<void> {
  const safeCandidateName = escapeHtml(params.candidateName);
  const safeJobTitle = escapeHtml(params.jobTitle);
  const subject = `AI Assessment Details: ${safeCandidateName} - ${safeJobTitle}`;

  // Compile questions markup
  let questionsHtml = "";
  params.questions.forEach((q, idx) => {
    const candidateSelected = params.candidateAnswers[q.id] || "";
    const isCorrect = candidateSelected.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();

    let optionsListHtml = "";
    q.options.forEach((opt: string, optIdx: number) => {
      const optLetter = ["A", "B", "C", "D"][optIdx] || "";
      const isThisCorrect = opt.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
      const isThisSelected = opt.trim().toLowerCase() === candidateSelected.trim().toLowerCase();

      let optionStyle = "padding: 10px 12px; margin: 6px 0; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 14px;";
      let badgeHtml = "";

      if (isThisCorrect) {
        optionStyle += " background-color: #ecfdf5; border-color: #10b981; color: #065f46; font-weight: 600;";
        badgeHtml = `<span style="float: right; font-size: 11px; background-color: #10b981; color: white; padding: 2px 8px; border-radius: 12px; text-transform: uppercase; font-weight: 700;">Correct Option</span>`;
      } else if (isThisSelected && !isCorrect) {
        optionStyle += " background-color: #fef2f2; border-color: #ef4444; color: #991b1b; text-decoration: line-through;";
        badgeHtml = `<span style="float: right; font-size: 11px; background-color: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; text-transform: uppercase; font-weight: 700;">Selected (Incorrect)</span>`;
      } else if (isThisSelected) {
        optionStyle += " background-color: #ecfdf5; border-color: #10b981; color: #065f46; font-weight: 600;";
      }

      optionsListHtml += `
        <div style="${optionStyle}">
          <strong>${optLetter}.</strong> ${escapeHtml(opt)}
          ${badgeHtml}
          <div style="clear: both;"></div>
        </div>
      `;
    });

    const questionStatusText = isCorrect 
      ? `<span style="background-color: #d1fae5; color: #065f46; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 12px;">✅ Correct</span>`
      : (candidateSelected 
        ? `<span style="background-color: #fee2e2; color: #991b1b; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 12px;">❌ Incorrect</span>`
        : `<span style="background-color: #f1f5f9; color: #475569; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 12px;">⚠️ Unanswered</span>`);

    questionsHtml += `
      <div style="margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Question ${idx + 1} (${escapeHtml(q.topic || "General")})</span>
          ${questionStatusText}
        </div>
        <p style="font-size: 15px; font-weight: 600; color: #0f172a; margin: 0 0 14px 0; line-height: 1.5;">${escapeHtml(q.question_text)}</p>
        <div>${optionsListHtml}</div>
      </div>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Assessment Details Report</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 650px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 700; tracking: -0.025em; }
        .header p { color: #94a3b8; font-size: 13px; margin: 8px 0 0 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.6; color: #475569; margin: 16px 0; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Techsol Engineers</h1>
          <p>AI Assessment Performance Report</p>
        </div>
        <div class="content">
          <p class="greeting">Hello,</p>
          <p class="message">Here are the detailed performance results and score calculation for candidate <strong>${safeCandidateName}</strong>'s AI Assessment for the <strong>${safeJobTitle}</strong> position.</p>
          
          <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 20px; margin: 24px 0;">
            <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 700; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Score Summary</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
              <span style="color: #64748b; font-weight: 600;">Resume Match Score (40% Weight):</span>
              <span style="color: #0f172a; font-weight: 700;">${params.resumeScore}%</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
              <span style="color: #64748b; font-weight: 600;">Assessment MCQ Score (60% Weight):</span>
              <span style="color: #0f172a; font-weight: 700;">${params.assessmentScore}%</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 16px;">
              <span style="color: #0f172a; font-weight: 800;">Final Integrated Score:</span>
              <span style="color: #2563eb; font-weight: 800;">${params.finalScore}%</span>
            </div>
            <p style="font-size: 11px; color: #94a3b8; margin: 8px 0 0 0; text-align: right;">Formula: (Resume Match * 0.4) + (Assessment Score * 0.6)</p>
          </div>

          <h3 style="margin-top: 40px; color: #0f172a; font-size: 16px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 24px;">Question by Question Breakdown</h3>
          <div>
            ${questionsHtml}
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
          <p>This is an automated system notification. Powered by IRA.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // One-time guard so a re-submitted / re-processed assessment cannot mail the
  // candidate their results report twice.
  const candidateId = (params as any).candidateId as string | undefined;
  const guard = await canSendEmailToCandidate(params.candidateEmail, "assessment_results", candidateId);
  if (!guard.canSend) {
    console.log(`⏭️ [Email] Skipping detailed results email to ${params.candidateEmail}: ${guard.reason}`);
    return;
  }

  // Build the recipient list. Explicitly typed as string[] so the optional HR
  // copy cannot leak a null into the delivery loop.
  const recipients: string[] = [params.candidateEmail];
  if (hrNotificationsEnabled()) {
    const hr = params.hrEmail || getFallbackHrEmail();
    if (hr && hr.trim() && hr.includes("@") && !hr.endsWith("@localhost.com")) {
      recipients.push(hr.trim());
    }
  }

  for (const to of recipients) {
    const isCandidate = to === params.candidateEmail;

    if (zohoConfig.enabled) {
      try {
        await zohoMailService.sendEmail(to, subject, html);
        if (isCandidate) {
          await recordEmailLog(candidateId || null, to, subject, "assessment_results", params.tenantId, "sent");
        }
        console.log(`✉️ Detailed results email successfully sent to ${to} (Zoho Mail)`);
      } catch (err: any) {
        console.error(`Failed to dispatch detailed results email to ${to} via Zoho:`, err);
        if (isCandidate) {
          await recordEmailLog(candidateId || null, to, subject, "assessment_results", params.tenantId, "failed", err?.message || String(err));
        }
      }
      continue;
    }

    const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
    if (!transporter) {
      logEmailFallback(to, subject, html);
      if (isCandidate) {
        await recordEmailLog(
          candidateId || null,
          to,
          subject,
          "assessment_results",
          params.tenantId,
          "failed",
          "No SMTP transport configured; email written to local fallback log only."
        );
      }
      continue;
    }

    try {
      await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        html
      });
      if (isCandidate) {
        await recordEmailLog(candidateId || null, to, subject, "assessment_results", params.tenantId, "sent");
      }
      console.log(`✉️ Detailed results email successfully sent to: ${to}`);
    } catch (err: any) {
      console.error(`Failed to dispatch detailed results email to ${to}:`, err);
      logEmailFallback(to, subject, html);
      if (isCandidate) {
        await recordEmailLog(candidateId || null, to, subject, "assessment_results", params.tenantId, "failed", err?.message || String(err));
      }
    }
  }
}




