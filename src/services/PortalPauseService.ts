// src/services/PortalPauseService.ts
import { queryGlobal } from "../lib/tenantDb.js";
import { getTenantContext, DEFAULT_TENANT_ID } from "../lib/tenantContext.js";

export interface PortalPauseStatus {
  is_paused: boolean;
  paused_at: string | null;
  unpaused_at: string | null;
  last_sync_paused_at: string | null;
}

export class PortalPauseService {
  /**
   * Resolves the target tenant ID from context or default.
   */
  private static resolveTenantId(tenantId?: string): string {
    if (tenantId && tenantId !== "default" && tenantId !== "default-tenant") {
      return tenantId;
    }
    const context = getTenantContext();
    if (context?.tenantId && context.tenantId !== "default" && context.tenantId !== "default-tenant") {
      return context.tenantId;
    }
    return process.env.PRODUCTION_TENANT_ID || DEFAULT_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
  }

  /**
   * Checks whether the portal is currently paused for the target tenant.
   */
  static async isPortalPaused(tenantId?: string): Promise<boolean> {
    try {
      const targetId = this.resolveTenantId(tenantId);
      const res = await queryGlobal(
        "SELECT is_paused FROM tenants WHERE id = $1 LIMIT 1;",
        [targetId]
      );
      if (res.rowCount && res.rowCount > 0) {
        return Boolean(res.rows[0].is_paused);
      }
      return false;
    } catch (err: any) {
      console.warn("⚠️ [PortalPauseService] Failed to check pause status:", err.message || err);
      return false;
    }
  }

  /**
   * Retrieves detailed pause status for the target tenant.
   */
  static async getPortalStatus(tenantId?: string): Promise<PortalPauseStatus> {
    const targetId = this.resolveTenantId(tenantId);
    const res = await queryGlobal(
      "SELECT is_paused, paused_at, unpaused_at, last_sync_paused_at FROM tenants WHERE id = $1 LIMIT 1;",
      [targetId]
    );

    if (res.rowCount && res.rowCount > 0) {
      const row = res.rows[0];
      return {
        is_paused: Boolean(row.is_paused),
        paused_at: row.paused_at ? new Date(row.paused_at).toISOString() : null,
        unpaused_at: row.unpaused_at ? new Date(row.unpaused_at).toISOString() : null,
        last_sync_paused_at: row.last_sync_paused_at ? new Date(row.last_sync_paused_at).toISOString() : null
      };
    }

    return {
      is_paused: false,
      paused_at: null,
      unpaused_at: null,
      last_sync_paused_at: null
    };
  }

  /**
   * Pauses the portal for the target tenant.
   * Halts all automated background tasks, AI screening cycles, and sync jobs.
   */
  static async pausePortal(tenantId?: string, userId?: string): Promise<{ success: boolean; paused_at: string; message: string }> {
    const targetId = this.resolveTenantId(tenantId);
    const nowIso = new Date().toISOString();

    await queryGlobal(
      `UPDATE tenants 
       SET is_paused = TRUE, 
           paused_at = $1::timestamptz, 
           last_sync_paused_at = $1::timestamptz 
       WHERE id = $2;`,
      [nowIso, targetId]
    );

    console.log(`⏸️ [PortalPauseService] Portal successfully PAUSED for tenant '${targetId}' at ${nowIso} by user '${userId || "system"}'.`);

    return {
      success: true,
      paused_at: nowIso,
      message: `Portal is now PAUSED. All automated background syncs, AI screening, and reminder jobs are held.`
    };
  }

