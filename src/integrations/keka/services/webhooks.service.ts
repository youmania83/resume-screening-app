// src/integrations/keka/services/webhooks.service.ts

import { query } from "../../../lib/db";
import { v4 as uuidv4 } from "uuid";

export class KekaWebhooksService {
  async logWebhookEvent(eventType: string, payload: any): Promise<string> {
    const eventId = `evt-${uuidv4()}`;
    await query(`
      INSERT INTO webhook_events (id, event_type, payload, status, received_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [eventId, eventType, JSON.stringify(payload), "pending"]);
    return eventId;
  }

  async markEventProcessed(eventId: string): Promise<void> {
    await query(`
      UPDATE webhook_events
      SET status = 'processed', processed_at = NOW(), error_message = NULL
      WHERE id = $1
    `, [eventId]);
  }

  async markEventFailed(eventId: string, error: Error): Promise<void> {
    await query(`
      UPDATE webhook_events
      SET status = 'failed', error_message = $1
      WHERE id = $2
    `, [error.message, eventId]);
  }

  async incrementRetryCount(eventId: string): Promise<void> {
    await query(`
      UPDATE webhook_events
      SET retry_count = retry_count + 1
      WHERE id = $1
    `, [eventId]);
  }

  async getPendingEvents(): Promise<any[]> {
    const res = await query(`
      SELECT * FROM webhook_events
      WHERE status = 'pending' OR (status = 'failed' AND retry_count < 3)
      ORDER BY received_at ASC
    `);
    return res.rows;
  }
}

export const kekaWebhooksService = new KekaWebhooksService();
