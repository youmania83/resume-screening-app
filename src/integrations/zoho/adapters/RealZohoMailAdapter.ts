// src/integrations/zoho/adapters/RealZohoMailAdapter.ts

import nodemailer from "nodemailer";
import dns from "dns";
import { ZohoMailAdapter, ZohoEmailMessage, ZohoEmailAttachment } from "./ZohoMailAdapter";
import { zohoConfig, isZohoConfigured } from "../config/zoho.config";

export class RealZohoMailAdapter implements ZohoMailAdapter {
  private checkConfig() {
    if (!isZohoConfigured()) {
      throw new Error(
        "Zoho Mail integration is not fully configured. Please configure ZOHO_SMTP_USER and ZOHO_SMTP_PASSWORD (for SMTP sending) or ZOHO_MAIL_CLIENT_ID, ZOHO_MAIL_CLIENT_SECRET, ZOHO_MAIL_REFRESH_TOKEN (for API fetching)."
      );
    }
  }

  /**
   * Helper to resolve SMTP hostname to IPv4 to prevent connection timeouts on some platforms.
   */
  private async resolveSmtpIp(host: string): Promise<string> {
    return new Promise<string>((resolve) => {
      dns.lookup(host, { family: 4 }, (err, address) => {
        if (err) {
          console.warn(`[Zoho SMTP] DNS lookup failed for ${host}, using hostname directly:`, err.message);
          resolve(host);
        } else {
          resolve(address);
        }
      });
    });
  }

