import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// src/integrations/email/EmailProvider.ts
export interface EmailAttachment {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export interface NormalizedEmail {
  id: string;
  sender: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: Date;
  attachments: EmailAttachment[];
}

export interface IEmailProvider {
  name: string;
  fetchUnreadEmails(): Promise<NormalizedEmail[]>;
  markAsRead(emailId: string): Promise<void>;
}

// 1. Gmail Provider (Simulated API sync integration)
export class GmailProvider implements IEmailProvider {
  name = "Gmail";

  async fetchUnreadEmails(): Promise<NormalizedEmail[]> {
    console.log("[Gmail Integration] Syncing unread recruiting emails...");
    // In production, this would use googleapis or similar OAuth flow
    return [];
  }

  async markAsRead(emailId: string): Promise<void> {
    console.log(`[Gmail Integration] Marking message ${emailId} as read.`);
  }
}

// 2. Outlook Provider (Simulated API sync integration)
export class OutlookProvider implements IEmailProvider {
  name = "Outlook";

  async fetchUnreadEmails(): Promise<NormalizedEmail[]> {
    console.log("[Outlook Integration] Syncing Microsoft Graph mailbox...");
    return [];
  }

  async markAsRead(emailId: string): Promise<void> {
    console.log(`[Outlook Integration] Marking message ${emailId} as read.`);
  }
}

// 3. Zoho Provider (Real IMAP integration)
export class ZohoProvider implements IEmailProvider {
  name = "Zoho";

