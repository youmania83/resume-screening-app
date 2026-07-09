// src/lib/email/templates.ts

/**
 * Escapes characters in a string to prevent XSS/HTML Injection.
 */
export function escapeHtml(text: string): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface AssessmentInviteTemplateParams {
  candidateName: string;
  jobTitle: string;
  assessmentLink: string;
  timeLimit: string;
  expiryDate: string;
  supportEmail: string;
  companyName?: string;
  primaryColor?: string;
  trackingPixelUrl?: string;
}

export function getAssessmentInviteTemplate(params: AssessmentInviteTemplateParams): string {
  const name = escapeHtml(params.candidateName);
  const job = escapeHtml(params.jobTitle);
  const time = escapeHtml(params.timeLimit);
  const expiry = escapeHtml(params.expiryDate);
  const support = escapeHtml(params.supportEmail);
  const company = escapeHtml(params.companyName || "Rison AI Tech");
  const primary = params.primaryColor || "#0f172a";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Assessment Invitation</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, ${primary} 0%, #1e293b 100%); padding: 40px 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.025em; }
        .header p { color: #94a3b8; font-size: 13px; margin: 8px 0 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.7; color: #475569; margin: 16px 0; }
        .details-box { background-color: #f1f5f9; border-radius: 12px; padding: 24px; margin: 28px 0; border-left: 4px solid ${primary}; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-label { font-weight: 600; color: #64748b; }
        .detail-val { font-weight: 700; color: #0f172a; text-align: right; }
        .btn-container { text-align: center; margin: 36px 0; }
        .btn { display: inline-block; background-color: ${primary}; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: background-color 0.2s; }
        .footer { background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 6px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${company}</h1>
          <p>Candidate Assessment Portal</p>
        </div>
        <div class="content">
          <p class="greeting">Hello ${name},</p>
          <p class="message">Thank you for your application for the <strong>${job}</strong> position. We reviewed your resume and would love to invite you to complete a short technical assessment to evaluate your match for this role.</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Position:</span>
              <span class="detail-val">${job}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time Limit:</span>
              <span class="detail-val">${time}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Expiration Date:</span>
              <span class="detail-val">${expiry}</span>
            </div>
          </div>
          
          <p class="message">Please complete this assessment in a quiet, distraction-free environment. Ensure you have a stable internet connection. Note that exits from full-screen mode or focus loss will be flagged as proctor violations.</p>
          
          <div class="btn-container">
            <a href="${params.assessmentLink}" class="btn" target="_blank">Start Assessment</a>
          </div>
          
          <p class="message" style="font-size: 12px; color: #94a3b8; text-align: center;">If the button above doesn't work, copy and paste this link in your browser:<br>${params.assessmentLink}</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 ${company}. All rights reserved.</p>
          <p>If you experience any technical difficulties, please email us at <a href="mailto:${support}">${support}</a>.</p>
        </div>
      </div>
      ${params.trackingPixelUrl ? `<img src="${params.trackingPixelUrl}" width="1" height="1" style="display:none;" />` : ""}
    </body>
    </html>
  `;
}

export interface InterviewInviteTemplateParams {
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  meetingLink: string;
  interviewerName: string;
  rescheduleLink: string;
  companyAddress?: string;
  companyName?: string;
  primaryColor?: string;
  trackingPixelUrl?: string;
}

export function getInterviewInviteTemplate(params: InterviewInviteTemplateParams): string {
  const name = escapeHtml(params.candidateName);
  const job = escapeHtml(params.jobTitle);
  const date = escapeHtml(params.interviewDate);
  const time = escapeHtml(params.interviewTime);
  const interviewer = escapeHtml(params.interviewerName);
  const address = params.companyAddress ? escapeHtml(params.companyAddress) : "";
  const company = escapeHtml(params.companyName || "Rison AI Tech");
  const primary = params.primaryColor || "#059669"; // Emerald

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Interview Invitation</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, ${primary} 0%, #047857 100%); padding: 40px 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.025em; }
        .header p { color: #a7f3d0; font-size: 13px; margin: 8px 0 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.7; color: #475569; margin: 16px 0; }
        .details-box { background-color: #f0fdf4; border-radius: 12px; padding: 24px; margin: 28px 0; border-left: 4px solid ${primary}; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-label { font-weight: 600; color: #047857; }
        .detail-val { font-weight: 700; color: #065f46; text-align: right; }
        .btn-container { text-align: center; margin: 36px 0; }
        .btn { display: inline-block; background-color: ${primary}; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: background-color 0.2s; }
        .footer { background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .footer p { margin: 6px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${company}</h1>
          <p>Interview Invitation</p>
        </div>
        <div class="content">
          <p class="greeting">Congratulations ${name}!</p>
          <p class="message">We are pleased to inform you that you have successfully passed our assessment stage. We would like to invite you for a virtual interview for the <strong>${job}</strong> position.</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Interviewer:</span>
              <span class="detail-val">${interviewer}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-val">${date}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-val">${time}</span>
            </div>
            ${address ? `
            <div class="detail-row">
              <span class="detail-label">Address:</span>
              <span class="detail-val">${address}</span>
            </div>` : `
            <div class="detail-row">
              <span class="detail-label">Format:</span>
              <span class="detail-val">Online Video Conference</span>
            </div>`}
          </div>
          
          <p class="message">Please join the call a few minutes early to ensure your microphone and camera are working properly. If you need to reschedule, you can use the reschedule option linked below.</p>
          
          <div class="btn-container">
            <a href="${params.meetingLink}" class="btn" target="_blank">Join Meeting</a>
          </div>
          
          <p style="text-align: center; font-size: 14px; margin-top: 24px;">
            <a href="${params.rescheduleLink}" style="color: #64748b; text-decoration: underline; font-weight: 600;">Reschedule Interview</a>
          </p>
        </div>
        <div class="footer">
          <p>&copy; 2026 ${company}. All rights reserved.</p>
          <p>Please note: A calendar (.ics) invite has been attached to this email.</p>
        </div>
      </div>
      ${params.trackingPixelUrl ? `<img src="${params.trackingPixelUrl}" width="1" height="1" style="display:none;" />` : ""}
    </body>
    </html>
  `;
}

export interface RejectionTemplateParams {
  candidateName: string;
  jobTitle: string;
  companyName?: string;
  primaryColor?: string;
  trackingPixelUrl?: string;
}

export function getRejectionTemplate(params: RejectionTemplateParams): string {
  const name = escapeHtml(params.candidateName);
  const job = escapeHtml(params.jobTitle);
  const company = escapeHtml(params.companyName || "Rison AI Tech");
  const primary = params.primaryColor || "#64748b"; // Slate Gray

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Application Status Update</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, ${primary} 0%, #475569 100%); padding: 40px 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; font-weight: 800; letter-spacing: -0.025em; }
        .header p { color: #cbd5e1; font-size: 13px; margin: 8px 0 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.7; color: #475569; margin: 16px 0; }
        .divider { height: 1px; background-color: #e2e8f0; margin: 32px 0; }
        .footer { background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${company}</h1>
          <p>Application Update</p>
        </div>
        <div class="content">
          <p class="greeting">Dear ${name},</p>
          <p class="message">Thank you for your interest in the <strong>${job}</strong> position at ${company} and for taking the time to complete our recruitment stages.</p>
          <p class="message">After careful consideration of your evaluation results, we regret to inform you that we will not be moving forward with your application at this time. We had a high volume of qualified applicants, and we made some very difficult decisions.</p>
          
          <div class="divider"></div>
          
          <p class="message">We appreciate the effort you put into the assessment process. We will keep your profile in our database and reach out to you if another opportunity opens up that matches your skill set. We wish you the best of luck in your career search.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 ${company}. All rights reserved.</p>
        </div>
      </div>
      ${params.trackingPixelUrl ? `<img src="${params.trackingPixelUrl}" width="1" height="1" style="display:none;" />` : ""}
    </body>
    </html>
  `;
}

export interface AssessmentReminderTemplateParams {
  candidateName: string;
  jobTitle: string;
  assessmentLink: string;
  expiryDate: string;
  companyName?: string;
  primaryColor?: string;
  trackingPixelUrl?: string;
}

export function getAssessmentReminderTemplate(params: AssessmentReminderTemplateParams): string {
  const name = escapeHtml(params.candidateName);
  const job = escapeHtml(params.jobTitle);
  const expiry = escapeHtml(params.expiryDate);
  const company = escapeHtml(params.companyName || "Rison AI Tech");
  const primary = params.primaryColor || "#d97706"; // Amber/Orange

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Assessment Reminder</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, ${primary} 0%, #b45309 100%); padding: 40px 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.025em; }
        .header p { color: #fef3c7; font-size: 13px; margin: 8px 0 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.7; color: #475569; margin: 16px 0; }
        .reminder-box { background-color: #fffbeb; border-radius: 12px; padding: 20px; margin: 24px 0; border-left: 4px solid ${primary}; }
        .reminder-text { font-size: 14px; font-weight: 700; color: #92400e; margin: 0; }
        .btn-container { text-align: center; margin: 36px 0; }
        .btn { display: inline-block; background-color: ${primary}; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: background-color 0.2s; }
        .footer { background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${company}</h1>
          <p>Reminder: Pending Assessment</p>
        </div>
        <div class="content">
          <p class="greeting">Hello ${name},</p>
          <p class="message">This is a reminder to complete your technical assessment for the <strong>${job}</strong> position.</p>
          
          <div class="reminder-box">
            <p class="reminder-text">Deadline: Your assessment link will expire on ${expiry}.</p>
          </div>
          
          <p class="message">The assessment consists of short multiple-choice and/or technical screening questions. Once you click start, you must complete it within the designated time limit.</p>
          
          <div class="btn-container">
            <a href="${params.assessmentLink}" class="btn" target="_blank">Resume/Start Assessment</a>
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2026 ${company}. All rights reserved.</p>
        </div>
      </div>
      ${params.trackingPixelUrl ? `<img src="${params.trackingPixelUrl}" width="1" height="1" style="display:none;" />` : ""}
    </body>
    </html>
  `;
}

export interface InterviewReminderTemplateParams {
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  meetingLink: string;
  interviewerName: string;
  companyName?: string;
  primaryColor?: string;
  trackingPixelUrl?: string;
}

export function getInterviewReminderTemplate(params: InterviewReminderTemplateParams): string {
  const name = escapeHtml(params.candidateName);
  const job = escapeHtml(params.jobTitle);
  const date = escapeHtml(params.interviewDate);
  const time = escapeHtml(params.interviewTime);
  const interviewer = escapeHtml(params.interviewerName);
  const company = escapeHtml(params.companyName || "Rison AI Tech");
  const primary = params.primaryColor || "#7c3aed"; // Purple

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Interview Reminder</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, ${primary} 0%, #6d28d9 100%); padding: 40px 32px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 26px; margin: 0; font-weight: 800; letter-spacing: -0.025em; }
        .header p { color: #ddd6fe; font-size: 13px; margin: 8px 0 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; }
        .message { font-size: 15px; line-height: 1.7; color: #475569; margin: 16px 0; }
        .details-box { background-color: #f5f3ff; border-radius: 12px; padding: 24px; margin: 28px 0; border-left: 4px solid ${primary}; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-label { font-weight: 600; color: #7c3aed; }
        .detail-val { font-weight: 700; color: #5b21b6; text-align: right; }
        .btn-container { text-align: center; margin: 36px 0; }
        .btn { display: inline-block; background-color: ${primary}; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: background-color 0.2s; }
        .footer { background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${company}</h1>
          <p>Reminder: Upcoming Interview</p>
        </div>
        <div class="content">
          <p class="greeting">Hello ${name},</p>
          <p class="message">This is a friendly reminder of your upcoming interview for the <strong>${job}</strong> position.</p>
          
          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Interviewer:</span>
              <span class="detail-val">${interviewer}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-val">${date}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-val">${time}</span>
            </div>
          </div>
          
          <div class="btn-container">
            <a href="${params.meetingLink}" class="btn" target="_blank">Join Interview Meeting</a>
          </div>
        </div>
        <div class="footer">
          <p>&copy; 2026 ${company}. All rights reserved.</p>
        </div>
      </div>
      ${params.trackingPixelUrl ? `<img src="${params.trackingPixelUrl}" width="1" height="1" style="display:none;" />` : ""}
    </body>
    </html>
  `;
}
