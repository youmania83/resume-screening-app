// src/api/routes/metricsRouter.ts
import { Router } from "express";
import { queryGlobal } from "../../lib/tenantDb.js";
import { connection, jobQueue } from "../queue.js";
import { logger } from "../../lib/logger.js";

const router = Router();

// Global counter for API requests (in-memory)
export const metricsState = {
  apiRequestsTotal: 0
};

router.get("/", async (req, res) => {
  try {
    // 1. Fetch metrics from DB
    const activeUsersRes = await queryGlobal("SELECT COUNT(*) as count FROM users;");
    const screenedRes = await queryGlobal("SELECT COUNT(*) as count FROM resume_inbox WHERE status IN ('Processed', 'Needs Review');");
    const pendingRes = await queryGlobal("SELECT COUNT(*) as count FROM resume_inbox WHERE status IN ('Queued', 'Processing');");
    const failedRes = await queryGlobal("SELECT COUNT(*) as count FROM resume_inbox WHERE status = 'Failed';");
    const emailsSentRes = await queryGlobal("SELECT COUNT(*) as count FROM email_logs WHERE delivery_status = 'sent';");
    const interviewsScheduledRes = await queryGlobal("SELECT COUNT(*) as count FROM interviews WHERE status = 'scheduled';");
    
    const avgAiRes = await queryGlobal(`
      SELECT AVG(duration_ms) as avg_time 
      FROM resume_processing_logs 
      WHERE step = 'Screening' AND status = 'Success';
    `);
    const avgParseRes = await queryGlobal(`
      SELECT AVG(duration_ms) as avg_time 
      FROM resume_processing_logs 
      WHERE step = 'Parsing' AND status = 'Success';
    `);

    // 2. Fetch metrics from BullMQ Queue
    let queueSize = 0;
    try {
      const jobsCount = await jobQueue.getJobCounts("waiting", "active", "delayed");
      queueSize = (jobsCount.waiting || 0) + (jobsCount.active || 0) + (jobsCount.delayed || 0);
    } catch (qErr: any) {
      logger.warn("Failed to get BullMQ queue metrics directly from Redis, falling back to database count:", qErr.message);
      queueSize = parseInt(pendingRes.rows[0].count || "0", 10);
    }

    const activeUsers = parseInt(activeUsersRes.rows[0].count || "0", 10);
    const screenedResumes = parseInt(screenedRes.rows[0].count || "0", 10);
    const pendingResumes = parseInt(pendingRes.rows[0].count || "0", 10);
    const failedResumes = parseInt(failedRes.rows[0].count || "0", 10);
    const emailsSent = parseInt(emailsSentRes.rows[0].count || "0", 10);
    const interviewsScheduled = parseInt(interviewsScheduledRes.rows[0].count || "0", 10);
    const avgAiResponse = Math.round(parseFloat(avgAiRes.rows[0].avg_time || "0"));
    const avgParsingTime = Math.round(parseFloat(avgParseRes.rows[0].avg_time || "0"));

    // Get system resource usage
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // 3. Format into Prometheus Text Exposition Format
    let metricsText = "";
    
    // Active Users
    metricsText += `# HELP rison_active_users Total active users registered\n`;
    metricsText += `# TYPE rison_active_users gauge\n`;
    metricsText += `rison_active_users ${activeUsers}\n\n`;

    // Screened Resumes
    metricsText += `# HELP rison_resumes_screened_total Total resumes successfully parsed and screened\n`;
    metricsText += `# TYPE rison_resumes_screened_total counter\n`;
    metricsText += `rison_resumes_screened_total ${screenedResumes}\n\n`;

    // Pending Resumes
    metricsText += `# HELP rison_resumes_pending_total Resumes currently queued or being processed\n`;
    metricsText += `# TYPE rison_resumes_pending_total gauge\n`;
    metricsText += `rison_resumes_pending_total ${pendingResumes}\n\n`;

    // Failed Resumes
    metricsText += `# HELP rison_resumes_failed_total Resumes that failed parsing or screening\n`;
    metricsText += `# TYPE rison_resumes_failed_total counter\n`;
    metricsText += `rison_resumes_failed_total ${failedResumes}\n\n`;

    // Emails Sent
    metricsText += `# HELP rison_emails_sent_total Total outbound recruitment emails sent\n`;
    metricsText += `# TYPE rison_emails_sent_total counter\n`;
    metricsText += `rison_emails_sent_total ${emailsSent}\n\n`;

    // Interviews Scheduled
    metricsText += `# HELP rison_interviews_scheduled_total Total interviews scheduled with candidates\n`;
    metricsText += `# TYPE rison_interviews_scheduled_total counter\n`;
    metricsText += `rison_interviews_scheduled_total ${interviewsScheduled}\n\n`;

    // Average AI Response Time
    metricsText += `# HELP rison_average_ai_response_time_ms Average time taken by AI to screen a resume\n`;
    metricsText += `# TYPE rison_average_ai_response_time_ms gauge\n`;
    metricsText += `rison_average_ai_response_time_ms ${avgAiResponse}\n\n`;

    // Average Parsing Time
    metricsText += `# HELP rison_average_parsing_time_ms Average time taken to parse a resume document\n`;
    metricsText += `# TYPE rison_average_parsing_time_ms gauge\n`;
    metricsText += `rison_average_parsing_time_ms ${avgParsingTime}\n\n`;

    // BullMQ Queue Size
    metricsText += `# HELP rison_queue_size BullMQ resume evaluation queue depth\n`;
    metricsText += `# TYPE rison_queue_size gauge\n`;
    metricsText += `rison_queue_size ${queueSize}\n\n`;

    // API Requests Total
    metricsText += `# HELP rison_api_requests_total Total API requests received\n`;
    metricsText += `# TYPE rison_api_requests_total counter\n`;
    metricsText += `rison_api_requests_total ${metricsState.apiRequestsTotal}\n\n`;

    // Node memory footprints
    metricsText += `# HELP node_memory_rss_bytes Node process resident set size in bytes\n`;
    metricsText += `# TYPE node_memory_rss_bytes gauge\n`;
    metricsText += `node_memory_rss_bytes ${memoryUsage.rss}\n\n`;

    metricsText += `# HELP node_memory_heap_used_bytes Node process heap used in bytes\n`;
    metricsText += `# TYPE node_memory_heap_used_bytes gauge\n`;
    metricsText += `node_memory_heap_used_bytes ${memoryUsage.heapUsed}\n\n`;

    // Node CPU footprints
    metricsText += `# HELP node_cpu_user_time_microseconds CPU user time consumed in microseconds\n`;
    metricsText += `# TYPE node_cpu_user_time_microseconds counter\n`;
    metricsText += `node_cpu_user_time_microseconds ${cpuUsage.user}\n\n`;

    metricsText += `# HELP node_cpu_system_time_microseconds CPU system time consumed in microseconds\n`;
    metricsText += `# TYPE node_cpu_system_time_microseconds counter\n`;
    metricsText += `node_cpu_system_time_microseconds ${cpuUsage.system}\n`;

    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.end(metricsText);
  } catch (error: any) {
    logger.error("Failed to generate Prometheus metrics:", error);
    res.status(500).set("Content-Type", "text/plain").send("Internal Server Error generating metrics");
  }
});

export default router;
