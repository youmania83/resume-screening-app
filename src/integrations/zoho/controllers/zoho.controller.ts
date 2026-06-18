// src/integrations/zoho/controllers/zoho.controller.ts

import { Request, Response } from "express";
import { zohoConfig, isZohoConfigured } from "../config/zoho.config";
import { zohoMailService } from "../services/zohoMail.service";

export class ZohoController {
  /**
   * Returns the configuration status of Zoho Mail integration.
   */
  async getConfigStatus(req: Request, res: Response): Promise<void> {
    res.json({
      enabled: zohoConfig.enabled,
      isConfigured: isZohoConfigured(),
      config: {
        userEmail: zohoConfig.userEmail,
        hasClientId: !!zohoConfig.clientId,
        hasClientSecret: !!zohoConfig.clientSecret,
        hasRefreshToken: !!zohoConfig.refreshToken,
        smtpHost: zohoConfig.smtpHost,
        smtpPort: zohoConfig.smtpPort,
        smtpUser: zohoConfig.smtpUser,
        hasSmtpPassword: !!zohoConfig.smtpPassword,
        pollIntervalMs: zohoConfig.pollIntervalMs
      }
    });
  }

  /**
   * Manually triggers scanning the Zoho Mail recruitment inbox.
   */
  async triggerManualSync(req: Request, res: Response): Promise<void> {
    try {
      console.log("📥 Manually triggering Zoho Mail inbox sync...");
      const result = await zohoMailService.syncInbox();
      
      if (result.errors.length > 0) {
        res.status(207).json({
          success: true,
          message: `Inbox synced with partial successes. Synced candidates: ${result.syncedCandidatesCount}`,
          errors: result.errors
        });
      } else {
        res.json({
          success: true,
          message: `Inbox sync completed successfully. Synced candidates: ${result.syncedCandidatesCount}`
        });
      }
    } catch (err: any) {
      console.error("❌ Zoho Mail synchronization trigger failed:", err);
      res.status(500).json({
        error: "Synchronization failed",
        details: err.message || err
      });
    }
  }
}

export const zohoController = new ZohoController();
