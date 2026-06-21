// src/lib/queue/ingestQueue.ts
import { Queue } from "bullmq";
import { queryGlobal } from "../tenantDb.js";
import { parseAndEvalResume } from "../../worker/resumeWorker.js";
import { connection } from "../../api/queue.js";

let bullQueue: Queue | null = null;
let isRedisConnected = false;

// Attempt to initialize BullMQ
try {
  bullQueue = new Queue("resume-eval-queue", {
    connection,
    defaultJobOptions: {
      attempts: 3, // Auto-retry 3 times before moving to DLQ (failed state)
      backoff: {
        type: "exponential",
        delay: 5000, // 5 seconds initial delay
      },
    },
  });

  // Basic connection ping test
  const client = await (bullQueue.client);
  await (client as any).ping();
  isRedisConnected = true;
  console.log("🚀 [Queue Service] BullMQ connected to Redis successfully.");
} catch (err: any) {
  console.warn("⚠️ [Queue Service] Redis/BullMQ offline or unconfigured. Falling back to DB-driven queue runner.", err.message || err);
}

export class IngestQueue {
  /**
   * Enqueues a resume parsing task.
   */
  static async enqueue(
    tenantId: string,
    inboxId: string,
    filePath: string,
    mimeType: string,
    jobId?: string
  ): Promise<void> {
    const payload = { tenantId, inboxId, filePath, mimeType, jobId };

    if (isRedisConnected && bullQueue) {
      try {
        console.log(`[Queue] Enqueuing BullMQ job for inbox ${inboxId}...`);
        await bullQueue.add(`parse-${inboxId}`, payload, { jobId: inboxId });
        return;
      } catch (err: any) {
        console.error("[Queue] BullMQ push failed, falling back to DB processor:", err.message);
      }
    }

    // DB-driven queue fallback: Trigger async background execution immediately
    // without blocking the API response thread
    console.log(`[Queue] Triggering async fallback processing for inbox ${inboxId}...`);
    
    // Non-blocking background promise
    setTimeout(async () => {
      try {
        // Set state to Processing
        await queryGlobal(
          "UPDATE resume_inbox SET status = 'Processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
          [inboxId]
        );

        // Run processor
        await parseAndEvalResume(tenantId, inboxId, filePath, mimeType, jobId);
      } catch (err: any) {
        console.error(`[Queue Fallback] Failed processing inbox ${inboxId}:`, err);
        
        // Log to Dead Letter Queue (Failed state)
        await queryGlobal(
          "UPDATE resume_inbox SET status = 'Failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;",
          [err.message || "Unknown error", inboxId]
        );
      }
    }, 100);
  }

  static async getQueueStats(): Promise<{
    provider: "BullMQ" | "PostgreSQL";
    isRedisConnected: boolean;
    queued: number;
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
          queued: counts.waiting + counts.delayed + counts.paused,
          active: counts.active,
          completed: counts.completed,
          failed: counts.failed,
        };
      } catch (err) {
        console.error("Failed to query BullMQ stats, falling back to DB", err);
      }
    }
    // DB fallback
    const res = await queryGlobal(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'Queued') as queued,
        COUNT(*) FILTER (WHERE status = 'Processing') as active,
        COUNT(*) FILTER (WHERE status = 'Success') as completed,
        COUNT(*) FILTER (WHERE status = 'Failed') as failed
      FROM resume_inbox
    `);
    const counts = res.rows[0];
    return {
      provider: "PostgreSQL",
      isRedisConnected: isRedisConnected,
      queued: parseInt(counts.queued || "0", 10),
      active: parseInt(counts.active || "0", 10),
      completed: parseInt(counts.completed || "0", 10),
      failed: parseInt(counts.failed || "0", 10),
    };
  }
}
