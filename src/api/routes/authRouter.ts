import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { hashPassword, comparePassword, hashToken } from "../../lib/auth.js";
import { queryGlobal } from "../../lib/tenantDb.js";
import { authMiddleware, requireRole } from "../middleware/authMiddleware.js";
import { rateLimiter } from "../middleware/security.js";
import { registerTenant } from "../../services/tenantRegistrationService.js";
import { z } from "zod";

const router = Router();

const registerSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  userName: z.string().trim().min(1, "User name is required"),
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  licenseKey: z.string().trim().min(1, "License key is required"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

const googleLoginSchema = z.object({
  token: z.string().trim().min(1, "Google token is required"),
  licenseKey: z.string().trim().optional(),
});
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is required.");
}
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const oauthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;


// POST /api/auth/register - Sign up a new Tenant & Owner user (Rate limited)
router.post(
  "/register",
  rateLimiter(60 * 60 * 1000, 5), // Max 5 signups per hour per IP
  async (req, res, next) => {
    try {
      console.log("📥 [Register API] New registration attempt for:", req.body?.email || "unknown");
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error.issues.map((e: any) => e.message).join(", "),
        });
        return;
      }
      const { companyName, userName, email, password, licenseKey } = result.data;

      console.log("🔍 [Register API] Checking user existence for email:", email);
      // Check if user already exists
      const checkUser = await queryGlobal("SELECT id FROM users WHERE email = $1 LIMIT 1;", [email]);
      if (checkUser.rowCount! > 0) {
         console.log("❌ [Register API] Email already registered");
         res.status(400).json({ success: false, error: "A user with this email already exists" });
         return;
      }

      const pwdHash = await hashPassword(password);
      const { tenantId, userId } = await registerTenant({
        companyName,
        userName,
        email,
        passwordHash: pwdHash,
        licenseKey,
      });

      // Generate tokens
      const accessToken = jwt.sign({ userId, tenantId, role: "owner", email }, JWT_SECRET, { expiresIn: "15m" });
      const refreshToken = crypto.randomBytes(40).toString("hex");
      const hashedRefreshToken = hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // Default 8 hours session timeout

      await queryGlobal(
        "INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4);",
        [crypto.randomUUID(), userId, hashedRefreshToken, expiresAt]
      );

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
      };

      res.cookie("accessToken", accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
      });

      res.cookie("refreshToken", refreshToken, {
        ...cookieOptions,
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

// POST /api/auth/google-login - Sign in or register with Google (Rate limited)
router.post(
  "/google-login",
  rateLimiter(15 * 60 * 1000, 20), // Max 20 logins/registrations per 15 minutes per IP
  async (req, res, next) => {
    try {
      const result = googleLoginSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error.issues.map((e: any) => e.message).join(", "),
        });
        return;
      }
      const { token, licenseKey } = result.data;

      let email = "";
      let name = "";
      let googleId = "";

      const isMockToken = token === "mock-google-token";
      const isDev = process.env.NODE_ENV !== "production";

      if (isMockToken && isDev) {
        email = "mock_google_recruiter@risonaitech.com";
        name = "Mock Google Recruiter";
        googleId = "mock-google-sub-id";
      } else {
        if (!GOOGLE_CLIENT_ID) {
          res.status(500).json({
            success: false,
            error: "Google client ID is not configured on the server."
          });
          return;
        }

        try {
          const ticket = await (oauthClient || new OAuth2Client(GOOGLE_CLIENT_ID)).verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          if (!payload) {
            res.status(400).json({ success: false, error: "Invalid Google ID token payload" });
            return;
          }
          email = payload.email || "";
          name = payload.name || payload.given_name || "Google User";
          googleId = payload.sub;
        } catch (err: any) {
          res.status(400).json({ success: false, error: `Google authentication failed: ${err.message}` });
          return;
        }
      }

      if (!email) {
        res.status(400).json({ success: false, error: "Google account does not have an email address" });
        return;
      }

      // Check if user exists
      const userRes = await queryGlobal("SELECT * FROM users WHERE email = $1 LIMIT 1;", [email]);
      let userId: string;
      let tenantId: string;
      let role: string;
      let userName: string;

      if (userRes.rowCount === 0) {
        // User does not exist, auto-onboard. Require license key!
        if (!licenseKey) {
          res.status(400).json({ success: false, error: "License key is required for new registration." });
          return;
        }

        const companyName = `${name}'s Workspace`;
        const randomPassword = crypto.randomBytes(32).toString("hex");
        const pwdHash = await hashPassword(randomPassword);

        const result = await registerTenant({
          companyName,
          userName: name,
          email,
          passwordHash: pwdHash,
          licenseKey,
        });

        userId = result.userId;
        tenantId = result.tenantId;
        role = "owner";
        userName = name;
      } else {
        const user = userRes.rows[0];
        userId = user.id;
        tenantId = user.tenant_id;
        role = user.role;
        userName = user.name;
      }

      // Generate JWT tokens
      const accessToken = jwt.sign({ userId, tenantId, role, email }, JWT_SECRET, { expiresIn: "15m" });
      const refreshToken = crypto.randomBytes(40).toString("hex");
      const hashedRefreshToken = hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours session

      await queryGlobal(
        "INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4);",
        [crypto.randomUUID(), userId, hashedRefreshToken, expiresAt]
      );

      // Concurrent session limit (max 5 active sessions)
      await queryGlobal(`
        DELETE FROM refresh_tokens
        WHERE id IN (
          SELECT id FROM refresh_tokens
          WHERE user_id = $1
          ORDER BY created_at DESC
          OFFSET 5
        );
      `, [userId]);

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
      };

      res.cookie("accessToken", accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
      });

      res.cookie("refreshToken", refreshToken, {
        ...cookieOptions,
        maxAge: 8 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        user: { id: userId, tenantId, name: userName, email, role }
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
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error.issues.map((e: any) => e.message).join(", "),
        });
        return;
      }
      const { email, password, rememberMe } = result.data;

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

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
      };

      res.cookie("accessToken", accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
      });

      res.cookie("refreshToken", refreshToken, {
        ...cookieOptions,
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

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    };
    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
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

// POST /api/auth/activate-license - Top up or change subscription for an active tenant (Rate limited, Owner only)
router.post(
  "/activate-license",
  authMiddleware,
  requireRole(["owner"]),
  rateLimiter(15 * 60 * 1000, 5), // Max 5 license activations per 15 minutes per IP
  async (req, res, next) => {
    try {
      const { licenseKey } = req.body;
      const tenantId = req.user?.tenantId;

      if (!licenseKey) {
        res.status(400).json({ success: false, error: "License key is required." });
        return;
      }

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Authentication / Tenant context required." });
        return;
      }

      // Verify license key
      const licenseRes = await queryGlobal(
        "SELECT * FROM license_keys WHERE key = $1 AND is_used = FALSE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1;",
        [licenseKey]
      );
      if (licenseRes.rowCount === 0) {
        res.status(400).json({ success: false, error: "Invalid, expired, or already used license key." });
        return;
      }
      const license = licenseRes.rows[0];

      // Update tenant subscription and credits
      await queryGlobal(
        `UPDATE tenants 
         SET plan_tier = $1, 
             credit_balance = credit_balance + $2, 
             plan_expires_at = COALESCE($3, plan_expires_at)
         WHERE id = $4;`,
        [license.plan_tier, license.credits, license.expires_at, tenantId]
      );

      // Mark license key as used
      await queryGlobal(
        "UPDATE license_keys SET is_used = TRUE, used_by_tenant_id = $1, used_at = CURRENT_TIMESTAMP WHERE key = $2;",
        [tenantId, licenseKey]
      );

      res.json({
        success: true,
        message: `License key activated successfully! Applied plan: ${license.plan_tier}, Credits added: ${license.credits}.`
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
