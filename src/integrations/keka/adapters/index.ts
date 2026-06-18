// src/integrations/keka/adapters/index.ts

import { ATSAdapter } from "./KekaAdapter";
import { MockKekaAdapter } from "./MockKekaAdapter";
import { RealKekaAdapter } from "./RealKekaAdapter";
import { isKekaEnabled } from "../config/keka.config";

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

export * from "./KekaAdapter";
export * from "./MockKekaAdapter";
export * from "./RealKekaAdapter";
export { isKekaEnabled } from "../config/keka.config";
