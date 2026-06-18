// src/integrations/keka/routes/keka.routes.ts

import { Router } from "express";
import { kekaController } from "../controllers/keka.controller";

const router = Router();

// Webhook intake endpoint
router.post("/webhooks/keka", (req, res, next) => {
  kekaController.handleWebhook(req, res).catch(next);
});

// Integration config check
router.get("/integrations/keka/config", (req, res, next) => {
  kekaController.getConfigStatus(req, res).catch(next);
});

// Manual synchronization trigger
router.post("/integrations/keka/sync", (req, res, next) => {
  kekaController.triggerManualSync(req, res).catch(next);
});

export default router;
