// src/api/middleware/creditMiddleware.ts
import type { Request, Response, NextFunction } from "express";
import { TenantUsageService, PLAN_LIMITS } from "../../services/TenantUsageService.js";
import { getTenantContext } from "../../lib/tenantContext.js";

export function creditCheck(operation: "upload" | "ai_screen" | "job_create") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req.headers["x-tenant-id"] as string) || (req as any).user?.tenantId || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
      const tenant = await TenantUsageService.getTenantDetails(tenantId);

      if (tenant && tenant.credit_balance <= 0 && tenant.plan_tier !== "enterprise") {
        return res.status(402).json({
          success: false,
          error: "Exhausted credits - Upgrade Plan Required. Please top up your credit balance or upgrade to premium."
        });
      }

      next();
    } catch (err: any) {
      console.error("[Credit Middleware] Error checking tenant credits:", err);
      next();
    }
  };
}
