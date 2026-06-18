// src/integrations/keka/services/stages.service.ts

import { query } from "../../../lib/db";
import { KekaStage } from "../interfaces/Stage";

export class KekaStagesService {
  async getStages(): Promise<KekaStage[]> {
    const res = await query("SELECT * FROM stages ORDER BY order_index ASC");
    return res.rows;
  }

  // Populate default recruitment pipeline stages
  async seedDefaultStages(): Promise<void> {
    const defaultStages: KekaStage[] = [
      { id: "applied", name: "Applied", description: "Candidate has applied or been sourced", order_index: 1 },
      { id: "hr_review", name: "HR Review", description: "HR manually reviewing scores and resume match details", order_index: 2 },
      { id: "assessment", name: "Assessment", description: "Candidate taking or completed online MCQs test", order_index: 3 },
      { id: "interview", name: "Interview", description: "Technical and behavioral interviews scheduled", order_index: 4 },
      { id: "offer", name: "Offer", description: "Offer letter generated and negotiations in progress", order_index: 5 },
      { id: "hired", name: "Hired", description: "Offer accepted, candidate onboarded", order_index: 6 },
      { id: "rejected", name: "Rejected", description: "Candidate failed scoring, assessment or interview", order_index: 7 }
    ];

    for (const stage of defaultStages) {
      await query(`
        INSERT INTO stages (id, name, description, order_index, external_id, source_system, sync_status, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          order_index = EXCLUDED.order_index,
          last_synced_at = NOW()
      `, [
        stage.id,
        stage.name,
        stage.description || null,
        stage.order_index,
        stage.id,
        "System",
        "synced"
      ]);
    }
  }
}

export const kekaStagesService = new KekaStagesService();
