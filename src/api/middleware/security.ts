// src/api/middleware/security.ts
import type { Request, Response, NextFunction } from "express";
import { Redis } from "ioredis";
import { connection } from "../queue.js";

const rateLimits = new Map<string, { count: number; resetTime: number }>();

export let redisClient: Redis | null = null;
export let isRedisConnected = false;

try {
  // Establish Redis Connection for rate limiting
  redisClient = new Redis(connection);
  redisClient.on("connect", () => {
    isRedisConnected = true;
    console.log("🔓 [Rate Limiter] Connected to Redis limits store.");
  });
  redisClient.on("error", (err) => {
    isRedisConnected = false;
    console.warn("⚠️ [Rate Limiter] Redis offline. Falling back to local memory limits.", err.message);
  });
} catch (err: any) {
  console.warn("⚠️ [Rate Limiter] Redis initialization failed. Local memory active.", err.message || err);
}

/**
 * Increment and check rate limits inside Redis
 */
async function redisRateLimit(ip: string, path: string, windowMs: number, maxRequests: number): Promise<boolean> {
  if (!redisClient || !isRedisConnected) {
    throw new Error("Redis client offline");
  }
  const key = `rate:${ip}:${path}`;
  const multi = redisClient.multi();
  multi.incr(key);
  multi.ttl(key);
  
  const results = await multi.exec();
  if (!results) return false;
  
  // count is results[0][1], ttl is results[1][1]
  const count = results[0][1] as number;
  
  if (count === 1) {
    await redisClient.expire(key, Math.ceil(windowMs / 1000));
  }
  
  return count <= maxRequests;
}

/**
 * A robust rate limiter backing Redis with memory fallback
 */
export function rateLimiter(windowMs: number, maxRequests: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const isAuthRoute = req.path.startsWith("/api/auth");
    
    if (process.env.NODE_ENV !== "production" && process.env.RATE_LIMIT_TEST !== "true") {
      return next();
    }
    const ip = (req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown") as string;
    const path = req.path;

    console.log(`⏱️ [Rate Limiter] Request path: ${req.path}, IP: ${ip}`);
    // 1. Try Redis
    if (isRedisConnected && redisClient) {
      try {
        console.log(`⏱️ [Rate Limiter] Querying Redis for ${ip}:${path}`);
        const allowed = await redisRateLimit(ip, path, windowMs, maxRequests);
        console.log(`⏱️ [Rate Limiter] Redis allowed? ${allowed}`);
        if (!allowed) {
          res.status(429).json({
            success: false,
            error: "Too many requests. Please slow down and try again later."
          });
          return;
        }
        return next();
      } catch (err: any) {
        console.error("[Rate Limiter] Redis rate limiting failed, falling back to memory:", err.message);
      }
    }

    // 2. Memory Fallback
    try {
      const now = Date.now();
      const limitKey = `${ip}:${path}`;
      const limit = rateLimits.get(limitKey);

      if (!limit) {
        rateLimits.set(limitKey, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (now > limit.resetTime) {
        limit.count = 1;
        limit.resetTime = now + windowMs;
        return next();
      }

      limit.count++;
      if (limit.count > maxRequests) {
        res.status(429).json({
          success: false,
          error: "Too many requests. Please slow down and try again later."
        });
        return;
      }

      next();
    } catch (memErr) {
      console.error("[Rate Limiter] Local rate limiter error:", memErr);
      // 3. Fail Closed on Auth Routes
      if (isAuthRoute) {
        res.status(429).json({
          success: false,
          error: "Authentication rate limiting active. Request blocked for security."
        });
        return;
      }
      next();
    }
  };
}

/**
 * Basic CSRF Protection via strict Origin and Referer header checking on state-changing operations
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  console.log("🔒 [CSRF Guard] Request Method:", req.method, "Path:", req.path, "Origin:", req.headers.origin || req.headers.referer);
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const expectedDomain = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Bypass CSRF for Zoho and Keka webhook endpoints (machine-to-machine calls)
  if (req.path.startsWith("/api/webhooks")) {
    return next();
  }

  // Bypass CSRF for candidate-facing assessment endpoints (accessed via token, not session cookies)
  if (req.path.startsWith("/api/assessment/") && !req.path.startsWith("/api/assessment/generate") && !req.path.startsWith("/api/assessment/send")) {
    return next();
  }

  // Bypass CSRF for Zoho diagnostic endpoints (called directly from Settings UI)
  if (req.path === "/api/email/zoho-status" || req.path === "/api/email/zoho-test") {
    return next();
  }

  const isAuthorized = origin && (
    origin.startsWith(expectedDomain) ||
    origin.startsWith("http://localhost:3000") ||
    origin.endsWith(".vercel.app") ||
    origin.includes("risonaitech.com")
  );

  if (!origin || !isAuthorized) {
     res.status(403).json({
      success: false,
      error: "CSRF Validation Failed: Request origin does not match authorized application domain."
    });
     return;
  }

  next();
}
