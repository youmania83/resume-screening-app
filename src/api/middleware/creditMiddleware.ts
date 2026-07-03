// src/api/middleware/creditMiddleware.ts
import type { Request, Response, NextFunction } from "express";
import { TenantUsageService, PLAN_LIMITS } from "../../services/TenantUsageService.js";
import { getTenantContext } from "../../lib/tenantContext.js";

export function creditCheck(operation: "upload" | "ai_screen" | "job_create") {
  return async (req: Request, res: Response, next: NextFunction) => {
    next();
  };
}
