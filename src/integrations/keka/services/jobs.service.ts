// src/integrations/keka/services/jobs.service.ts

import { getKekaAdapter } from "../adapters";
import { KekaJob } from "../interfaces/Job";
import { query } from "../../../lib/db";

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
    const jobs = await this.getJobs();
    for (const job of jobs) {
      await query(`
        INSERT INTO jobs (id, title, description, department, location, external_id, source_system, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          department = EXCLUDED.department,
          location = EXCLUDED.location,
          external_id = EXCLUDED.external_id,
          source_system = EXCLUDED.source_system,
          sync_status = EXCLUDED.sync_status,
          last_synced_at = EXCLUDED.last_synced_at
      `, [
        job.id,
        job.title,
        job.description,
        job.department || null,
        job.location || null,
        job.external_id || job.id,
        job.source_system || "Keka",
        "synced"
      ]);
    }
  }
}

export const kekaJobsService = new KekaJobsService();