  async fetchUnreadEmails(): Promise<NormalizedEmail[]> {
    const user = process.env.ZOHO_SMTP_USER;
    const pass = process.env.ZOHO_SMTP_PASSWORD;
    if (!user || !pass) {
      console.warn("[Zoho Integration] SMTP credentials are not configured in env variables. Skipping incoming sync.");
      return [];
    }

    console.log(`[Zoho Integration] Fetching unread emails from Zoho IMAP for ${user}...`);

    const client = new ImapFlow({
      host: "imap.zoho.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
      tls: { rejectUnauthorized: false }
    });

    const emails: NormalizedEmail[] = [];

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        // Fetch all unread emails, plus any read/unread emails since July 10, 2026
        const unreadResults = await client.search({ seen: false }) || [];
        const recentResults = await client.search({ since: new Date("2026-07-10") }) || [];
        
        // Merge and deduplicate sequence numbers
        const searchResults = Array.from(new Set([
          ...(Array.isArray(unreadResults) ? unreadResults : []),
          ...(Array.isArray(recentResults) ? recentResults : [])
        ]));
        const resultsCount = Array.isArray(searchResults) ? searchResults.length : 0;
        console.log(`[Zoho Integration] Found ${resultsCount} unread messages.`);

        if (Array.isArray(searchResults)) {
          for (const seq of searchResults) {
            try {
              const message = await client.fetchOne(seq, { source: true });
              if (message && message.source) {
                const parsed = await simpleParser(message.source);
                const attachments: EmailAttachment[] = [];

                if (parsed.attachments && parsed.attachments.length > 0) {
                  for (const att of parsed.attachments) {
                    attachments.push({
                      fileName: att.filename || "attachment",
                      mimeType: att.contentType,
                      content: att.content,
                    });
                  }
                }

                const sender = parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown@sender.com";
                emails.push({
                  id: seq.toString(),
                  sender,
                  subject: parsed.subject || "",
                  bodyText: parsed.text || "",
                  bodyHtml: parsed.html || "",
                  receivedAt: parsed.date || new Date(),
                  attachments,
                });
              }
            } catch (fetchErr) {
              console.error(`[Zoho Integration] Failed to parse message sequence ${seq}:`, fetchErr);
            }
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err: any) {
      console.error("[Zoho Integration] IMAP sync failed:", err.message);
      try { await client.logout(); } catch {}
      throw err;
    }

    return emails;
  }

  async markAsRead(emailId: string): Promise<void> {
    const user = process.env.ZOHO_SMTP_USER;
    const pass = process.env.ZOHO_SMTP_PASSWORD;
    if (!user || !pass) return;

    const client = new ImapFlow({
      host: "imap.zoho.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
      tls: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const seq = parseInt(emailId, 10);
        if (!isNaN(seq)) {
          await client.messageFlagsAdd({ seq }, ["\\Seen"]);
          console.log(`[Zoho Integration] Marked email sequence ${emailId} as read (Seen).`);
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err: any) {
      console.error(`[Zoho Integration] Failed to mark email ${emailId} as read:`, err.message);
      try { await client.logout(); } catch {}
    }
  }
}

// 4. IMAP Fallback Provider (Simulated IMAP protocol connection)
export class IMAPProvider implements IEmailProvider {
  name = "IMAP";

  async fetchUnreadEmails(): Promise<NormalizedEmail[]> {
    console.log("[IMAP Fallback] Syncing IMAP server inbox...");
    return [];
  }

  async markAsRead(emailId: string): Promise<void> {
    console.log(`[IMAP Fallback] Marking message ${emailId} as read.`);
  }
}

// 5. Mock Email Provider (Returns test resume attachments for automated testing)
export class MockEmailProvider implements IEmailProvider {
  name = "Mock";
  private readLogs: Set<string> = new Set();

  async fetchUnreadEmails(): Promise<NormalizedEmail[]> {
    const timeSalt = Date.now();
    const emails: NormalizedEmail[] = [];

    // Email 1: Candidate applying with resume attachment
    const email1Id = `mock-email-resume-${timeSalt}`;
    if (!this.readLogs.has(email1Id)) {
      const dummyPdfContent = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Title (John Doe Resume) >>\nendobj\nstream\nEmail: john.doe.email@example.com\nPhone: +1 555-123-4567\nSkills: Python, React, Docker, Kubernetes\nendstream\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n310\n%%EOF\n"
      );
      emails.push({
        id: email1Id,
        sender: "john.doe@example.com",
        subject: "Applying for Python Developer opening - John Doe",
        bodyText: "Hello Recruiting Team, please find my resume attached for the Python Developer role.",
        receivedAt: new Date(),
        attachments: [
          {
            fileName: "John_Doe_Resume_Email.pdf",
            mimeType: "application/pdf",
            content: dummyPdfContent,
          },
        ],
      });
    }

    // Email 2: New Job Description Intake Email
    const email2Id = `mock-email-jd-${timeSalt}`;
    if (!this.readLogs.has(email2Id)) {
      const jdBody = `Hello Team,

Here is the job description for the new React Architect role.

Title: React Architect
Department: Engineering
Location: New York City
Experience Required: 8+ years
Work Mode: Hybrid

Required Skills: React, Next.js, Redux, Webpack, TypeScript, Micro-frontends.

Description:
We are looking for a senior front-end architect to design and scale our SaaS platforms. You will lead a team of 4 engineers and set the core UI standards.`;

      emails.push({
        id: email2Id,
        sender: "hiring.manager@company.com",
        subject: "New Job Description: React Architect",
        bodyText: jdBody,
        receivedAt: new Date(),
        attachments: [],
      });
    }

    // Email 3: Candidate applying with a resume link in the email body (no attachment)
    const email3Id = `mock-email-link-${timeSalt}`;
    if (!this.readLogs.has(email3Id)) {
      emails.push({
        id: email3Id,
        sender: "bruce.wayne@waynecorp.com",
        subject: "Application for Product Manager position - Bruce Wayne",
        bodyText: `Hi Recruiting,

I would love to apply for the Product Manager role.
You can access my resume via this Google Drive link:
https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J/view?usp=sharing

Thanks,
Bruce Wayne`,
        receivedAt: new Date(),
        attachments: [],
      });
    }

    if (emails.length > 0) {
      console.log(`[Mock Email Sync] Pulling ${emails.length} mock emails (applications & JDs)...`);
    }
    return emails;
  }

  async markAsRead(emailId: string): Promise<void> {
    console.log(`[Mock Email Sync] Marked mock message ${emailId} as sync read.`);
    this.readLogs.add(emailId);
  }
}

export class EmailSyncManager {
  static getProvider(providerType: string): IEmailProvider {
    switch (providerType.toLowerCase()) {
      case "gmail":
        return new GmailProvider();
      case "outlook":
        return new OutlookProvider();
      case "zoho":
        return new ZohoProvider();
      case "imap":
        return new IMAPProvider();
      case "mock":
        return new MockEmailProvider();
      default:
        throw new Error(`Unsupported incoming email sync provider: ${providerType}`);
    }
  }
}
