// src/lib/cache.ts

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

const store = new Map<string, CacheEntry<any>>();

export const Cache = {
  get<T>(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      store.delete(key);
      return null;
    }
    return entry.value as T;
  },

  set<T>(key: string, value: T, ttlMs: number): void {
    store.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });
  },

  delete(key: string): boolean {
    return store.delete(key);
  },

  clear(): void {
    store.clear();
  },

  invalidatePrefix(prefix: string): void {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }
  }
};

import { getTenantContext } from "./tenantContext.js";

export function cacheInvalidationMiddleware(req: any, res: any, next: any) {
  const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
  
  if (isMutating) {
    const originalUrl = req.originalUrl || req.url || "";
    const isTargetEndpoint = originalUrl.includes("/api/candidates") || 
                             originalUrl.includes("/api/jobs") || 
                             originalUrl.includes("/api/resumes") ||
                             originalUrl.includes("/api/assessment");
                             
    if (isTargetEndpoint) {
      res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const context = getTenantContext();
          const tenantId = context?.tenantId;
          if (tenantId) {
            console.log(`🧹 [Cache Invalidation] Invalidating dashboard cache for tenant ${tenantId} due to ${req.method} ${originalUrl}`);
            Cache.delete(`dashboard-metrics-${tenantId}`);
            Cache.delete(`dashboard-pipeline-${tenantId}`);
          }
        }
      });
    }
  }
  next();
}
