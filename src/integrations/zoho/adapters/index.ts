// src/integrations/zoho/adapters/index.ts

import { ZohoMailAdapter } from "./ZohoMailAdapter";
import { MockZohoMailAdapter } from "./MockZohoMailAdapter";
import { RealZohoMailAdapter } from "./RealZohoMailAdapter";
import { isZohoConfigured } from "../config/zoho.config";

let activeAdapter: ZohoMailAdapter | null = null;

export function getZohoAdapter(): ZohoMailAdapter {
  if (!activeAdapter) {
    if (isZohoConfigured()) {
      console.log("🔌 Initializing Real Zoho Mail Integration Adapter");
      activeAdapter = new RealZohoMailAdapter();
    } else {
      console.log("🧪 Initializing Mock Zoho Mail Integration Adapter (Zoho integration disabled/not configured)");
      activeAdapter = new MockZohoMailAdapter();
    }
  }
  return activeAdapter;
}

export * from "./ZohoMailAdapter";
export * from "./MockZohoMailAdapter";
export * from "./RealZohoMailAdapter";
export { isZohoConfigured } from "../config/zoho.config";
