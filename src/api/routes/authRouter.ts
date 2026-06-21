// src/api/routes/authRouter.ts
import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { hashPassword, comparePassword, hashToken } from "../../lib/auth.js";
import { queryGlobal } from "../../lib/tenantDb.js";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { rateLimiter } from "../middleware/security.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// POST /api/auth/register - Sign up a new Tenant & Owner user (Rate limited)
router.post(
  "/register",
  rateLimiter(60 * 60 * 1000, 5), // Max 5 signups per hour per IP
  async (req, res, next) => {
    try {
      const { companyName, userName, email, password } = req.body;

      if (!companyName || !userName || !email || !password) {
         res.status(400).json({ success: false, error: "All fields are required" });
         return;
      }

      // Check if user already exists
      const checkUser = await queryGlobal("SELECT id FROM users WHERE email = $1 LIMIT 1;", [email]);
      if (checkUser.rowCount! > 0) {
         res.status(400).json({ success: false, error: "A user with this email already exists" });
         return;
      }

      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const pwdHash = await hashPassword(password);

      // Create Tenant
      await queryGlobal("INSERT INTO tenants (id, name) VALUES ($1, $2);", [tenantId, companyName]);

      // Create Owner User
      await queryGlobal(
        "INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, 'owner');",
        [userId, tenantId, userName, email, pwdHash]
      );

      // Seed Default ATS Pipeline Stages for the Tenant
      const defaultStages = [
        "Applied", "Resume Received", "AI Screened", "Shortlisted", "Recruiter Review",
        "Phone Screen", "Interview 1", "Interview 2", "Client Submission", "Offer Sent",
        "Hired", "Rejected"
      ];
      for (let i = 0; i < defaultStages.length; i++) {
        const stageId = crypto.randomUUID();
        const stageName = defaultStages[i];
        const isSystem = ["Applied", "AI Screened", "Hired", "Rejected"].includes(stageName);
        await queryGlobal(
          "INSERT INTO stages (id, tenant_id, name, order_index, is_system) VALUES ($1, $2, $3, $4, $5);",
          [stageId, tenantId, stageName, i, isSystem]
        );
      }

      // Generate tokens
      const accessToken = jwt.sign({ userId, tenantId, role: "owner", email }, JWT_SECRET, { expiresIn: "15m" });
      const refreshToken = crypto.randomBytes(40).toString("hex");
      const hashedRefreshToken = hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // Default 8 hours session timeout

      await queryGlobal(
        "INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4);",
        [crypto.randomUUID(), userId, hashedRefreshToken, expiresAt]
      );

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000
      });

      res.status(201).json({
        success: true,
        user: { id: userId, tenantId, name: userName, email, role: "owner" }
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login - User Login (Rate limited)
router.post(
  "/login",
  rateLimiter(15 * 60 * 1000, 10), // Max 10 login attempts per 15 minutes per IP
  async (req, res, next) => {
    try {
      const { email, password, rememberMe } = req.body;

      if (!email || !password) {
         res.status(400).json({ success: false, error: "Email and password are required" });
         return;
      }

      const userRes = await queryGlobal("SELECT * FROM users WHERE email = $1 LIMIT 1;", [email]);
      if (userRes.rowCount === 0) {
         res.status(401).json({ success: false, error: "Invalid email or password" });
         return;
      }

      const user = userRes.rows[0];
      const isPasswordValid = await comparePassword(password, user.password_hash);
      if (!isPasswordValid) {
         res.status(401).json({ success: false, error: "Invalid email or password" });
         return;
      }

      const tenantId = user.tenant_id;
      const userId = user.id;
      const role = user.role;

      // Generate tokens
      const accessToken = jwt.sign({ userId, tenantId, role, email }, JWT_SECRET, { expiresIn: "15m" });
      const refreshToken = crypto.randomBytes(40).toString("hex");
      const hashedRefreshToken = hashToken(refreshToken);
      
      // Session timeout: 8 hours. Remember me: 30 days.
      const expiryDuration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + expiryDuration);

      await queryGlobal(
        "INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4);",
        [crypto.randomUUID(), userId, hashedRefreshToken, expiresAt]
      );

      // Enforce concurrent session limit (max 5 active sessions per user)
      // Delete oldest sessions if we have more than 5
      await queryGlobal(`
        DELETE FROM refresh_tokens
        WHERE id IN (
          SELECT id FROM refresh_tokens
          WHERE user_id = $1
          ORDER BY created_at DESC
          OFFSET 5
        );
      `, [userId]);

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: expiryDuration
      });

      res.json({
        success: true,
        user: { id: userId, tenantId, name: user.name, email, role }
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout - User Logout
router.post("/logout", authMiddleware, async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const hashedToken = hashToken(refreshToken);
      // Revoke from database using hashed token
      await queryGlobal("DELETE FROM refresh_tokens WHERE token = $1;", [hashedToken]);
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - Fetch Current Profile
router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) {
       res.status(401).json({ success: false, error: "Unauthorized" });
       return;
    }

    const userRes = await queryGlobal(
      "SELECT u.id, u.name, u.email, u.role, u.tenant_id, t.name as company_name FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 LIMIT 1;",
      [req.user.userId]
    );

    if (userRes.rowCount === 0) {
       res.status(404).json({ success: false, error: "User profile not found" });
       return;
    }

    res.json({ success: true, user: userRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/invite - Invite team member (Rate limited)
router.post(
  "/invite",
  authMiddleware,
  requireRole(["owner", "recruiter"]),
  rateLimiter(15 * 60 * 1000, 15), // Max 15 invitations per 15 minutes per IP
  async (req, res, next) => {
    try {
      const { email, role } = req.body;

      if (!email || !role) {
         res.status(400).json({ success: false, error: "Email and role are required" });
         return;
      }

      if (!["owner", "recruiter", "hiring_manager", "interviewer"].includes(role)) {
         res.status(400).json({ success: false, error: "Invalid role assigned" });
         return;
      }

      // Check if user already exists
      const checkUser = await queryGlobal("SELECT id FROM users WHERE email = $1 LIMIT 1;", [email]);
      if (checkUser.rowCount! > 0) {
         res.status(400).json({ success: false, error: "A user with this email is already registered in the platform" });
         return;
      }

      // Check if invitation is active
      await queryGlobal("DELETE FROM user_invitations WHERE email = $1 AND expires_at < CURRENT_TIMESTAMP;", [email]);
      const checkInvite = await queryGlobal("SELECT id FROM user_invitations WHERE email = $1 LIMIT 1;", [email]);
      if (checkInvite.rowCount! > 0) {
         res.status(400).json({ success: false, error: "An active invitation has already been sent to this email address" });
         return;
      }

      const invitationToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiry
      const inviteId = crypto.randomUUID();

      await queryGlobal(
        "INSERT INTO user_invitations (id, tenant_id, email, role, token, expires_at) VALUES ($1, $2, $3, $4, $5, $6);",
        [inviteId, req.user!.tenantId, email, role, invitationToken, expiresAt]
      );

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const acceptUrl = `${appUrl}/accept-invite?token=${invitationToken}`;

      console.log(`✉️ [Invitation Link] Generated for ${email}: ${acceptUrl}`);

      res.json({
        success: true,
        message: "Invitation sent successfully",
        invite: { email, role, token: invitationToken, acceptUrl }
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/accept-invite - Create user from invitation token (Rate limited)
router.post(
  "/accept-invite",
  rateLimiter(15 * 60 * 1000, 10), // Max 10 attempts per 15 minutes per IP
  async (req, res, next) => {
    try {
      const { token, name, password } = req.body;

      if (!token || !name || !password) {
         res.status(400).json({ success: false, error: "All fields are required" });
         return;
      }

      // Verify token
      const inviteRes = await queryGlobal(
        "SELECT * FROM user_invitations WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP LIMIT 1;",
        [token]
      );

      if (inviteRes.rowCount === 0) {
         res.status(400).json({ success: false, error: "Invalid or expired invitation token" });
         return;
      }

      const invite = inviteRes.rows[0];
      const pwdHash = await hashPassword(password);
      const userId = crypto.randomUUID();

      // Create User
      await queryGlobal(
        "INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6);",
        [userId, invite.tenant_id, name, invite.email, pwdHash, invite.role]
      );

      // Revoke invitation
      await queryGlobal("DELETE FROM user_invitations WHERE id = $1;", [invite.id]);

      res.json({ success: true, message: "Invitation accepted. Account created successfully!" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
