// src/integrations/keka/services/applications.service.ts

import { getKekaAdapter } from "../adapters";
import { KekaApplication } from "../interfaces/Application";
import { query } from "../../../lib/db";

export class KekaApplicationsService {
  private getAdapter() {
    return getKekaAdapter();
  }

  async getApplications(): Promise<KekaApplication[]> {
    return this.getAdapter().getApplications();
  }

  async moveCandidateStage(candidateId: string, stageNameOrId: string): Promise<KekaApplication> {
    const targetTenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
    const app = await this.getAdapter().moveCandidateStage(candidateId, stageNameOrId);
    
    // Update local applications table
    await query(`
      INSERT INTO applications (id, tenant_id, candidate_id, job_id, application_date, status, stage, source, external_id, source_system, sync_status, last_synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        stage = EXCLUDED.stage,
        status = EXCLUDED.status,
        sync_status = EXCLUDED.sync_status,
        last_synced_at = EXCLUDED.last_synced_at
    `, [
      app.id,
      targetTenantId,
      app.candidateId,
      app.jobId,
      app.applicationDate,
      app.status,
      app.stage,
      app.source || null,
      app.external_id || app.id,
      app.source_system || "Keka",
      "synced"
    ]);

    // Also update currentStage in candidates table
    await query(`
      UPDATE candidates 
      SET keka_status = $1, status = $2, last_synced_at = NOW()
      WHERE id = $3
    `, [
      stageNameOrId,
      stageNameOrId.toLowerCase() === "rejected" ? "rejected" : "applied",
      candidateId
    ]);

    return app;
  }

  async syncApplicationsFromKeka(): Promise<void> {
    const targetTenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
    const apps = await this.getApplications();
    for (const app of apps) {
      await query(`
        INSERT INTO applications (id, tenant_id, candidate_id, job_id, application_date, status, stage, source, external_id, source_system, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          status = EXCLUDED.status,
          stage = EXCLUDED.stage,
          source = EXCLUDED.source,
          external_id = EXCLUDED.external_id,
          source_system = EXCLUDED.source_system,
          sync_status = EXCLUDED.sync_status,
          last_synced_at = EXCLUDED.last_synced_at
      `, [
        app.id,
        targetTenantId,
        app.candidateId,
        app.jobId,
        app.applicationDate,
        app.status,
        app.stage,
        app.source || null,
        app.external_id || app.id,
        app.source_system || "Keka",
        "synced"
      ]);
    }
  }
}

export const kekaApplicationsService = new KekaApplicationsService();
