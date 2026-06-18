// src/integrations/keka/services/offers.service.ts

import { getKekaAdapter } from "../adapters";
import { KekaOffer } from "../interfaces/Offer";
import { query } from "../../../lib/db";

export class KekaOffersService {
  private getAdapter() {
    return getKekaAdapter();
  }

  async getOffers(): Promise<KekaOffer[]> {
    return this.getAdapter().getOffers();
  }

  async createOffer(offerData: Omit<KekaOffer, "id">): Promise<KekaOffer> {
    const offer = await this.getAdapter().createOffer(offerData);
    
    // Save to local offers table
    await query(`
      INSERT INTO offers (id, candidate_id, job_id, salary, joining_date, status, offer_letter_url, external_id, source_system, sync_status, last_synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        salary = EXCLUDED.salary,
        joining_date = EXCLUDED.joining_date,
        sync_status = EXCLUDED.sync_status,
        last_synced_at = EXCLUDED.last_synced_at
    `, [
      offer.id,
      offer.candidateId,
      offer.jobId,
      offer.salary,
      offer.joiningDate,
      offer.status,
      offer.offerLetterUrl || null,
      offer.external_id || offer.id,
      offer.source_system || "Keka",
      "synced"
    ]);

    return offer;
  }
}

export const kekaOffersService = new KekaOffersService();
