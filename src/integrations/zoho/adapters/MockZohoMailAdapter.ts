// src/integrations/zoho/adapters/MockZohoMailAdapter.ts

import { ZohoMailAdapter, ZohoEmailMessage } from "./ZohoMailAdapter";

export class MockZohoMailAdapter implements ZohoMailAdapter {
  private sentEmails: any[] = [];

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
  ): Promise<void> {
    console.log(`✉️ [MockZohoMailAdapter] Mock sending email to: ${to}, subject: "${subject}" with ${attachments?.length || 0} attachments.`);
    this.sentEmails.push({
      to,
      subject,
      html,
      attachments,
      sentAt: new Date()
    });
  }

  async fetchIncomingEmails(): Promise<ZohoEmailMessage[]> {
    console.log("📥 [MockZohoMailAdapter] Generating mock incoming emails with resume attachments...");

    return [
      {
        id: "msg-zoho-001",
        fromEmail: "peter.parker@dailybugle.com",
        fromName: "Peter Parker",
        subject: "Application for Software Engineer Role",
        body: "Hello HR team, I am interested in the Software Engineer position. Please find my resume attached.",
        date: new Date(),
        attachments: [
          {
            filename: "peter_parker_resume.pdf",
            content: Buffer.from(
              "%PDF Mock Resume Contents for Peter Parker. Experience: 4 years of React and Node.js full stack development. Expertise in Next.js and PostgreSQL.",
              "utf-8"
            ),
            contentType: "application/pdf"
          }
        ]
      },
      {
        id: "msg-zoho-002",
        fromEmail: "diana.prince@themiscira.org",
        fromName: "Diana Prince",
        subject: "Application for Sales Executive Role",
        body: "Hi team, I would like to apply for the Sales Executive role. I have extensive experience in SaaS B2B outbound sales.",
        date: new Date(),
        attachments: [
          {
            filename: "diana_prince_resume.pdf",
            content: Buffer.from(
              "%PDF Mock Resume Contents for Diana Prince. Experience: 6 years of SaaS sales and business development. Exceeded outbound quotas regularly.",
              "utf-8"
            ),
            contentType: "application/pdf"
          }
        ]
      },
      {
        id: "msg-zoho-003",
        fromEmail: "clark.kent@metropolis.com",
        fromName: "Clark Kent",
        subject: "Application for HR Manager Role",
        body: "Dear hiring committee, Please accept my application for the HR Manager opening. I specialize in onboarding and talent management.",
        date: new Date(),
        attachments: [
          {
            filename: "clark_kent_resume.pdf",
            content: Buffer.from(
              "%PDF Mock Resume Contents for Clark Kent. Experience: 7 years in HR management, employee relations, recruitment pipeline optimizations.",
              "utf-8"
            ),
            contentType: "application/pdf"
          }
        ]
      }
    ];
  }
}
