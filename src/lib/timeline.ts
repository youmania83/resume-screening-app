// src/lib/timeline.ts
import crypto from "crypto";
import { queryTenant } from "./tenantDb.js";

/**
 * Creates an immutable candidate timeline event.
 * Scoped by active tenant context.
 */
export async function logTimelineEvent(
  candidateId: string,
  eventType: string,
  title: string,
  description: string | null = null,
  createdBy: string | null = null
): Promise<void> {
  const eventId = crypto.randomUUID();
  await queryTenant(
    `INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description, created_by)
     VALUES ($1, :tenant_id, $2, $3, $4, $5, $6);`,
    [eventId, candidateId, eventType, title, description, createdBy]
  );
}
