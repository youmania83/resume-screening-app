// src/services/TenantUsageService.ts
import { queryGlobal } from "../lib/tenantDb.js";

export interface PlanLimits {
  resumesLimit: number;
  aiScreensLimit: number;
  jobsLimit: number;
  candidatesLimit: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    resumesLimit: 100,
    aiScreensLimit: 50,
    jobsLimit: 5,
    candidatesLimit: 100
  },
  premium: {
    resumesLimit: Infinity,
    aiScreensLimit: Infinity,
    jobsLimit: Infinity,
    candidatesLimit: Infinity
  },
  enterprise: {
    resumesLimit: Infinity,
    aiScreensLimit: Infinity,
    jobsLimit: Infinity,
    candidatesLimit: Infinity
  }
};

export class TenantUsageService {
  private static async ensureSummaryRow(tenantId: string, month: string): Promise<void> {
    await queryGlobal(
      `INSERT INTO tenant_usage_summary (tenant_id, month)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id, month) DO NOTHING;`,
      [tenantId, month]
    );
  }

  static async incrementMetric(
    tenantId: string,
    metric: "resumes_uploaded" | "ai_screens" | "emails_sent" | "ai_tokens_consumed" | "storage_used" | "storage_files_count" | "active_jobs" | "active_candidates",
    amount: number = 1
  ): Promise<void> {
    const month = new Date().toISOString().substring(0, 7);
    await this.ensureSummaryRow(tenantId, month);
    
    await queryGlobal(
      `UPDATE tenant_usage_summary 
       SET ${metric} = ${metric} + $1 
       WHERE tenant_id = $2 AND month = $3;`,
      [amount, tenantId, month]
    );
  }

  static async decrementMetric(
    tenantId: string,
    metric: "active_jobs" | "active_candidates" | "storage_files_count" | "storage_used",
    amount: number = 1
  ): Promise<void> {
    const month = new Date().toISOString().substring(0, 7);
    await this.ensureSummaryRow(tenantId, month);
    
    await queryGlobal(
      `UPDATE tenant_usage_summary 
       SET ${metric} = GREATEST(0, ${metric} - $1) 
       WHERE tenant_id = $2 AND month = $3;`,
      [amount, tenantId, month]
    );
  }

  static async getUsageSummary(tenantId: string): Promise<any> {
    const month = new Date().toISOString().substring(0, 7);
    await this.ensureSummaryRow(tenantId, month);
    
    const res = await queryGlobal(
      `SELECT * FROM tenant_usage_summary WHERE tenant_id = $1 AND month = $2 LIMIT 1;`,
      [tenantId, month]
    );
    return res.rows[0];
  }
  
  static async getTenantDetails(tenantId: string): Promise<any> {
    const res = await queryGlobal(
      `SELECT plan_tier, credit_balance, plan_expires_at FROM tenants WHERE id = $1 LIMIT 1;`,
      [tenantId]
    );
    return res.rows[0];
  }

  static async deductCredits(tenantId: string, amount: number): Promise<boolean> {
    const res = await queryGlobal(
      `UPDATE tenants 
       SET credit_balance = credit_balance - $1 
       WHERE id = $2 AND credit_balance >= $1 
       RETURNING credit_balance;`,
      [amount, tenantId]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
