// src/lib/tenantContext.ts
import { AsyncLocalStorage } from "async_hooks";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}
