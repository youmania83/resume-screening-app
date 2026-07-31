// src/integrations/keka/services/jobs.service.ts

import { getKekaAdapter } from "../adapters/index.js";
import { KekaJob } from "../interfaces/Job.js";
import { query } from "../../../lib/db.js";

export class KekaJobsService {
  private getAdapter() {
    return getKekaAdapter();
  }

  async getJobs(): Promise<KekaJob[]> {
    return this.getAdapter().getJobs();
  }

  async getJobById(id: string): Promise<KekaJob | null> {
    return this.getAdapter().getJobById(id);
  }

  // Synchronize jobs from Keka into the local database
  async syncJobsFromKeka(): Promise<void> {
    const targetTenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
    const jobs = await this.getJobs();
    for (const job of jobs) {
      // job.status (RealKekaAdapter maps Keka's raw status code to "active" /
      // "closed") was previously never written here, so every job synced via
      // the Hire API defaulted to COALESCE(status,'active') = active forever —
      // a job Keka had already closed kept accepting applications and stayed
      // visible in the portal as an open opening.
      await query(`
        INSERT INTO jobs (id, tenant_id, title, description, department, location, external_id, status, source_system, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          department = EXCLUDED.department,
          location = EXCLUDED.location,
          external_id = EXCLUDED.external_id,
          status = EXCLUDED.status,
          source_system = EXCLUDED.source_system,
          sync_status = EXCLUDED.sync_status,
          last_synced_at = EXCLUDED.last_synced_at
      `, [
        job.id,
        targetTenantId,
        job.title,
        job.description,
        job.department || null,
        job.location || null,
        job.external_id || job.id,
        job.status || "active",
        job.source_system || "Keka",
        "synced"
      ]);
    }
  }
}

export const kekaJobsService = new KekaJobsService();
