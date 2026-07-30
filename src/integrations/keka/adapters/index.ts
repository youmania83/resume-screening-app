// src/integrations/keka/adapters/index.ts

import { ATSAdapter } from "./KekaAdapter.js";
import { MockKekaAdapter } from "./MockKekaAdapter.js";
import { RealKekaAdapter } from "./RealKekaAdapter.js";
import { isKekaEnabled } from "../config/keka.config.js";

let activeAdapter: ATSAdapter | null = null;

export function getKekaAdapter(): ATSAdapter {
  if (!activeAdapter) {
    if (isKekaEnabled()) {
      console.log("🔌 Initializing Real Keka ATS Integration Adapter");
      activeAdapter = new RealKekaAdapter();
    } else {
      console.log("🧪 Initializing Mock Keka ATS Integration Adapter (Keka integration disabled/not configured)");
      activeAdapter = new MockKekaAdapter();
    }
  }
  return activeAdapter;
}

export * from "./KekaAdapter.js";
export * from "./MockKekaAdapter.js";
export * from "./RealKekaAdapter.js";
export { isKekaEnabled } from "../config/keka.config.js";
