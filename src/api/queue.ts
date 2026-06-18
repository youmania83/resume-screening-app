// src/api/queue.ts
import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Parse connection parameters from REDIS_URL dynamically
const isTls = redisUrl.startsWith("rediss://");
const cleanUrl = redisUrl.startsWith("redis-cli") ? redisUrl.replace(/^redis-cli\s+--tls\s+-u\s+/, "") : redisUrl;
let connectionOptions: any = {};

try {
  const urlObj = new URL(cleanUrl);
  connectionOptions = {
    host: urlObj.hostname,
    port: urlObj.port ? parseInt(urlObj.port) : 6379,
    password: urlObj.password ? decodeURIComponent(urlObj.password) : undefined,
    username: urlObj.username ? decodeURIComponent(urlObj.username) : undefined,
  };
  if (isTls) {
    connectionOptions.tls = {};
  }
} catch (err) {
  console.error("Failed to parse REDIS_URL, falling back to localhost:", err);
  connectionOptions = { host: "localhost", port: 6379 };
}

export const connection = connectionOptions;

export const jobQueue = new Queue("resume-eval-queue", { 
  connection: connectionOptions
});
