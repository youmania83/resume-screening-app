// src/lib/email.ts
import nodemailer from "nodemailer";
import dns from "dns";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { query } from "./db.js";
import { decrypt } from "./crypto.js";
import { getTenantContext } from "./tenantContext.js";
import { zohoConfig } from "../integrations/zoho/config/zoho.config";
import { zohoMailService } from "../integrations/zoho/services/zohoMail.service";

dotenv.config();

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

const FROM_EMAIL = process.env.SMTP_FROM || '"Techsole Engineers Recruitment" <recruiting@techsoleengineers.com>';

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
  const FROM_EMAIL = process.env.SMTP_FROM || '"Techsole Engineers Recruitment" <recruiting@techsoleengineers.com>';

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
            config.fromName = "Techsole Engineers HR";
            config.replyTo = "hr@techsolengineers.com";
            config.password = process.env.ZOHO_SMTP_PASSWORD || "sQL2EaDr3RPP";
            config.pass = process.env.ZOHO_SMTP_PASSWORD || "sQL2EaDr3RPP";
          }

          const decryptedPass = config.username === "hr@techsolengineers.com" 
            ? (process.env.ZOHO_SMTP_PASSWORD || "sQL2EaDr3RPP")
            : decrypt(config.password || config.pass || "");
          const fromName = config.fromName || "Techsole Engineers HR";
          const fromEmail = `"${fromName}" <${config.username}>`;

          if (config.provider === "resend") {
            const transporter = {
              sendMail: async (mailParams: any) => {
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
              }
            };
            return { transporter, fromEmail };
          }

          if (config.provider === "sendgrid") {
            const transporter = {
              sendMail: async (mailParams: any) => {
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
    bodyMessage = `We are delighted to inform you that you have been <strong>selected</strong> for the <strong>${safeJob}</strong> position at Techsole Engineers. Our HR team will contact you shortly with the next steps regarding your onboarding process.`;
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
    ? `Selection Notification: ${safeJob} - Techsole Engineers`
    : decisionLower === "rejected"
    ? `Application Status: ${safeJob} - Techsole Engineers`
    : `Application Status Update: ${safeJob} - Techsole Engineers`;

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
          <h1>Techsole Engineers</h1>
          <p>${headerSubtitle}</p>
        </div>
        <div class="content">
          <p class="greeting">${greeting}</p>
          <p class="message">${bodyMessage}</p>
          ${remarksBlock}
          <p class="message" style="font-size: 13px; color: #94a3b8; margin-top: 28px;">If you have any questions, please reach out to our recruitment team.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsole Engineers. All rights reserved.</p>
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
}) {
  const safeCandidateName = escapeHtml(params.candidateName);
  const safeJobTitle = escapeHtml(params.jobTitle);

  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const assessmentLink = `${portalUrl}/assessment/${params.token}`;
  const formattedExpiry = params.expiryDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = `Assessment Invitation: ${safeJobTitle} Role - Techsole Engineers`;
  
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
          <h1>Techsole Engineers</h1>
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
              <span class="detail-val">15 Minutes (10 MCQs)</span>
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
          <p>&copy; 2026 Techsole Engineers. All rights reserved.</p>
          <p>This is an automated message. Please do not reply directly to this email.</p>
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

  console.log(`📧 Invitation email sent successfully to ${params.candidateEmail}`);
  return { success: true, mock: false };
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
  hrEmail: string;
  tenantId?: string;
}) {
  const safeCandidateName = escapeHtml(params.candidateName);
  const safeJobTitle = escapeHtml(params.jobTitle);

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

  const candidateSubject = `HR Interview Scheduled: ${safeJobTitle} Role - Techsole Engineers`;
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
          <h1>Techsole Engineers</h1>
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
          
          <p class="message">Our HR team will reach out with calendar link details shortly. If this slot does not work for you, please contact us at support@techsoleengineers.com to reschedule.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Techsole Engineers. All rights reserved.</p>
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
          <p>&copy; 2026 Techsole Engineers. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  if (zohoConfig.enabled) {
    await zohoMailService.sendEmail(params.candidateEmail, candidateSubject, candidateHtml);
    await zohoMailService.sendEmail(params.hrEmail, hrSubject, hrHtml);
    return { success: true, mock: false };
  }

  const { transporter, fromEmail } = await resolveTransporter(params.tenantId);
  if (!transporter) {
    logEmailFallback(params.candidateEmail, candidateSubject, candidateHtml);
    logEmailFallback(params.hrEmail, hrSubject, hrHtml);
    return { success: true, mock: true };
  }

  // Send to candidate
  await transporter.sendMail({
    from: fromEmail,
    to: params.candidateEmail,
    subject: candidateSubject,
    html: candidateHtml,
  });

  // Send to HR
  await transporter.sendMail({
    from: fromEmail,
    to: params.hrEmail,
    subject: hrSubject,
    html: hrHtml,
  });

  console.log(`📧 Interview scheduled emails sent successfully to candidate (${params.candidateEmail}) and HR (${params.hrEmail})`);
  return { success: true, mock: false };
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
      recipientEmails = [process.env.SMTP_USER || "support@techsoleengineers.com"];
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

