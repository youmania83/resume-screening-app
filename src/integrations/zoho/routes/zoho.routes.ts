// src/integrations/zoho/routes/zoho.routes.ts

import { Router } from "express";
import { zohoController } from "../controllers/zoho.controller";

const router = Router();

// Integration config check
router.get("/integrations/zoho/config", (req, res, next) => {
  zohoController.getConfigStatus(req, res).catch(next);
});

// Manual synchronization trigger
router.post("/integrations/zoho/sync", (req, res, next) => {
  zohoController.triggerManualSync(req, res).catch(next);
});

export default router;
