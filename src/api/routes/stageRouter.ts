// src/api/routes/stageRouter.ts
import { Router } from "express";
import crypto from "crypto";
import { queryTenant } from "../../lib/tenantDb.js";

const router = Router();

// GET /api/stages - Fetch all stages under tenant
router.get("/", async (req, res, next) => {
  try {
    const result = await queryTenant(
      "SELECT * FROM stages WHERE tenant_id = :tenant_id ORDER BY order_index ASC;"
    );
    res.json({ success: true, stages: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/stages - Create a new custom stage
router.post("/", async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) {
       res.status(400).json({ success: false, error: "Stage name is required" });
       return;
    }

    // Determine next order_index
    const countRes = await queryTenant(
      "SELECT COALESCE(MAX(order_index), -1) as max_idx FROM stages WHERE tenant_id = :tenant_id;"
    );
    const nextIdx = (countRes.rows[0]?.max_idx ?? -1) + 1;
    const stageId = crypto.randomUUID();

    await queryTenant(
      `INSERT INTO stages (id, tenant_id, name, description, order_index, is_system)
       VALUES ($1, :tenant_id, $2, $3, $4, FALSE);`,
      [stageId, name, description || null, nextIdx]
    );

    res.status(201).json({ success: true, stageId, name, orderIndex: nextIdx });
  } catch (err) {
    next(err);
  }
});

// PUT /api/stages/reorder - Reorder stages in bulk
router.put("/reorder", async (req, res, next) => {
  try {
    const { stageIds } = req.body as { stageIds: string[] };
    if (!stageIds || !Array.isArray(stageIds)) {
       res.status(400).json({ success: false, error: "stageIds must be an array of stage IDs" });
       return;
    }

    // Execute queries to update order_index
    for (let i = 0; i < stageIds.length; i++) {
      await queryTenant(
        "UPDATE stages SET order_index = $1 WHERE id = $2 AND tenant_id = :tenant_id;",
        [i, stageIds[i]]
      );
    }

    res.json({ success: true, message: "Pipeline stages reordered successfully" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/stages/:id - Update stage details
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) {
       res.status(400).json({ success: false, error: "Stage name is required" });
       return;
    }

    const checkRes = await queryTenant(
      "SELECT * FROM stages WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [id]
    );

    if (checkRes.rowCount === 0) {
       res.status(404).json({ success: false, error: "Stage not found" });
       return;
    }

    await queryTenant(
      "UPDATE stages SET name = $1, description = $2 WHERE id = $3 AND tenant_id = :tenant_id;",
      [name, description || null, id]
    );

    res.json({ success: true, message: "Stage details updated successfully" });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/stages/:id - Delete a custom stage
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkRes = await queryTenant(
      "SELECT * FROM stages WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [id]
    );

    if (checkRes.rowCount === 0) {
       res.status(404).json({ success: false, error: "Stage not found" });
       return;
    }

    const stage = checkRes.rows[0];
    if (stage.is_system) {
       res.status(400).json({ success: false, error: "Core system stages cannot be deleted" });
       return;
    }

    await queryTenant(
      "DELETE FROM stages WHERE id = $1 AND tenant_id = :tenant_id;",
      [id]
    );

    res.json({ success: true, message: "Custom stage deleted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
