// src/integrations/zoho/adapters/RealZohoMailAdapter.ts

import { ZohoMailAdapter, ZohoEmailMessage } from "./ZohoMailAdapter";
import { zohoConfig, isZohoConfigured } from "../config/zoho.config";

export class RealZohoMailAdapter implements ZohoMailAdapter {
  private checkConfig() {
    if (!isZohoConfigured()) {
      throw new Error(
        "Zoho Mail integration is not fully configured. Please configure ZOHO_MAIL_CLIENT_ID, ZOHO_MAIL_CLIENT_SECRET, ZOHO_MAIL_REFRESH_TOKEN or SMTP credentials."
      );
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    this.checkConfig();
    // TODO: Connect to Zoho Mail API POST /api/v1/co/mail/send or SMTP client using Nodemailer
    console.log(`🔌 [RealZohoMailAdapter] Sending email via Zoho Mail API/SMTP to: ${to}`);
    throw new Error("Zoho Mail API - sendEmail endpoint mapping pending active Zoho API keys/credentials.");
  }

  async fetchIncomingEmails(): Promise<ZohoEmailMessage[]> {
    this.checkConfig();
    // TODO: Connect to Zoho Mail API GET /api/v1/accounts/{accountId}/folders/{folderId}/messages
    // or fetch via IMAP using the OAuth2 access token.
    console.log("🔌 [RealZohoMailAdapter] Fetching incoming emails from Zoho Mail API...");
    throw new Error("Zoho Mail API - fetchIncomingEmails endpoint mapping pending active Zoho API keys/credentials.");
  }
}