  /**
   * Unpauses (resumes) the portal for the target tenant.
   * Performs an automated catch-up sync for all operations from the date of pause.
   */
  static async unpausePortal(tenantId?: string, userId?: string): Promise<{
    success: boolean;
    unpaused_at: string;
    paused_at: string | null;
    catchUpSyncResults: any;
    message: string;
  }> {
    const targetId = this.resolveTenantId(tenantId);
    const nowIso = new Date().toISOString();

    // 1. Fetch current pause state to get exact pause date
    const currentStatus = await this.getPortalStatus(targetId);
    const pauseDate = currentStatus.paused_at || currentStatus.last_sync_paused_at;

    // 2. Clear pause state
    await queryGlobal(
      `UPDATE tenants 
       SET is_paused = FALSE, 
           unpaused_at = $1::timestamptz 
       WHERE id = $2;`,
      [nowIso, targetId]
    );

    console.log(`▶️ [PortalPauseService] Portal RESUMED for tenant '${targetId}' at ${nowIso}. Triggering catch-up sync from ${pauseDate || "start"}...`);

    // 3. Perform Catch-Up Sync
    const catchUpResults: Record<string, any> = {};

    // a) Sync Keka Careers Active Jobs
    try {
      const { KekaCareersSyncService } = await import("./KekaCareersSyncService.js");
      const kekaRes = await KekaCareersSyncService.syncActiveJobs();
      catchUpResults.kekaCareersSync = kekaRes;
      console.log(`✅ [Catch-Up Sync] Keka active jobs synced. Count: ${kekaRes.syncedCount}`);
    } catch (err: any) {
      console.error("🚨 [Catch-Up Sync] Keka Careers active jobs sync failed:", err.message || err);
      catchUpResults.kekaCareersSync = { error: err.message };
    }

    // b) Sync Keka API Jobs and Candidates if configured (Triggered in background for fast HTTP response)
    try {
      const { isKekaEnabled } = await import("../integrations/keka/config/keka.config.js");
      if (isKekaEnabled()) {
        const { kekaJobsService } = await import("../integrations/keka/services/jobs.service.js");
        const { kekaCandidatesService } = await import("../integrations/keka/services/candidates.service.js");
        kekaJobsService.syncJobsFromKeka().then(() => {
          return kekaCandidatesService.syncCandidatesFromKeka();
        }).then(() => {
          return kekaCandidatesService.screenUnscreenedCandidates();
        }).catch(err => {
          console.error("🚨 [Catch-Up Sync Background] Keka API sync failed:", err.message || err);
        });
        catchUpResults.kekaApiSync = "Triggered in background";
      }
    } catch (err: any) {
      console.error("🚨 [Catch-Up Sync] Keka API trigger failed:", err.message || err);
      catchUpResults.kekaApiSync = { error: err.message };
    }

    // c) Sync Zoho Mail / IMAP Inbox (Triggered in background for fast response)
    try {
      const { zohoConfig } = await import("../integrations/zoho/config/zoho.config.js");
      const hasSmtpCreds = !!zohoConfig.smtpUser && !!zohoConfig.smtpPassword;
      const hasOAuthCreds = !!zohoConfig.clientId && !!zohoConfig.clientSecret && !!zohoConfig.refreshToken;

      if (hasOAuthCreds) {
        const { zohoMailService } = await import("../integrations/zoho/services/zohoMail.service.js");
        zohoMailService.syncInbox().catch(err => {
          console.error("🚨 [Catch-Up Sync Background] Zoho Mail sync failed:", err.message || err);
        });
        catchUpResults.zohoMailSync = "Triggered in background";
      } else if (hasSmtpCreds || zohoConfig.enabled) {
        const { EmailSyncService } = await import("../integrations/email/EmailSyncService.js");
        EmailSyncService.syncMailbox(targetId, "zoho").catch(err => {
          console.error("🚨 [Catch-Up Sync Background] Email IMAP sync failed:", err.message || err);
        });
        catchUpResults.zohoMailSync = "Triggered in background";
      }
    } catch (err: any) {
      console.error("🚨 [Catch-Up Sync] Zoho mail trigger failed:", err.message || err);
      catchUpResults.zohoMailSync = { error: err.message };
    }

    // d) Run Autonomous Recruitment 30-min AI scoring cycle (Triggered in background for fast response)
    try {
      const { AutonomousRecruitmentService } = await import("./AutonomousRecruitmentService.js");
      AutonomousRecruitmentService.run30MinCycle().catch(err => {
        console.error("🚨 [Catch-Up Sync Background] Autonomous recruitment cycle failed:", err.message || err);
      });
      catchUpResults.autonomousRecruitmentSync = "Triggered in background";
    } catch (err: any) {
      console.error("🚨 [Catch-Up Sync] Autonomous recruitment trigger failed:", err.message || err);
      catchUpResults.autonomousRecruitmentSync = { error: err.message };
    }

    return {
      success: true,
      unpaused_at: nowIso,
      paused_at: pauseDate,
      catchUpSyncResults: catchUpResults,
      message: `Portal unpaused successfully. Catch-up sync completed starting from ${pauseDate || "pause timestamp"}.`
    };
  }
}
