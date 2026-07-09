// src/test/verifyZohoImap.ts
import dotenv from "dotenv";
import { ZohoProvider } from "../integrations/email/EmailProvider.js";

dotenv.config();

async function runZohoImapTest() {
  console.log("🚀 Testing Zoho IMAP incoming sync...");

  // Load env variables
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASSWORD;

  console.log(`- Configured User: ${user || "Not Defined"}`);
  console.log(`- Configured Password length: ${pass ? pass.length : 0}`);

  if (!user || !pass) {
    console.error("❌ ERROR: ZOHO_SMTP_USER and ZOHO_SMTP_PASSWORD must be configured in environment.");
    process.exit(1);
  }

  const provider = new ZohoProvider();

  try {
    console.log("\n📡 Establishing connection to imap.zoho.com:993...");
    const emails = await provider.fetchUnreadEmails();
    console.log(`\n✅ SUCCESS: Successfully fetched unread emails! Found ${emails.length} message(s).`);

    if (emails.length > 0) {
      console.log("\n📧 Message Summary:");
      emails.forEach((email, idx) => {
        console.log(`[${idx + 1}] From: ${email.sender}`);
        console.log(`    Subject: ${email.subject}`);
        console.log(`    Received: ${email.receivedAt.toISOString()}`);
        console.log(`    Attachments: ${email.attachments.length}`);
        email.attachments.forEach(att => {
          console.log(`      - ${att.fileName} (${att.mimeType}) - ${att.content.length} bytes`);
        });
      });
    } else {
      console.log("\nℹ️ No unread emails found in your Zoho INBOX folder.");
    }
  } catch (err: any) {
    console.error("\n❌ Zoho IMAP Connection or Ingestion FAILED:");
    console.error(err.message || err);
    process.exit(1);
  }
}

runZohoImapTest();
