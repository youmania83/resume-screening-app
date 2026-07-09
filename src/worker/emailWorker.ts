// src/worker/emailWorker.ts

import { Worker, Job } from "bullmq";
import { getZohoAdapter } from "../integrations/zoho/adapters/index.js";
import { queryGlobal } from "../lib/tenantDb.js";
import { connection } from "../api/queue.js";
import { EmailJobPayload } from "../lib/queue/emailQueue.js";

/**
 * Mask sensitive credentials or tokens in log strings.
 */
function maskSecrets(message: string): string {
  if (!message) return "";
  return message
    .replace(/(pass|password|secret|token|key)="[^"]*"/gi, '$1="********"')
    .replace(/(pass|password|secret|token|key)=\S+/gi, "$1=********")
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer ********")
    .replace(/Zoho-oauthtoken\s+[a-zA-Z0-9_\-\.]+/gi, "Zoho-oauthtoken ********")
    .replace(/auth:\s*\{\s*user:\s*[^,]+,\s*pass:\s*[^}]+\}/gi, "auth: { user: ***, pass: *** }");
}

/**
 * Core processing function for sending a single email.
 */
export async function processEmailSending(payload: EmailJobPayload): Promise<void> {
  const { tenantId, emailLogId, recipient, subject, html, candidateId, template } = payload;

  console.log(maskSecrets(`📧 [Email Worker] Starting dispatch for job ${emailLogId} to ${recipient}`));

  try {
    // 1. Get the Zoho integration adapter
    const adapter = getZohoAdapter();

    // 2. Dispatch email using the adapter (which connects via Zoho SMTP or Fallback)
    const mailAttachments = payload.attachments?.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.content, "base64"),
      contentType: att.contentType
    }));

    await adapter.sendEmail(recipient, subject, html, mailAttachments);

    // 3. Update database logs on success
    await queryGlobal(
      `UPDATE email_logs 
       SET delivery_status = 'sent', 
           error_message = NULL,
           sent_time = NOW()
       WHERE id = $1;`,
      [emailLogId]
    );

    // 4. Update candidate email status if candidate ID is attached
    if (candidateId) {
      await queryGlobal(
        `UPDATE candidates 
         SET email_status = 'sent' 
         WHERE id = $1 AND tenant_id = $2;`,
        [candidateId, tenantId]
      );

      // Create timeline entry for email dispatch
      const eventTitle = `Email Sent: ${template}`;
      const eventDesc = `Successfully sent email "${subject}" using Zoho Mail SMTP.`;
      await queryGlobal(
        `INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description)
         VALUES (gen_random_uuid(), $1, $2, 'Email Sent', $3, $4);`,
        [tenantId, candidateId, eventTitle, eventDesc]
      );

      // Log to candidate activity log
      await queryGlobal(
        `INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
         VALUES ($1, 'email_sent', $2, $3);`,
        [candidateId, `Email "${subject}" sent to ${recipient}.`, tenantId]
      );
    }

    console.log(`✅ [Email Worker] Job ${emailLogId} successfully sent to ${recipient}`);

  } catch (err: any) {
    const maskedError = maskSecrets(err.message || String(err));
    console.error(`❌ [Email Worker] Attempt failed for job ${emailLogId}: ${maskedError}`);

    // Update log status to failed and store masked error
    await queryGlobal(
      `UPDATE email_logs 
       SET delivery_status = 'failed', 
           error_message = $1,
           retry_count = retry_count + 1
       WHERE id = $2;`,
      [maskedError, emailLogId]
    );

    if (candidateId) {
      await queryGlobal(
        `UPDATE candidates 
         SET email_status = 'failed' 
         WHERE id = $1 AND tenant_id = $2;`,
        [candidateId, tenantId]
      );
    }

    // Re-throw the error so BullMQ handles the automatic retries and delays
    throw err;
  }
}

// Start BullMQ worker process if executed directly or registered in main server thread
const isMain = process.argv[1] && (
  process.argv[1] === import.meta.filename ||
  process.argv[1].endsWith("emailWorker.ts") ||
  process.argv[1].endsWith("emailWorker.js")
);

if (isMain) {
  const emailWorker = new Worker(
    "email-send-queue",
    async (job: Job) => {
      const payload = job.data as EmailJobPayload;
      await processEmailSending(payload);
    },
    { connection }
  );

  emailWorker.on("completed", (job) => {
    console.log(`Job ${job.id} completed successfully!`);
  });

  emailWorker.on("failed", (job, err) => {
    console.error(maskSecrets(`Job ${job?.id} failed after attempts: ${err.message}`));
  });

  console.log("🔧 Standalone Email Worker started – listening on BullMQ queue 'email-send-queue'");
}