  /**
   * Sends an email via Zoho SMTP using the app password.
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
  ): Promise<void> {
    this.checkConfig();
    const { smtpHost, smtpPort, smtpUser, smtpPassword, senderName } = zohoConfig;

    if (!smtpUser || !smtpPassword) {
      console.warn("⚠️ [RealZohoMailAdapter] SMTP credentials missing. Using Mock fallback.");
      return;
    }

    const resolvedIp = await this.resolveSmtpIp(smtpHost);
    const fromEmail = senderName ? `"${senderName}" <${smtpUser}>` : smtpUser;

    console.log(`🔌 [RealZohoMailAdapter] Connecting to Zoho SMTP at ${smtpHost} (${resolvedIp}) on port ${smtpPort}...`);

    const transporter = nodemailer.createTransport({
      host: resolvedIp,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for 587
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      connectionTimeout: 10000,
      socketTimeout: 10000,
      tls: {
        servername: smtpHost,
        rejectUnauthorized: false // avoids self-signed or domain mismatch certificate errors on custom domains
      }
    } as any);

    await transporter.verify();

    const mailOptions: any = {
      from: fromEmail,
      to,
      subject,
      html,
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments;
    }

    console.log(`✉️ [RealZohoMailAdapter] Sending email to ${to} (Subject: "${subject}")`);
    await transporter.sendMail(mailOptions);
    console.log(`✅ [RealZohoMailAdapter] Email successfully sent to ${to}`);
  }

  /**
   * Obtains an OAuth2 access token using client details and refresh token.
   */
  private async getAccessToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken } = zohoConfig;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Zoho OAuth2 credentials (clientId, clientSecret, refreshToken) are missing.");
    }

    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });

    const tokenUrl = "https://accounts.zoho.com/oauth/v2/token";
    console.log("🔑 [RealZohoMailAdapter] Requesting fresh Zoho OAuth2 access token...");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to refresh Zoho Access Token: ${response.statusText} - ${errText}`);
    }

    const data = await response.json() as { access_token?: string; error?: string };
    if (data.error || !data.access_token) {
      throw new Error(`Zoho Token Server returned error: ${data.error || "no access_token returned"}`);
    }

    return data.access_token;
  }

  /**
   * Fetches incoming unread emails from the Zoho inbox.
   */
  async fetchIncomingEmails(): Promise<ZohoEmailMessage[]> {
    this.checkConfig();
    try {
      const accessToken = await this.getAccessToken();

      // 1. Get Zoho Mail account info
      const accountsUrl = "https://mail.zoho.com/api/v1/accounts";
      const accountsRes = await fetch(accountsUrl, {
        headers: {
          "Authorization": `Zoho-oauthtoken ${accessToken}`,
        },
      });

      if (!accountsRes.ok) {
        throw new Error(`Failed to retrieve Zoho accounts: ${accountsRes.statusText}`);
      }

      const accountsData = await accountsRes.json() as { data?: Array<{ accountId: string; emailAddress: string }> };
      const account = accountsData.data?.[0];
      if (!account) {
        throw new Error("No active Zoho Mail account associated with the provided credentials.");
      }

      const accountId = account.accountId;
      console.log(`📥 [RealZohoMailAdapter] Zoho Mail Account ID: ${accountId} (${account.emailAddress})`);

      // 2. Fetch unread messages from Inbox
      const messagesUrl = `https://mail.zoho.com/api/v1/accounts/${accountId}/messages?status=unread&limit=20`;
      const messagesRes = await fetch(messagesUrl, {
        headers: {
          "Authorization": `Zoho-oauthtoken ${accessToken}`,
        },
      });

      if (!messagesRes.ok) {
        throw new Error(`Failed to retrieve messages: ${messagesRes.statusText}`);
      }

      const messagesData = await messagesRes.json() as { data?: Array<any> };
      const messages = messagesData.data || [];
      console.log(`Found ${messages.length} unread Zoho emails.`);

      const result: ZohoEmailMessage[] = [];

      for (const msg of messages) {
        try {
          const messageId = msg.messageId;
          const fromAddress = msg.sender;
          const fromName = msg.fromName || fromAddress.split("@")[0];
          const subject = msg.subject || "No Subject";
          const sentTimeMs = Number(msg.sentTimeInMiliSeconds) || Date.now();
          const date = new Date(sentTimeMs);

          // 3. Fetch full message details to extract content and check for attachments
          const detailUrl = `https://mail.zoho.com/api/v1/accounts/${accountId}/messages/${messageId}/content`;
          const detailRes = await fetch(detailUrl, {
            headers: {
              "Authorization": `Zoho-oauthtoken ${accessToken}`,
            },
          });

          if (!detailRes.ok) {
            console.warn(`[RealZohoMailAdapter] Skipping message ${messageId} due to content fetch error.`);
            continue;
          }

          const detailData = await detailRes.json() as { data?: { content?: string; hasAttachment?: string; attachments?: Array<any> } };
          const body = detailData.data?.content || msg.summary || "";
          const attachments: ZohoEmailAttachment[] = [];

          // 4. Handle attachments
          const rawAttachments = detailData.data?.attachments || [];
          for (const attach of rawAttachments) {
            try {
              const attachmentId = attach.attachmentId;
              const filename = attach.attachmentName;
              const contentType = attach.contentType;

              // Download attachment buffer
              const attachUrl = `https://mail.zoho.com/api/v1/accounts/${accountId}/messages/${messageId}/attachments/${attachmentId}`;
              const attachRes = await fetch(attachUrl, {
                headers: {
                  "Authorization": `Zoho-oauthtoken ${accessToken}`,
                },
              });

              if (attachRes.ok) {
                const buffer = Buffer.from(await attachRes.arrayBuffer());
                attachments.push({
                  filename,
                  content: buffer,
                  contentType,
                });
              }
            } catch (attachErr: any) {
              console.error(`Failed to download Zoho attachment ${attach.attachmentName}:`, attachErr.message || attachErr);
            }
          }

          result.push({
            id: messageId,
            fromEmail: fromAddress,
            fromName,
            subject,
            body,
            date,
            attachments,
          });

          // 5. Mark message as read in Zoho Mail
          const markReadUrl = `https://mail.zoho.com/api/v1/accounts/${accountId}/messages/${messageId}`;
          await fetch(markReadUrl, {
            method: "PUT",
            headers: {
              "Authorization": `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "read",
            }),
          });

        } catch (msgErr: any) {
          console.error(`Error loading Zoho message details for ${msg.messageId}:`, msgErr.message || msgErr);
        }
      }

      return result;
    } catch (err: any) {
      console.warn("⚠️ [RealZohoMailAdapter] API inbox fetch failed, returning empty list:", err.message || err);
      return [];
    }
  }
}
