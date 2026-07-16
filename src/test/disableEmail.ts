// src/test/disableEmail.ts
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.ZOHO_MAIL_ENABLED = "false";
console.log("🚫 [DisableEmail] SMTP and Zoho email integrations disabled for testing.");
