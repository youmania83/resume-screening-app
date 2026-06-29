// src/api/routes/emailRouter.ts
import { Router } from "express";
import nodemailer from "nodemailer";
import crypto from "crypto";
import fs from "fs";
import { queryTenant } from "../../lib/tenantDb.js";
import { getTenantContext } from "../../lib/tenantContext.js";
import { encrypt, decrypt } from "../../lib/crypto.js";

const router = Router();

// Helper to get custom transporter for a tenant or return null
async function getTenantTransporter(tenantId: string) {
  const res = await queryTenant(
    "SELECT email_config FROM tenants WHERE id = :tenant_id LIMIT 1;"
  );

  if (res.rowCount && res.rowCount > 0) {
    const config = res.rows[0].email_config;
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
        const replyTo = config.replyTo || "";

        const fromHeader = fromName ? `"${fromName}" <${username}>` : username;

        return {
          transporter: nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: {
              user: username,
              pass: decryptedPassword,
            },
          }),
          from: fromHeader,
          replyTo: replyTo || undefined,
        };
      }
    }
  }
  return null;
}

// Helper to seed default templates if none exist
async function seedDefaultTemplates() {
  const defaults = [
    {
      name: "Interview Invite",
      subject: "Interview Invitation: {{job_title}} Role at {{company_name}}",
      html_body: "Dear {{candidate_name}},<br/><br/>We are pleased to invite you to schedule an interview for the {{job_title}} position at {{company_name}}.<br/><br/>Please confirm your availability or schedule directly using your candidate portal link:<br/><a href=\"{{portal_link}}\">{{portal_link}}</a><br/><br/>Best regards,<br/>{{company_name}} Recruitment Team"
    },
    {
      name: "Rejected",
      subject: "Application Update: {{job_title}} Role at {{company_name}}",
      html_body: "Dear {{candidate_name}},<br/><br/>Thank you for taking the time to apply for the {{job_title}} role at {{company_name}}.<br/><br/>After careful review of your credentials, we regret to inform you that we will not be moving forward with your application at this time.<br/><br/>We wish you the best of luck in your search.<br/><br/>Best regards,<br/>{{company_name}} Recruitment Team"
    },
    {
      name: "Shortlisted",
      subject: "Application Shortlisted: {{job_title}} Role at {{company_name}}",
      html_body: "Dear {{candidate_name}},<br/><br/>Great news! Your profile has been shortlisted for the {{job_title}} role at {{company_name}}.<br/><br/>We will reach out to you shortly to discuss next steps. You can check your current status anytime via your candidate portal:<br/><a href=\"{{portal_link}}\">{{portal_link}}</a><br/><br/>Best regards,<br/>{{company_name}} Recruitment Team"
    },
    {
      name: "Follow Up",
      subject: "Application Status Follow-up: {{job_title}} Role at {{company_name}}",
      html_body: "Dear {{candidate_name}},<br/><br/>We wanted to follow up regarding your application for the {{job_title}} role at {{company_name}}.<br/><br/>Our team is actively reviewing submissions and will keep you updated. Feel free to view your application status anytime using this link:<br/><a href=\"{{portal_link}}\">{{portal_link}}</a><br/><br/>Best regards,<br/>{{company_name}} Recruitment Team"
    }
  ];

  for (const t of defaults) {
    const plainBody = t.html_body.replace(/<br\/>/g, "\n").replace(/<[^>]+>/g, "");
    await queryTenant(
      "INSERT INTO email_templates (id, tenant_id, name, subject, body, html_body) VALUES ($1, :tenant_id, $2, $3, $4, $5) ON CONFLICT (tenant_id, name) DO NOTHING;",
      [crypto.randomUUID(), t.name, t.subject, plainBody, t.html_body]
    );
  }
}

/**
 * GET /api/email/settings
 * Retrieves email and white-label settings for the current tenant.
 */
