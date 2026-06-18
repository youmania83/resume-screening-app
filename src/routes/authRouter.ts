// src/routes/authRouter.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../lib/db";
import { hashPassword, comparePassword, signToken } from "../lib/auth";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

/**
 * POST /api/auth/register
 * Body: { email: string, password: string }
 */
router.post("/register", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }
  try {
    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
        [userId, email, passwordHash]
      );
    } finally {
      client.release();
    }
    const token = signToken({ userId, email });
    res.status(201).json({ token, userId, email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register" });
  }
});

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }
  try {
    const client = await pool.connect();
    let user;
    try {
      const result = await client.query(
        `SELECT id, password_hash FROM users WHERE email = $1`,
        [email]
      );
      if (result.rowCount === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      user = result.rows[0];
    } finally {
      client.release();
    }
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = signToken({ userId: user.id, email });
    res.json({ token, userId: user.id, email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
