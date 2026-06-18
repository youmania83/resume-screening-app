// src/routes/jobRouter.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../lib/db";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

/**
 * POST /api/jobs
 * Body: { title: string, description: string }
 * Creates a new job entry and returns its UUID.
 */
router.post("/", async (req, res) => {
  const { title, description } = req.body as { title: string; description: string };
  if (!title || !description) {
    return res.status(400).json({ error: "title and description required" });
  }
  const jobId = uuidv4();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO jobs (id, title, description) VALUES ($1, $2, $3)`,
      [jobId, title, description]
    );
    res.status(201).json({ jobId, title, description });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/jobs/:jobId
 * Returns job details.
 */
router.get("/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT id, title, description FROM jobs WHERE id = $1`, [jobId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job" });
  } finally {
    client.release();
  }
});

export default router;
