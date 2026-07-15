// src/lib/tenantContext.ts
import { AsyncLocalStorage } from "async_hooks";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export const DEFAULT_TENANT_ID = "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
export const DEFAULT_USER_ID = "d96c9d53-7870-4d07-894c-586497544f8d";

export function getTenantContext(): TenantContext {
  const store = tenantStorage.getStore();
  return {
    tenantId: DEFAULT_TENANT_ID,
    userId: store?.userId || DEFAULT_USER_ID,
    role: store?.role || "owner"
  };
}
