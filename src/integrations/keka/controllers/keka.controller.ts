// src/integrations/keka/controllers/keka.controller.ts

import { Request, Response } from "express";
import { kekaConfig, isKekaEnabled } from "../config/keka.config";
import { kekaWebhooksService } from "../services/webhooks.service";
import { kekaJobsService } from "../services/jobs.service";
import { kekaCandidatesService } from "../services/candidates.service";
import { validateWebhookSignature, processWebhookEvent } from "../webhooks/webhook.handlers";

export class KekaController {
  /**
   * Ingests and registers incoming webhooks.
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers["x-keka-signature"] as string || "";
    const eventType = req.headers["x-keka-event"] as string || "";
    const rawBody = JSON.stringify(req.body);

    if (!eventType) {
      res.status(400).json({ error: "Missing x-keka-event header" });
      return;
    }

    // Validate Signature
    const isValid = validateWebhookSignature(rawBody, signature);
    if (!isValid) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    try {
      // Log event into database first (reliability guarantee)
      const eventId = await kekaWebhooksService.logWebhookEvent(eventType, req.body);
      
      // Process asynchronously to ensure fast HTTP response
      processWebhookEvent(eventId, eventType, req.body).catch(err => {
        console.error(`Error processing background webhook event ${eventId}:`, err);
      });

      res.status(202).json({ 
        success: true, 
        message: "Webhook accepted and queued for processing", 
        eventId 
      });
    } catch (err: any) {
      console.error("Failed to handle webhook payload:", err);
      res.status(500).json({ error: "Failed to record webhook event" });
    }
  }

  /**
   * Returns the current config configuration status (e.g. check variables).
   */
  async getConfigStatus(req: Request, res: Response): Promise<void> {
    res.json({
      enabled: kekaConfig.enabled,
      isConfigured: isKekaEnabled(),
      config: {
        baseUrl: kekaConfig.baseUrl || "Not Configured",
        hasApiKey: !!kekaConfig.apiKey,
        hasClientId: !!kekaConfig.clientId,
        hasClientSecret: !!kekaConfig.clientSecret,
        hasWebhookSecret: !!kekaConfig.webhookSecret
      }
    });
  }

  /**
   * Triggers manual synchronization of active jobs and candidate lists.
   */
  async triggerManualSync(req: Request, res: Response): Promise<void> {
    try {
      console.log("Starting manual Keka synchronization...");
      
      // Synchronize Jobs
      await kekaJobsService.syncJobsFromKeka();
      
      // Synchronize Candidates
      await kekaCandidatesService.syncCandidatesFromKeka();
      
      res.json({
        success: true,
        message: "Manual sync executed successfully. Jobs and candidates synchronized."
      });
    } catch (err: any) {
      console.error("Manual synchronization failed:", err);
      res.status(500).json({ 
        error: "Synchronization failed", 
        details: err.message 
      });
    }
  }
}

export const kekaController = new KekaController();
