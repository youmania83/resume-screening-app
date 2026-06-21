// src/api/middleware/creditMiddleware.ts
import type { Request, Response, NextFunction } from "express";
import { TenantUsageService, PLAN_LIMITS } from "../../services/TenantUsageService.js";
import { getTenantContext } from "../../lib/tenantContext.js";

export function creditCheck(operation: "upload" | "ai_screen" | "job_create") {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Resolve tenantId
    const context = getTenantContext();
    const tenantId = context?.tenantId || (req.headers["x-tenant-id"] as string) || req.user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ success: false, error: "Authentication / Tenant ID required for credit validation." });
      return;
    }

    try {
      // 1. Fetch Plan & Credit Info
      const tenant = await TenantUsageService.getTenantDetails(tenantId);
      if (!tenant) {
        res.status(404).json({ success: false, error: "Tenant not found." });
        return;
      }

      const planTier = tenant.plan_tier || "free";
      const creditBalance = tenant.credit_balance ?? 0;
      const planExpiresAt = tenant.plan_expires_at;

      // 2. Check Expiration
      if (planExpiresAt && new Date() > new Date(planExpiresAt)) {
        res.status(402).json({
          success: false,
          error: "Upgrade Plan Required: Your subscription plan has expired.",
          current_plan: planTier,
          remaining_credits: creditBalance,
          upgrade_url: "/upgrade"
        });
        return;
      }

      // 3. Fetch Monthly Summary
      const summary = await TenantUsageService.getUsageSummary(tenantId);
      const limits = PLAN_LIMITS[planTier];

      // 4. Validate limits per operation
      if (operation === "upload") {
        if (summary.resumes_uploaded >= limits.resumesLimit) {
          res.status(402).json({
            success: false,
            error: `Upgrade Plan Required: Monthly resume upload limit of ${limits.resumesLimit} reached for your ${planTier} plan.`,
            current_plan: planTier,
            remaining_credits: creditBalance,
            upgrade_url: "/upgrade"
          });
          return;
        }
        if (creditBalance <= 0) {
          res.status(402).json({
            success: false,
            error: "Upgrade Plan Required: Insufficient credit balance for resume upload.",
            current_plan: planTier,
            remaining_credits: creditBalance,
            upgrade_url: "/upgrade"
          });
          return;
        }
      } else if (operation === "ai_screen") {
        if (summary.ai_screens >= limits.aiScreensLimit) {
          res.status(402).json({
            success: false,
            error: `Upgrade Plan Required: Monthly AI screening limit of ${limits.aiScreensLimit} reached for your ${planTier} plan.`,
            current_plan: planTier,
            remaining_credits: creditBalance,
            upgrade_url: "/upgrade"
          });
          return;
        }
        if (creditBalance < 3) {
          res.status(402).json({
            success: false,
            error: `Upgrade Plan Required: Insufficient credit balance for AI screening. Required: 3, Available: ${creditBalance}`,
            current_plan: planTier,
            remaining_credits: creditBalance,
            upgrade_url: "/upgrade"
          });
          return;
        }
      } else if (operation === "job_create") {
        if (summary.active_jobs >= limits.jobsLimit) {
          res.status(402).json({
            success: false,
            error: `Upgrade Plan Required: Active job openings limit of ${limits.jobsLimit} reached for your ${planTier} plan.`,
            current_plan: planTier,
            remaining_credits: creditBalance,
            upgrade_url: "/upgrade"
          });
          return;
        }
      }

      next();
    } catch (err: any) {
      console.error("[Credit Middleware] Validation exception:", err);
      res.status(500).json({ success: false, error: "Internal credit verification failure." });
    }
  };
}
