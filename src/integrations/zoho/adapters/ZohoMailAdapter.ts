// src/integrations/zoho/adapters/ZohoMailAdapter.ts

export interface ZohoEmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface ZohoEmailMessage {
  id: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  date: Date;
  attachments: ZohoEmailAttachment[];
}

export interface ZohoMailAdapter {
  sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
  ): Promise<void>;
  fetchIncomingEmails(): Promise<ZohoEmailMessage[]>;
}
