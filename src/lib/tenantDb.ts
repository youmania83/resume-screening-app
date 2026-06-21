// src/lib/tenantDb.ts
import { query } from "./db.js";
import { getTenantContext } from "./tenantContext.js";
import type { QueryResult } from "pg";

/**
 * Executes a query with automatic tenant scoping.
 * The SQL query must contain ':tenant_id' placeholder.
 * It will automatically bind the request-scoped tenantId.
 */
export async function queryTenant(text: string, params: any[] = []): Promise<QueryResult<any>> {
  const context = getTenantContext();
  if (!context) {
    throw new Error(`Database Isolation Error: Scoped query executed outside of an active tenant context. SQL: "${text}"`);
  }

  let finalSql = text;
  const finalParams = [...params];

  if (text.includes(":tenant_id")) {
    finalParams.push(context.tenantId);
    const paramIndex = finalParams.length;
    // Replace all occurrences of :tenant_id with standard pg placeholder, e.g. $N
    finalSql = text.replace(/:tenant_id/g, `$${paramIndex}`);
  } else {
    // Safety check: force developers to explicitly handle tenant scoping
    // unless they explicitly use queryGlobal
    throw new Error(`Database Scope Violation: Scoped queries must contain the ':tenant_id' placeholder to ensure strict isolation. SQL: "${text}"`);
  }

  return query(finalSql, finalParams);
}

/**
 * Executes a global query bypassing tenant validation.
 * Use strictly for:
 * 1. User registration & login lookup
 * 2. Incoming Zoho/Keka webhooks before identifying tenant
 * 3. Stripe billing webhook operations
 * 4. System health and diagnostics
 */
export async function queryGlobal(text: string, params: any[] = []): Promise<QueryResult<any>> {
  return query(text, params);
}
export default queryTenant;
