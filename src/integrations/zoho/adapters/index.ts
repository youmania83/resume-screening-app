// src/integrations/zoho/adapters/index.ts

import { ZohoMailAdapter } from "./ZohoMailAdapter.js";
import { MockZohoMailAdapter } from "./MockZohoMailAdapter.js";
import { RealZohoMailAdapter } from "./RealZohoMailAdapter.js";
import { isZohoConfigured } from "../config/zoho.config.js";

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

export * from "./ZohoMailAdapter.js";
export * from "./MockZohoMailAdapter.js";
export * from "./RealZohoMailAdapter.js";
export { isZohoConfigured } from "../config/zoho.config.js";
