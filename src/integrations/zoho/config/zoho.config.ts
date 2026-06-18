// src/integrations/zoho/config/zoho.config.ts

import dotenv from "dotenv";
dotenv.config();

export const zohoConfig = {
  enabled: process.env.ZOHO_MAIL_ENABLED === "true",
  userEmail: process.env.ZOHO_MAIL_USER_EMAIL || "jobs@company.com",
  clientId: process.env.ZOHO_MAIL_CLIENT_ID || "",
  clientSecret: process.env.ZOHO_MAIL_CLIENT_SECRET || "",
  refreshToken: process.env.ZOHO_MAIL_REFRESH_TOKEN || "",
  
  // SMTP fallback credentials
  smtpHost: process.env.ZOHO_SMTP_HOST || "smtp.zoho.com",
  smtpPort: Number(process.env.ZOHO_SMTP_PORT) || 465,
  smtpUser: process.env.ZOHO_SMTP_USER || "",
  smtpPassword: process.env.ZOHO_SMTP_PASSWORD || "",
  
  pollIntervalMs: Number(process.env.ZOHO_MAIL_INBOX_POLL_INTERVAL) || 60000
};

export function isZohoConfigured(): boolean {
  return zohoConfig.enabled && (
    (!!zohoConfig.clientId && !!zohoConfig.clientSecret && !!zohoConfig.refreshToken) ||
    (!!zohoConfig.smtpHost && !!zohoConfig.smtpUser && !!zohoConfig.smtpPassword)
  );
}

export default zohoConfig;
