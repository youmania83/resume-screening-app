// src/services/tenantRegistrationService.ts
import crypto from "crypto";
import { transaction } from "../lib/db.js";

interface RegistrationResult {
  tenantId: string;
  userId: string;
}

export async function registerTenant(params: {
  companyName: string;
  userName: string;
  email: string;
  passwordHash: string;
  licenseKey: string;
}): Promise<RegistrationResult> {
  const { companyName, userName, email, passwordHash, licenseKey } = params;

  return transaction(async (client) => {
    // 1. Verify license key (lock row for write)
    const licenseRes = await client.query(
      "SELECT * FROM license_keys WHERE key = $1 AND is_used = FALSE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1 FOR UPDATE;",
      [licenseKey]
    );
    if (licenseRes.rowCount === 0) {
      throw new Error("Invalid, expired, or already used license key");
    }
    const license = licenseRes.rows[0];

    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    // 2. Create Tenant with license parameters
    await client.query(
      "INSERT INTO tenants (id, name, plan_tier, credit_balance, plan_expires_at) VALUES ($1, $2, $3, $4, $5);",
      [tenantId, companyName, license.plan_tier, license.credits, license.expires_at]
    );

    // 3. Mark license key as used
    await client.query(
      "UPDATE license_keys SET is_used = TRUE, used_by_tenant_id = $1, used_at = CURRENT_TIMESTAMP WHERE key = $2;",
      [tenantId, licenseKey]
    );

    // 4. Create Owner User
    await client.query(
      "INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, 'owner');",
      [userId, tenantId, userName, email, passwordHash]
    );

    // 5. Seed Default ATS Pipeline Stages for the Tenant in a single Bulk Insert (eliminates N+1)
    const defaultStages = [
      "Applied",
      "Resume Received",
      "AI Screened",
      "Shortlisted",
      "Recruiter Review",
      "Phone Screen",
      "Interview 1",
      "Interview 2",
      "Client Submission",
      "Offer Sent",
      "Hired",
      "Rejected",
    ];

    const stageValues: any[] = [];
    const valueStrings: string[] = [];

    defaultStages.forEach((stageName, i) => {
      const stageId = crypto.randomUUID();
      const isSystem = ["Applied", "AI Screened", "Hired", "Rejected"].includes(stageName);
      const offset = i * 5;
      valueStrings.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      stageValues.push(stageId, tenantId, stageName, i, isSystem);
    });

    const insertStagesSql = `
      INSERT INTO stages (id, tenant_id, name, order_index, is_system)
      VALUES ${valueStrings.join(", ")};
    `;
    await client.query(insertStagesSql, stageValues);

    return { tenantId, userId };
  });
}
