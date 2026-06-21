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

// 3. Zoho Provider (Simulated API sync integration)
export class ZohoProvider implements IEmailProvider {
  name = "Zoho";

  async fetchUnreadEmails(): Promise<NormalizedEmail[]> {
    console.log("[Zoho Integration] Syncing Zoho Mail Inbox...");
    return [];
  }

  async markAsRead(emailId: string): Promise<void> {
    console.log(`[Zoho Integration] Marking message ${emailId} as read.`);
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
    const emailId = `mock-email-${Date.now()}`;
    if (this.readLogs.has(emailId)) return [];

    console.log("[Mock Email Sync] Pulling mock emails with attachments...");

    // Create a dummy pdf content buffer (simulated)
    const dummyPdfContent = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Title (John Doe Resume) >>\nendobj\nstream\nEmail: john.doe.email@example.com\nPhone: +1 555-123-4567\nSkills: Python, React, Docker, Kubernetes\nendstream\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n310\n%%EOF\n"
    );

    return [
      {
        id: emailId,
        sender: "candidate.apply@example.com",
        subject: "Applying for Python Developer opening - John Doe",
        receivedAt: new Date(),
        attachments: [
          {
            fileName: "John_Doe_Resume_Email.pdf",
            mimeType: "application/pdf",
            content: dummyPdfContent,
          },
        ],
      },
    ];
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
        return new MockEmailProvider();
    }
  }
}
