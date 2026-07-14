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
  folder?: string;
}

export interface IEmailProvider {
  name: string;
  fetchUnreadEmails(): Promise<NormalizedEmail[]>;
  markAsRead(emailId: string, folder?: string): Promise<void>;
}

// 1. Gmail Provider (Simulated API sync integration)
export class GmailProvider implements IEmailProvider {
  name = "Gmail";

  async fetchUnreadEmails(): Promise<NormalizedEmail[]> {
    console.log("[Gmail Integration] Syncing unread recruiting emails...");
    // In production, this would use googleapis or similar OAuth flow
    return [];
  }

  async markAsRead(emailId: string, folder?: string): Promise<void> {
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

  async markAsRead(emailId: string, folder?: string): Promise<void> {
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
    const folders = ["INBOX", "Inbox/HR Dump", "Inbox/Recruitment"];

    // Helper to recursively detect resume files in message bodyStructure
    const hasResumeAttachment = (part: any): boolean => {
      if (!part) return false;
      const fileName = part.parameters?.name || part.dispositionParameters?.filename || "";
      if (fileName) {
        const ext = fileName.split(".").pop()?.toLowerCase();
        if (ext && ["pdf", "docx", "doc", "txt"].includes(ext)) {
          if (part.type?.startsWith("image/")) return false;
          
          const lowerName = fileName.toLowerCase();
          const blacklist = [
            "payslip", "pay slip", "pay_slip", "salary",
            "challan", "ecr", "gst", "tax", "audit", "balance",
            "ticket", "boarding", "flight", "booking", "travel", "paid",
            "invoice", "receipt", "bill", "payment", "transaction", "voucher", "statement", "ledger", "wallet", "bank", "account details",
            "scan", "mri", "xray", "medical", "prescription",
            "tender", "agreement", "contract", "proposal",
            "issue", "incident", "log", "report", "reports",
            "program", "training", "certificate", "course"
          ];
          if (blacklist.some(keyword => lowerName.includes(keyword)) || lowerName.includes(" to ")) {
            return false;
          }
          return true;
        }
      }
      if (part.childNodes && Array.isArray(part.childNodes)) {
        for (const child of part.childNodes) {
          if (hasResumeAttachment(child)) return true;
        }
      }
      return false;
    };

    try {
      await client.connect();
      for (const folderPath of folders) {
        console.log(`[Zoho Integration] Selecting folder "${folderPath}"...`);
        try {
          const lock = await client.getMailboxLock(folderPath);
          try {
            // Fetch all unread emails, plus any read/unread emails since July 10, 2026
            const unreadResults = await client.search({ seen: false }) || [];
            const recentResults = await client.search({ since: new Date("2026-07-10") }) || [];
            
            // Merge and deduplicate sequence numbers
            const searchResults = Array.from(new Set([
              ...(Array.isArray(unreadResults) ? unreadResults : []),
              ...(Array.isArray(recentResults) ? recentResults : [])
            ]));
            const resultsCount = searchResults.length;
            console.log(`[Zoho Integration] Found ${resultsCount} messages in folder "${folderPath}".`);

            if (resultsCount > 0) {
              const messages = client.fetch(searchResults, { envelope: true, bodyStructure: true });
              for await (const msg of messages) {
                const subject = msg.envelope?.subject || "";
                const sender = msg.envelope?.from?.[0]?.address || "unknown@sender.com";
                const date = msg.envelope?.date || new Date();

                // 1. Subject keyword match check
                const isSubjectMatch = /applying|application|resume|cv|job|hiring/i.test(subject);
                
                // 2. Attachment check (excluding blacklisted filenames)
                const isAttachmentMatch = hasResumeAttachment(msg.bodyStructure);

                // 3. For unclassified subjects, enforce that at least one attachment must contain a resume keyword in its filename
                let shouldFetch = false;
                if (isSubjectMatch && isAttachmentMatch) {
                  shouldFetch = true;
                } else if (isAttachmentMatch) {
                  // Verify if any attachment filename explicitly contains resume/cv keywords
                  const hasExplicitResumeFile = (part: any): boolean => {
                    if (!part) return false;
                    const fileName = (part.parameters?.name || part.dispositionParameters?.filename || "").toLowerCase();
                    if (fileName && ["pdf", "docx", "doc", "txt"].some(ext => fileName.endsWith(ext))) {
                      const lowerName = fileName.toLowerCase();
                      const blacklist = [
                        "payslip", "pay slip", "pay_slip", "salary",
                        "challan", "ecr", "gst", "tax", "audit", "balance",
                        "ticket", "boarding", "flight", "booking", "travel", "paid",
                        "invoice", "receipt", "bill", "payment", "transaction", "voucher", "statement", "ledger", "wallet", "bank", "account details",
                        "scan", "mri", "xray", "medical", "prescription",
                        "tender", "agreement", "contract", "proposal",
                        "issue", "incident", "log", "report", "reports",
                        "program", "training", "certificate", "course"
                      ];
                      if (blacklist.some(keyword => lowerName.includes(keyword)) || lowerName.includes(" to ")) {
                        return false;
                      }
                      if (lowerName.includes("resume") || lowerName.includes("cv") || lowerName.includes("curriculum") || lowerName.includes("biodata") || lowerName.includes("profile") || lowerName.includes("portfolio") || lowerName.includes("candidate") || lowerName.includes("application")) {
                        return true;
                      }
                    }
                    if (part.childNodes && Array.isArray(part.childNodes)) {
                      for (const child of part.childNodes) {
                        if (hasExplicitResumeFile(child)) return true;
                      }
                    }
                    return false;
                  };
                  if (hasExplicitResumeFile(msg.bodyStructure)) {
                    shouldFetch = true;
                  }
                }

                // Only download the full message source if it looks like a candidate application/JD
                if (shouldFetch) {
                  try {
                    console.log(`[Zoho Integration] Downloading full message source for matched email: "${subject}" (Seq: ${msg.seq})`);
                    const fullMsg = await client.fetchOne(msg.seq, { source: true });
                    if (fullMsg && fullMsg.source) {
                      const parsed = await simpleParser(fullMsg.source);
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

                      emails.push({
                        id: msg.seq.toString(),
                        sender,
                        subject,
                        bodyText: parsed.text || "",
                        bodyHtml: parsed.html || "",
                        receivedAt: date,
                        attachments,
                        folder: folderPath
                      });
                    }
                  } catch (fetchErr) {
                    console.error(`[Zoho Integration] Failed to parse message sequence ${msg.seq} in folder "${folderPath}":`, fetchErr);
                  }
                }
              }
            }
          } finally {
            lock.release();
          }
        } catch (folderErr: any) {
          console.warn(`[Zoho Integration] Skipping folder "${folderPath}" due to error:`, folderErr.message);
        }
      }
      await client.logout();
    } catch (err: any) {
      console.error("[Zoho Integration] IMAP sync failed:", err.message);
      try { await client.logout(); } catch {}
      throw err;
    }

    return emails;
  }

  async markAsRead(emailId: string, folder: string = "INBOX"): Promise<void> {
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
      const lock = await client.getMailboxLock(folder);
      try {
        const seq = parseInt(emailId, 10);
        if (!isNaN(seq)) {
          await client.messageFlagsAdd({ seq }, ["\\Seen"]);
          console.log(`[Zoho Integration] Marked email sequence ${emailId} in folder "${folder}" as read (Seen).`);
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err: any) {
      console.error(`[Zoho Integration] Failed to mark email ${emailId} in folder "${folder}" as read:`, err.message);
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

  async markAsRead(emailId: string, folder?: string): Promise<void> {
    console.log(`[IMAP Fallback] Marking message ${emailId} in folder ${folder} as read.`);
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

  async markAsRead(emailId: string, folder?: string): Promise<void> {
    console.log(`[Mock Email Sync] Marked mock message ${emailId} in folder ${folder} as sync read.`);
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
