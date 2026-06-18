// src/api/routes/healthRouter.ts
import { Router } from "express";

const router = Router();
router.get("/", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});
export default router;
