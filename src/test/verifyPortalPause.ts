// src/test/verifyPortalPause.ts
import { PortalPauseService } from "../services/PortalPauseService.js";
import { queryGlobal } from "../lib/tenantDb.js";

async function verifyPortalPauseFlow() {
  console.log("🧪 [Verification] Starting Portal Pause & Resume automated test...");
  const testTenantId = "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";

  // Ensure DB columns exist
  await queryGlobal(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS unpaused_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_sync_paused_at TIMESTAMPTZ DEFAULT NULL;
  `);

  try {
    // 1. Initial State Check
    const initialStatus = await PortalPauseService.getPortalStatus(testTenantId);
    console.log("1️⃣ Initial Portal Status:", initialStatus);

    // 2. Test Pause Portal
    console.log("\n2️⃣ Pausing Portal...");
    const pauseResult = await PortalPauseService.pausePortal(testTenantId, "test-runner");
    console.log("Pause Result:", pauseResult);

    const isPaused = await PortalPauseService.isPortalPaused(testTenantId);
    if (!isPaused) {
      throw new Error("❌ Assertion Failed: Portal should be reported as PAUSED.");
    }
    console.log("✅ Assertion Passed: Portal is reported as PAUSED.");

    const pausedStatus = await PortalPauseService.getPortalStatus(testTenantId);
    if (!pausedStatus.is_paused || !pausedStatus.paused_at) {
      throw new Error("❌ Assertion Failed: paused_at timestamp missing.");
    }
    console.log("✅ Assertion Passed: paused_at timestamp recorded accurately:", pausedStatus.paused_at);

    // 3. Test Resume (Unpause) Portal & Catch-Up Sync
    console.log("\n3️⃣ Resuming Portal & Launching Catch-Up Sync...");
    const unpauseResult = await PortalPauseService.unpausePortal(testTenantId, "test-runner");
    console.log("Unpause Result:", {
      success: unpauseResult.success,
      unpaused_at: unpauseResult.unpaused_at,
      paused_at: unpauseResult.paused_at,
      syncResultsKeys: Object.keys(unpauseResult.catchUpSyncResults || {})
    });

    const isPausedAfter = await PortalPauseService.isPortalPaused(testTenantId);
    if (isPausedAfter) {
      throw new Error("❌ Assertion Failed: Portal should be reported as ACTIVE after unpausing.");
    }
    console.log("✅ Assertion Passed: Portal is reported as ACTIVE after unpausing.");

    const finalStatus = await PortalPauseService.getPortalStatus(testTenantId);
    if (finalStatus.is_paused || !finalStatus.unpaused_at) {
      throw new Error("❌ Assertion Failed: unpaused_at timestamp missing or portal still paused.");
    }
    console.log("✅ Assertion Passed: unpaused_at timestamp recorded accurately:", finalStatus.unpaused_at);

    console.log("\n🎉 ALL PORTAL PAUSE & RESUME VERIFICATION CHECKS PASSED PERFECTLY!");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Verification failed:", err.message || err);
    process.exit(1);
  }
}

verifyPortalPauseFlow();
