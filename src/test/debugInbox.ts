// src/test/debugInbox.ts
import dotenv from "dotenv";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

dotenv.config();

async function debugInbox() {
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASSWORD;

  if (!user || !pass) {
    console.error("ZOHO credentials missing.");
    process.exit(1);
  }

  console.log(`📡 Connecting to Zoho IMAP to check ALL recent emails for ${user}...`);

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
      // Search for ALL emails received today
      const today = new Date();
      today.setHours(0,0,0,0);
      const searchResults = await client.search({ since: today });
      const resultsCount = Array.isArray(searchResults) ? searchResults.length : 0;
      console.log(`Found ${resultsCount} emails received today.`);

      if (Array.isArray(searchResults)) {
        // Show last 5 emails
        const last5 = searchResults.slice(-5);
        for (const seq of last5) {
          const message = await client.fetchOne(seq, { source: true, flags: true });
          if (message && message.source) {
            const parsed = await simpleParser(message.source);
            const isUnread = !message.flags?.has("\\Seen");
            const sender = parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown";
            console.log(`\n📧 [Seq: ${seq}] [${isUnread ? "UNREAD" : "READ"}]`);
            console.log(`   From: ${sender}`);
            console.log(`   Subject: ${parsed.subject}`);
            console.log(`   Date: ${parsed.date}`);
            console.log(`   Attachments: ${parsed.attachments?.length || 0}`);
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err: any) {
    console.error("IMAP connection failed:", err.message);
  }
}

debugInbox();
