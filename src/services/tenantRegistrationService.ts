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
  licenseKey?: string;
}): Promise<RegistrationResult> {
  const { companyName, userName, email, passwordHash, licenseKey } = params;

  return transaction(async (client) => {
    const tenantId = "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
    const userId = crypto.randomUUID();

    let planTier = "premium";
    let creditBalance = 1000;
    let planExpiresAt: Date | null = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    if (licenseKey && licenseKey.trim() !== "") {
      // 1. Verify license key (lock row for write)
      const licenseRes = await client.query(
        "SELECT * FROM license_keys WHERE key = $1 AND is_used = FALSE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1 FOR UPDATE;",
        [licenseKey.trim()]
      );
      if (licenseRes.rowCount === 0) {
        throw new Error("Invalid, expired, or already used license key");
      }
      const license = licenseRes.rows[0];
      planTier = license.plan_tier;
      creditBalance = license.credits;
      planExpiresAt = license.expires_at;

      // 3. Mark license key as used
      await client.query(
        "UPDATE license_keys SET is_used = TRUE, used_by_tenant_id = $1, used_at = CURRENT_TIMESTAMP WHERE key = $2;",
        [tenantId, licenseKey.trim()]
      );
    }

    // 2. Create Tenant with license parameters (use ON CONFLICT DO UPDATE to avoid constraint violation in single-tenant mode)
    await client.query(
      `INSERT INTO tenants (id, name, plan_tier, credit_balance, plan_expires_at) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
         name = EXCLUDED.name, 
         plan_tier = EXCLUDED.plan_tier, 
         credit_balance = EXCLUDED.credit_balance, 
         plan_expires_at = EXCLUDED.plan_expires_at;`,
      [tenantId, companyName, planTier, creditBalance, planExpiresAt]
    );

    // 4. Create Owner User
    await client.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role) 
       VALUES ($1, $2, $3, $4, $5, 'owner')
       ON CONFLICT (email) DO UPDATE SET 
         name = EXCLUDED.name, 
         password_hash = EXCLUDED.password_hash;`,
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
      VALUES ${valueStrings.join(", ")}
      ON CONFLICT (id) DO NOTHING;
    `;
    await client.query(insertStagesSql, stageValues);

    return { tenantId, userId };
  });
}
