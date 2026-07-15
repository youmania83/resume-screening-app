// src/lib/queue/emailQueue.ts

import { Queue } from "bullmq";
import { queryGlobal } from "../tenantDb.js";
import { connection } from "../../api/queue.js";
import crypto from "crypto";

export interface EmailJobAttachment {
  filename: string;
  content: string; // base64 string
  contentType: string;
}

export interface EmailJobPayload {
  tenantId: string;
  emailLogId: string;
  recipient: string;
  subject: string;
  html: string;
  template: string;
  candidateId?: string;
  attachments?: EmailJobAttachment[];
}

let bullQueue: Queue | null = null;
let isRedisConnected = false;

// Attempt to initialize BullMQ for email sending
try {
  bullQueue = new Queue("email-send-queue", {
    connection,
    defaultJobOptions: {
      attempts: 5, // Retry up to 5 times for SMTP network glitches
      backoff: {
        type: "exponential",
        delay: 10000, // 10 seconds initial delay, doubling each retry
      },
      removeOnComplete: true,
      removeOnFail: false, // Keep failed jobs in queue history for DLQ inspection
    },
  });

  bullQueue.on("error", (err) => {
    console.error("🚨 [Email Queue] BullMQ Error:", err.message || err);
  });

  // Basic connection ping test
  const client = await (bullQueue.client);
  await (client as any).ping();
  isRedisConnected = true;
  console.log("🚀 [Email Queue] BullMQ connected to Redis successfully.");
} catch (err: any) {
  console.warn("⚠️ [Email Queue] Redis/BullMQ offline or unconfigured. Falling back to DB-driven queue runner.", err.message || err);
}

export class EmailQueue {
  /**
   * Enqueues an email dispatch job.
   */
  static async enqueue(payload: EmailJobPayload): Promise<string> {
    const { tenantId, emailLogId, recipient, subject, html, template, candidateId } = payload;

    // 1. Ensure a record exists in email_logs
    const logCheck = await queryGlobal(
      "SELECT id FROM email_logs WHERE id = $1 LIMIT 1;",
      [emailLogId]
    );

    if (logCheck.rowCount === 0) {
      await queryGlobal(
        `INSERT INTO email_logs (id, tenant_id, candidate_id, recipient, subject, template, delivery_status, sent_time)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW());`,
        [emailLogId, tenantId, candidateId || null, recipient, subject, template]
      );
    }

    // 2. Dispatch via BullMQ if connected
    if (isRedisConnected && bullQueue) {
      try {
        console.log(`[Email Queue] Enqueuing BullMQ job for email ${emailLogId} to ${recipient}...`);
        await bullQueue.add(`send-${emailLogId}`, payload, { jobId: emailLogId });
        return emailLogId;
      } catch (err: any) {
        console.error("[Email Queue] BullMQ push failed, falling back to DB processor:", err.message);
      }
    }

    // 3. Fallback: Process asynchronously in the background using setTimeout
    console.log(`[Email Queue] Triggering async fallback processing for email ${emailLogId}...`);
    
    setTimeout(async () => {
      try {
        // Dynamically import the worker logic to avoid circular dependency
        const { processEmailSending } = await import("../../worker/emailWorker.js");
        
        await queryGlobal(
          "UPDATE email_logs SET delivery_status = 'sending' WHERE id = $1;",
          [emailLogId]
        );

        await processEmailSending(payload);
      } catch (err: any) {
        console.error(`[Email Queue Fallback] Failed processing email ${emailLogId}:`, err);
        
        await queryGlobal(
          "UPDATE email_logs SET delivery_status = 'failed', error_message = $1 WHERE id = $2;",
          [err.message || "Unknown error", emailLogId]
        );
      }
    }, 100);

    return emailLogId;
  }

  /**
   * Retrieves current stats of the email queue
   */
  static async getQueueStats(): Promise<{
    provider: "BullMQ" | "PostgreSQL";
    isRedisConnected: boolean;
    pending: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    if (isRedisConnected && bullQueue) {
      try {
        const counts = await bullQueue.getJobCounts();
        return {
          provider: "BullMQ",
          isRedisConnected: true,
          pending: counts.waiting + counts.delayed + counts.paused,
          active: counts.active,
          completed: counts.completed,
          failed: counts.failed,
        };
      } catch (err) {
        console.error("Failed to query BullMQ stats, falling back to DB", err);
      }
    }
    // DB fallback statistics from email_logs table
    const res = await queryGlobal(`
      SELECT 
        COUNT(*) FILTER (WHERE delivery_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE delivery_status = 'sending') as active,
        COUNT(*) FILTER (WHERE delivery_status = 'sent') as completed,
        COUNT(*) FILTER (WHERE delivery_status = 'failed') as failed
      FROM email_logs
    `);
    const counts = res.rows[0];
    return {
      provider: "PostgreSQL",
      isRedisConnected: isRedisConnected,
      pending: parseInt(counts.pending || "0", 10),
      active: parseInt(counts.active || "0", 10),
      completed: parseInt(counts.completed || "0", 10),
      failed: parseInt(counts.failed || "0", 10),
    };
  }
}
