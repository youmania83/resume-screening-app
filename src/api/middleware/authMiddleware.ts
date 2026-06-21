/* eslint-disable @typescript-eslint/no-namespace */
// src/api/middleware/authMiddleware.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { hashToken } from "../../lib/auth.js";
import { tenantStorage } from "../../lib/tenantContext.js";
import { queryGlobal } from "../../lib/tenantDb.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

interface TokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

// Extend Request interface to support user context
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Public routes that bypass auth entirely
  const publicPaths = [
    "/api/auth/login",
    "/api/auth/google-login",
    "/api/auth/register",
    "/api/auth/accept-invite",
    "/api/health",
  ];

  // Also bypass auth for public assessment routes and candidate portal (verified via token query)
  if (
    publicPaths.some(p => req.path.startsWith(p)) ||
    req.path.startsWith("/api/candidate-portal") ||
    req.path.startsWith("/api/webhooks") ||
    (req.path.startsWith("/api/assessment") && 
     !req.path.startsWith("/api/assessment/generate") && 
     !req.path.startsWith("/api/assessment/send"))
  ) {
    return next();
  }

  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;

  if (!accessToken && !refreshToken) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  try {
    // 1. Verify access token if present
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as TokenPayload;
        req.user = decoded;
        
        // Execute the rest of request inside tenant storage context
        tenantStorage.run({ tenantId: decoded.tenantId, userId: decoded.userId, role: decoded.role }, () => {
          next();
        });
        return;
      } catch {
        // If access token is invalid/expired and no refresh token is provided, reject
        if (!refreshToken) {
          res.status(401).json({ success: false, error: "Access token expired" });
          return;
        }
      }
    }

    // 2. Access token is missing or expired, attempt refresh token rotation
    if (refreshToken) {
      const hashedToken = hashToken(refreshToken);
      const tokenRes = await queryGlobal(
        "SELECT r.*, u.tenant_id, u.role, u.email, u.name FROM refresh_tokens r JOIN users u ON r.user_id = u.id WHERE r.token = $1 AND r.expires_at > CURRENT_TIMESTAMP LIMIT 1;",
        [hashedToken]
      );

      if (tokenRes.rowCount === 0) {
        // Invalid or expired refresh token
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
        };
        res.clearCookie("accessToken", cookieOptions);
        res.clearCookie("refreshToken", cookieOptions);
        res.status(401).json({ success: false, error: "Session expired, please login again" });
        return;
      }

      const dbToken = tokenRes.rows[0];

      // Refresh token rotation (RTR) - invalidate old token and create new one
      await queryGlobal("DELETE FROM refresh_tokens WHERE id = $1;", [dbToken.id]);

      const newRefreshToken = crypto.randomBytes(40).toString("hex");
      const hashedNewRefreshToken = hashToken(newRefreshToken);
      const isRememberMe = new Date(dbToken.expires_at).getTime() - new Date().getTime() > 24 * 60 * 60 * 1000 * 8; // If expiry was longer than 8 hours, it's remember me
      const expiryDuration = isRememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
      const newExpiresAt = new Date(Date.now() + expiryDuration);
      
      const newRefreshTokenId = crypto.randomUUID();
      await queryGlobal(
        "INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4);",
        [newRefreshTokenId, dbToken.user_id, hashedNewRefreshToken, newExpiresAt]
      );

      // Generate new access token
      const newPayload: TokenPayload = {
        userId: dbToken.user_id,
        tenantId: dbToken.tenant_id,
        role: dbToken.role,
        email: dbToken.email
      };

      const newAccessToken = jwt.sign(newPayload, JWT_SECRET, { expiresIn: "15m" });

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
      };

      // Set new cookies
      res.cookie("accessToken", newAccessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000 // 15 mins
      });

      res.cookie("refreshToken", newRefreshToken, {
        ...cookieOptions,
        maxAge: expiryDuration
      });

      req.user = newPayload;

      tenantStorage.run({ tenantId: dbToken.tenant_id, userId: dbToken.user_id, role: dbToken.role }, () => {
        next();
      });
      return;
    }
  } catch (err: any) {
    console.error("Auth middleware critical error:", err);
    res.status(500).json({ success: false, error: "Internal authentication error" });
  }
}

/**
 * Helper decorator to check RBAC permissions
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: "Forbidden: Insufficient privileges" });
      return;
    }
    next();
  };
}
