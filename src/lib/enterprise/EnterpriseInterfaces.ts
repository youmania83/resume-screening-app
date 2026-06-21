// src/lib/enterprise/EnterpriseInterfaces.ts

/**
 * SSO Authentication Provider Interface (Google / Microsoft OAuth2 / Okta)
 */
export interface ISSOProvider {
  name: "Google" | "Microsoft" | "Okta" | "SAML";
  getAuthorizationUrl(tenantId: string, redirectUri: string): Promise<string>;
  handleCallback(tenantId: string, code: string, redirectUri: string): Promise<{
    email: string;
    name: string;
    externalId: string;
    ssoMetadata?: any;
  }>;
}

/**
 * SAML 2.0 Integration Configuration Interface
 */
export interface ISAMLConfig {
  tenantId: string;
  entryPoint: string;
  issuer: string;
  cert: string; // Public Certificate from Identity Provider (IdP)
  attributeMapping: {
    email: string;
    name: string;
    role: string;
  };
  isEnabled: boolean;
}

/**
 * SCIM 2.0 (System for Cross-domain Identity Management) User Provisioning
 */
export interface ISCIMUserProvisioner {
  createUser(tenantId: string, scimUserPayload: any): Promise<{
    userId: string;
    status: "created" | "already_exists";
  }>;
  updateUser(tenantId: string, userId: string, scimUserPayload: any): Promise<void>;
  deleteUser(tenantId: string, userId: string): Promise<void>;
}

/**
 * Compliance & Audit Log Export Configuration
 */
export interface IAuditLogExporter {
  exportLogs(
    tenantId: string,
    filter: { startDate: Date; endDate: Date; userId?: string },
    format: "csv" | "json"
  ): Promise<{
    exportUrl: string;
    totalCount: number;
    generatedAt: Date;
  }>;
}