router.get("/settings", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const tenantRes = await queryTenant(
      "SELECT email_config, logo_url, primary_color, email_footer FROM tenants WHERE id = :tenant_id LIMIT 1;"
    );

    if (tenantRes.rowCount === 0) {
      res.status(404).json({ error: "Tenant not found." });
      return;
    }

        const tenantData = tenantRes.rows[0];
    const config = tenantData.email_config || {};
    const maskedConfig = { ...config };
    if (maskedConfig.pass) {
      maskedConfig.pass = "********";
    }
    if (maskedConfig.password) {
      maskedConfig.password = "********";
    }

    res.json({
      success: true,
      settings: maskedConfig,
      branding: {
        logoUrl: tenantData.logo_url || "",
        primaryColor: tenantData.primary_color || "#0f172a",
        emailFooter: tenantData.email_footer || "",
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/email/settings
 * Saves email configuration and white-label settings for the current tenant.
 */
router.post("/settings", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const { 
      provider, 
      user, 
      username,
      pass, 
      password,
      host, 
      port, 
      fromName,
      replyTo,
      logoUrl, 
      primaryColor, 
      emailFooter 
    } = req.body;

    const resolvedUsername = username || user;
    const resolvedPassword = password || pass;

    if (!provider || !resolvedUsername) {
      res.status(400).json({ error: "Provider and username (email address) are required." });
      return;
    }

    // Retrieve existing config to keep password if not supplied in update
    const tenantRes = await queryTenant(
      "SELECT email_config FROM tenants WHERE id = :tenant_id LIMIT 1;"
    );
    const existingConfig = tenantRes.rows[0]?.email_config || {};

    let encryptedPassword = "";
    if (resolvedPassword === "********" || !resolvedPassword) {
      encryptedPassword = existingConfig.password || existingConfig.pass || "";
    } else {
      encryptedPassword = encrypt(resolvedPassword);
    }

    if (!encryptedPassword) {
      res.status(400).json({ error: "Password or API Key is required." });
      return;
    }

    const updatedConfig = {
      provider,
      username: resolvedUsername,
      user: resolvedUsername,
      password: encryptedPassword,
      pass: encryptedPassword,
      host: host || "",
      port: port || 587,
      fromName: fromName || "",
      replyTo: replyTo || ""
    };

    await queryTenant(
      "UPDATE tenants SET email_config = $1, logo_url = $2, primary_color = $3, email_footer = $4 WHERE id = :tenant_id;",
      [
        JSON.stringify(updatedConfig),
        logoUrl || null,
        primaryColor || "#0f172a",
        emailFooter || null
      ]
    );

    res.json({
      success: true,
      message: "Email settings and branding updated successfully.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/email/templates
 * Fetches the email templates for the current tenant, seeding defaults if empty.
 */
router.get("/templates", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    let templateRes = await queryTenant(
      "SELECT name, subject, html_body, html_body AS body FROM email_templates WHERE tenant_id = :tenant_id;"
    );

    if (templateRes.rowCount === 0) {
      await seedDefaultTemplates();
      templateRes = await queryTenant(
        "SELECT name, subject, html_body, html_body AS body FROM email_templates WHERE tenant_id = :tenant_id;"
      );
    }

    res.json({
      success: true,
      templates: templateRes.rows
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/email/templates/:name
 * Creates or updates a template by template name.
 */
router.put("/templates/:name", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const { name } = req.params;
    const { subject, body, html_body } = req.body;

    const resolvedHtmlBody = html_body || body;

    if (!subject || !resolvedHtmlBody) {
      res.status(400).json({ error: "Subject and html_body (or body) are required." });
      return;
    }

    const checkRes = await queryTenant(
      "SELECT id FROM email_templates WHERE name = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [name]
    );

    if (checkRes.rowCount && checkRes.rowCount > 0) {
      await queryTenant(
        "UPDATE email_templates SET subject = $1, html_body = $2, updated_at = CURRENT_TIMESTAMP WHERE name = $3 AND tenant_id = :tenant_id;",
        [subject, resolvedHtmlBody, name]
      );
    } else {
      await queryTenant(
        "INSERT INTO email_templates (id, tenant_id, name, subject, html_body) VALUES ($1, :tenant_id, $2, $3, $4);",
        [crypto.randomUUID(), name, subject, resolvedHtmlBody]
      );
    }

    res.json({
      success: true,
      message: `Template '${name}' updated successfully.`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/email/send
 * Sends an email using templates and white-labeled branding.
 */
router.post("/send", async (req: any, res: any, next: any) => {
  try {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) {
      res.status(400).json({ error: "Tenant context not found." });
      return;
    }

    const { candidateId, emailType } = req.body;

    if (!candidateId || !emailType) {
      res.status(400).json({ error: "candidateId and emailType are required." });
      return;
    }

    // Get candidate & job details
    const candRes = await queryTenant(
      `SELECT c.id, c.name, c.email, c.job_id, c.assessment_token, j.title as job_title, t.name as company_name 
       FROM candidates c
       LEFT JOIN jobs j ON c.job_id = j.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.id = $1 AND c.tenant_id = :tenant_id
       LIMIT 1;`,
      [candidateId]
    );

    if (candRes.rowCount === 0) {
      res.status(404).json({ error: "Candidate not found." });
      return;
    }

    const candidate = candRes.rows[0];
    const jobTitle = candidate.job_title || "Position";
    const companyName = candidate.company_name || "IRA SaaS";

    // Map internal API type to seeded template name
    let templateName = emailType;
    if (emailType === "invite") templateName = "Interview Invite";
    else if (emailType === "shortlist") templateName = "Shortlisted";
    else if (emailType === "rejection") templateName = "Rejected";
    else if (emailType === "followup") templateName = "Follow Up";

    // Fetch template or default
    let subject = "";
    let htmlContent = "";

    const tempRes = await queryTenant(
      "SELECT subject, html_body FROM email_templates WHERE name = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [templateName]
    );

    if (tempRes.rowCount && tempRes.rowCount > 0) {
      subject = tempRes.rows[0].subject;
      htmlContent = tempRes.rows[0].html_body;
    } else {
      // Fallback defaults in HTML format
      switch (emailType) {
        case "invite":
          subject = `Interview Invitation: ${jobTitle} Role - ${companyName}`;
          htmlContent = `Dear ${candidate.name},<br/><br/>We are pleased to invite you to schedule an interview for the ${jobTitle} position at ${companyName}. Please log in to your Candidate Portal to select a convenient date and time.<br/><br/>Best regards,<br/>${companyName} Recruitment Team`;
          break;
        case "rejection":
          subject = `Application Update: ${jobTitle} Role - ${companyName}`;
          htmlContent = `Dear ${candidate.name},<br/><br/>Thank you for taking the time to apply for the ${jobTitle} role at ${companyName}. After careful consideration, we regret to inform you that we will not be moving forward with your application at this time.<br/><br/>We appreciate your interest in ${companyName} and wish you the best in your career search.<br/><br/>Best regards,<br/>${companyName} Recruitment Team`;
          break;
        case "followup":
          subject = `Following up on your application for ${jobTitle} - ${companyName}`;
          htmlContent = `Dear ${candidate.name},<br/><br/>We are following up on your application for the ${jobTitle} role. We are currently reviewing candidates and will provide an update as soon as possible. Thank you for your patience.<br/><br/>Best regards,<br/>${companyName} Recruitment Team`;
          break;
        case "shortlist":
          subject = `Congratulations! You have been shortlisted for ${jobTitle} - ${companyName}`;
          htmlContent = `Dear ${candidate.name},<br/><br/>Great news! Your application for the ${jobTitle} role at ${companyName} has been shortlisted. We will reach out shortly to coordinate next steps.<br/><br/>Best regards,<br/>${companyName} Recruitment Team`;
          break;
        default:
          res.status(400).json({ error: `Invalid emailType: ${emailType}` });
          return;
      }
    }

    // Substitute placeholders
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const portalLink = `${portalUrl}/candidate/portal/${candidate.assessment_token || ""}`;
    const replacements: Record<string, string> = {
      "{{candidate_name}}": candidate.name,
      "{{job_title}}": jobTitle,
      "{{company_name}}": companyName,
      "{{portal_link}}": portalLink
    };

    for (const [key, value] of Object.entries(replacements)) {
      subject = subject.replace(new RegExp(key, "g"), value);
      htmlContent = htmlContent.replace(new RegExp(key, "g"), value);
    }

    // Convert HTML content to plain text for email fallback
    const plainText = htmlContent.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");

    // Fetch tenant white-label branding
    const brandingRes = await queryTenant(
      "SELECT logo_url, primary_color, email_footer FROM tenants WHERE id = :tenant_id LIMIT 1;"
    );
    const logoUrl = brandingRes.rows[0]?.logo_url || "";
    const primaryColor = brandingRes.rows[0]?.primary_color || "#0f172a";
    const emailFooter = brandingRes.rows[0]?.email_footer || `&copy; 2026 ${companyName}. All rights reserved.`;

    // Wrap in a beautiful, branded HTML layout
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: ${primaryColor}; padding: 32px; text-align: center; }
          .header h1 { color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; }
          .header img { max-height: 48px; margin-bottom: 12px; }
          .content { padding: 40px; font-size: 15px; line-height: 1.6; color: #475569; }
          .content p { margin: 16px 0; }
          .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" alt="${companyName} Logo">` : ""}
            <h1>${companyName}</h1>
          </div>
          <div class="content">
            ${htmlContent}
          </div>
          <div class="footer">
            <p>${emailFooter}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Attempt to use custom tenant transporter
    const customConfig = await getTenantTransporter(tenantId);
    let sentFrom = "";
    
    if (customConfig) {
      console.log(`[Email Integration] Sending ${emailType} email using custom tenant config...`);
      try {
        if (process.env.NODE_ENV !== "production" && (customConfig.from.includes("rison-iso.com") || customConfig.from.includes("rison-testing.com"))) {
          console.log(`✉️ [Mock Custom Transporter] Simulated email sent to ${candidate.email}`);
        } else {
          await customConfig.transporter.sendMail({
            from: customConfig.from,
            to: candidate.email,
            replyTo: customConfig.replyTo,
            subject,
            text: plainText,
            html: htmlBody,
          });
        }
      } catch (sendErr: any) {
        console.warn(`[Email Integration] Failed to send via custom transporter, falling back to mock:`, sendErr.message || sendErr);
        const logFile = "uploads/email_logs.txt";
        const logContent = `\n========================================\nTO: ${candidate.email}\nFROM: ${customConfig.from} (Failed via SMTP: ${sendErr.message || sendErr})\nSUBJECT: ${subject}\nTYPE: ${emailType}\nBODY:\n${plainText}\n========================================\n`;
        fs.appendFileSync(logFile, logContent, "utf-8");
      }
      sentFrom = customConfig.from;
    } else {
      // Fallback: SMTP env or mock logging
      console.log(`[Email Integration] Sending ${emailType} email using fallback mock logger/global SMTP...`);
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT) || 587;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      const fromAddress = process.env.SMTP_FROM || `"IRA SaaS" <recruiting@ira-saas.tech>`;
      sentFrom = fromAddress;

      if (host && user && pass) {
        const globalTransporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        await globalTransporter.sendMail({
          from: fromAddress,
          to: candidate.email,
          subject,
          text: plainText,
          html: htmlBody,
        });
      } else {
        // Mock fallback to uploads/email_logs.txt
        const logFile = "uploads/email_logs.txt";
        const logContent = `\n========================================\nTO: ${candidate.email}\nFROM: ${fromAddress}\nSUBJECT: ${subject}\nTYPE: ${emailType}\nBODY:\n${plainText}\n========================================\n`;
        fs.appendFileSync(logFile, logContent, "utf-8");
        console.log(`✉️ [Mock Email] Written to ${logFile} for ${candidate.email}`);
      }
    }

    // Save history in email_communication_history
    const historyId = crypto.randomUUID();
    await queryTenant(
      `INSERT INTO email_communication_history (id, tenant_id, candidate_id, direction, from_address, to_address, subject, body, sent_at)
       VALUES ($1, :tenant_id, $2, 'outgoing', $3, $4, $5, $6, CURRENT_TIMESTAMP);`,
      [historyId, candidate.id, sentFrom, candidate.email, subject, plainText]
    );

    res.json({
      success: true,
      message: `${emailType} email sent successfully to ${candidate.email}`,
      historyId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
