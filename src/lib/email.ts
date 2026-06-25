// src/lib/email.ts
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { zohoConfig } from "../integrations/zoho/config/zoho.config";
import { zohoMailService } from "../integrations/zoho/services/zohoMail.service";

dotenv.config();

// Create SMTP transporter using env variables
const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // Return null to signify missing config and use fallback logs
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
  });
};

const FROM_EMAIL = process.env.SMTP_FROM || '"Rison AI Recruitment" <recruiting@risonai.tech>';

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

/**
 * Send candidate assessment invite email
 */
export async function sendAssessmentInviteEmail(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  token: string;
  expiryDate: Date;
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

  const subject = `Assessment Invitation: ${safeJobTitle} Role - Rison AI Tech`;
  
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
          <h1>Rison AI Tech</h1>
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
          <p>&copy; 2026 Rison AI Tech. All rights reserved.</p>
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

  const transporter = getTransporter();
  if (!transporter) {
    logEmailFallback(params.candidateEmail, subject, html);
    return { success: true, mock: true };
  }

  await transporter.sendMail({
    from: FROM_EMAIL,
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

  const candidateSubject = `HR Interview Scheduled: ${safeJobTitle} Role - Rison AI Tech`;
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
          <h1>Rison AI Tech</h1>
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
          
          <p class="message">Our HR team will reach out with calendar link details shortly. If this slot does not work for you, please contact us at support@risonai.tech to reschedule.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Rison AI Tech. All rights reserved.</p>
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
          <p>&copy; 2026 Rison AI Tech. All rights reserved.</p>
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

  const transporter = getTransporter();
  if (!transporter) {
    logEmailFallback(params.candidateEmail, candidateSubject, candidateHtml);
    logEmailFallback(params.hrEmail, hrSubject, hrHtml);
    return { success: true, mock: true };
  }

  // Send to candidate
  await transporter.sendMail({
    from: FROM_EMAIL,
    to: params.candidateEmail,
    subject: candidateSubject,
    html: candidateHtml,
  });

  // Send to HR
  await transporter.sendMail({
    from: FROM_EMAIL,
    to: params.hrEmail,
    subject: hrSubject,
    html: hrHtml,
  });

  console.log(`📧 Interview scheduled emails sent successfully to candidate (${params.candidateEmail}) and HR (${params.hrEmail})`);
  return { success: true, mock: false };
}
