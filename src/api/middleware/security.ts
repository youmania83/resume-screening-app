// src/api/middleware/security.ts
import type { Request, Response, NextFunction } from "express";
import { Redis } from "ioredis";
import { connection } from "../queue.js";

const rateLimits = new Map<string, { count: number; resetTime: number }>();

export function resetMemoryRateLimits() {
  rateLimits.clear();
}

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
async function redisRateLimit(ip: string, path: string, windowMs: number, maxRequests: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  if (!redisClient || !isRedisConnected) {
    throw new Error("Redis client offline");
  }
  const key = `rate:${ip}:${path}`;
  const multi = redisClient.multi();
  multi.incr(key);
  multi.ttl(key);
  
  const results = await multi.exec();
  if (!results) return { allowed: false, remaining: 0, resetTime: Math.ceil(Date.now() / 1000) + Math.ceil(windowMs / 1000) };
  
  const count = results[0][1] as number;
  let ttl = results[1][1] as number;
  
  if (count === 1 || ttl <= 0) {
    ttl = Math.ceil(windowMs / 1000);
    await redisClient.expire(key, ttl);
  }

  const remaining = Math.max(0, maxRequests - count);
  const resetTime = Math.ceil(Date.now() / 1000) + (ttl > 0 ? ttl : Math.ceil(windowMs / 1000));
  
  return { allowed: count <= maxRequests, remaining, resetTime };
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

    let remaining = maxRequests;
    let resetTimeSec = Math.ceil((Date.now() + windowMs) / 1000);
    let allowed = true;

    // 1. Try Redis
    if (isRedisConnected && redisClient) {
      try {
        const result = await redisRateLimit(ip, path, windowMs, maxRequests);
        allowed = result.allowed;
        remaining = result.remaining;
        resetTimeSec = result.resetTime;
      } catch (err: any) {
        console.error("[Rate Limiter] Redis rate limiting failed, falling back to memory:", err.message);
      }
    } else {
      // 2. Memory Fallback
      try {
        const now = Date.now();
        const limitKey = `${ip}:${path}`;
        let limit = rateLimits.get(limitKey);

        if (!limit || now > limit.resetTime) {
          limit = { count: 1, resetTime: now + windowMs };
          rateLimits.set(limitKey, limit);
        } else {
          limit.count++;
        }

        allowed = limit.count <= maxRequests;
        remaining = Math.max(0, maxRequests - limit.count);
        resetTimeSec = Math.ceil(limit.resetTime / 1000);
      } catch (memErr) {
        console.error("[Rate Limiter] Local rate limiter error:", memErr);
        if (isAuthRoute) {
          res.status(429).json({
            success: false,
            error: "Authentication rate limiting active. Request blocked for security."
          });
          return;
        }
      }
    }

    // Set standard RateLimit security headers
    res.setHeader("RateLimit-Limit", maxRequests);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", resetTimeSec);

    if (!allowed) {
      const retryAfterSec = Math.max(1, resetTimeSec - Math.ceil(Date.now() / 1000));
      res.setHeader("Retry-After", retryAfterSec);
      res.status(429).json({
        success: false,
        error: "Too many requests. Please slow down and try again later."
      });
      return;
    }

    next();
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

  // Bypass CSRF for candidate-facing and recruiter assessment endpoints
  if (req.path.startsWith("/api/assessment")) {
    return next();
  }

  // Bypass CSRF for rescreen-all endpoint
  if (req.path === "/api/candidates/rescreen-all") {
    return next();
  }

  // Bypass CSRF for Zoho diagnostic endpoints (called directly from Settings UI)
  if (req.path === "/api/email/zoho-status" || req.path === "/api/email/zoho-test") {
    return next();
  }

  const isAuthorized = origin && (
    origin.startsWith(expectedDomain) ||
    origin.startsWith("http://localhost") ||
    origin.includes("129.121.97.152") ||
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
