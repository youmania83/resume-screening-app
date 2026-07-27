// scripts/resend_working_assessment_links.cjs
const pg = require("pg");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
require("dotenv").config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres.oqftsxdjhobstsljflov:Yogesh%408865@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function main() {
  console.log("🚀 Starting Resend Assessment Emails script...");

  // Fetch all active/shortlisted candidates who need a working assessment link
  const candRes = await pool.query(`
    SELECT id, name, email, role, job_id, assessment_token, assessment_token_expiry, tenant_id
    FROM candidates
    WHERE (status IN ('applied', 'shortlisted', 'review', 'pending') OR assessment_token IS NOT NULL)
      AND assessment_status IS DISTINCT FROM 'passed'
      AND assessment_status IS DISTINCT FROM 'completed'
      AND email IS NOT NULL AND email LIKE '%@%'
    ORDER BY created_at DESC;
  `);

  console.log(`Found ${candRes.rowCount} candidate(s) to process.`);

  // Find a fallback default job if job_id is null
  const defaultJobRes = await pool.query(`SELECT id, title FROM jobs WHERE sync_status IS DISTINCT FROM 'removed' ORDER BY created_at DESC LIMIT 1;`);
  const defaultJobId = defaultJobRes.rows[0]?.id || "job-default";

  // Setup SMTP Transporter using Zoho configuration from env
  const transporter = nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || "smtp.zoho.com",
    port: Number(process.env.ZOHO_SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.ZOHO_SMTP_USER || "hr@techsolengineers.com",
      pass: process.env.ZOHO_SMTP_PASSWORD || "sQL2EaDr3RPP"
    }
  });

  const fromEmail = `"Techsol Engineers HR" <${process.env.ZOHO_SMTP_USER || "hr@techsolengineers.com"}>`;
  const portalUrl = "https://api.risonaitech.com";

  let sentCount = 0;
  let errorCount = 0;

  for (const c of candRes.rows) {
    try {
      // 1. Ensure valid job_id
      let jobId = c.job_id;
      if (!jobId) {
        jobId = defaultJobId;
        await pool.query(`UPDATE candidates SET job_id = $1 WHERE id = $2;`, [jobId, c.id]);
      }

      // 2. Ensure valid non-expired token (extend 7 days from now)
      let token = c.assessment_token;
      if (!token) {
        token = crypto.randomBytes(24).toString("hex");
      }
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);

      await pool.query(`
        UPDATE candidates 
        SET assessment_token = $1, 
            assessment_token_expiry = $2, 
            assessment_status = COALESCE(assessment_status, 'pending')
        WHERE id = $3;
      `, [token, expiry, c.id]);

      const assessmentLink = `${portalUrl}/assessment/${token}`;
      const safeCandidateName = escapeHtml(c.name);
      const safeJobTitle = escapeHtml(c.role || "Software Engineer");
      const formattedExpiry = expiry.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });

      const subject = `Revised AI Assessment Link: ${safeJobTitle} Role - Techsol Engineers`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>AI Assessment Invitation</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
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
            .btn { display: inline-block; background-color: #0f172a; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.15); }
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
              <p class="message">We have updated our Candidate Assessment Portal to ensure smooth access. Please use your revised, active assessment link below to complete your evaluation for the <strong>${safeJobTitle}</strong> position.</p>
              
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
              
              <div class="btn-container">
                <a href="${assessmentLink}" class="btn" target="_blank">Start Assessment</a>
              </div>
              
              <p class="message" style="font-size: 12px; color: #64748b; text-align: center;">If the button above does not work, copy and paste this URL into your browser:<br>${assessmentLink}</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 Techsol Engineers. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await transporter.sendMail({
        from: fromEmail,
        to: c.email,
        subject,
        html
      });

      // Log activity in database
      await pool.query(`
        INSERT INTO candidate_activity_logs (candidate_id, event_type, message)
        VALUES ($1, 'assessment_invited', $2);
      `, [c.id, `Revised assessment link sent. Link: ${assessmentLink}`]);

      sentCount++;
      console.log(`[${sentCount}/${candRes.rowCount}] Sent revised link to ${c.name} (${c.email})`);
      
      // Pause 200ms to respect SMTP limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errorCount++;
      console.error(`Failed to send email to ${c.email}:`, err.message);
    }
  }

  console.log(`✅ Complete! Sent ${sentCount} revised assessment email(s). Errors: ${errorCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
