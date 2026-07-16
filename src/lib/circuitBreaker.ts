// src/lib/circuitBreaker.ts

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  recoveryTimeoutMs: number; // Time to wait in OPEN state before trying HALF_OPEN
  requestTimeoutMs: number; // Timeout for each individual request
  maxConcurrentRequests?: number; // Concurrency limit (semaphore)
}

export class CircuitBreaker<T = any> {
  private state: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private activeRequests = 0;

  constructor(
    public readonly name: string,
    private config: CircuitBreakerConfig,
    private fallback?: (...args: any[]) => Promise<T> | T
  ) {}

  getState(): CircuitBreakerState {
    this.checkRecovery();
    return this.state;
  }

  private checkRecovery() {
    if (this.state === "OPEN" && Date.now() - this.lastFailureTime > this.config.recoveryTimeoutMs) {
      this.state = "HALF_OPEN";
      console.log(`🔌 [CircuitBreaker - ${this.name}] Transitioned to HALF_OPEN. Testing dependency...`);
    }
  }

  private recordSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  private recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = "OPEN";
      console.error(`🚨 [CircuitBreaker - ${this.name}] Failure threshold met (${this.failureCount}). Circuit is now OPEN.`);
    }
  }

  async execute(action: () => Promise<T>, ...args: any[]): Promise<T> {
    this.checkRecovery();

    if (this.state === "OPEN") {
      if (this.fallback) {
        console.warn(`⚠️ [CircuitBreaker - ${this.name}] Circuit is OPEN. Executing fallback.`);
        return await this.fallback(...args);
      }
      throw new Error(`CircuitBreaker '${this.name}' is OPEN. Request blocked.`);
    }

    if (this.config.maxConcurrentRequests && this.activeRequests >= this.config.maxConcurrentRequests) {
      if (this.fallback) {
        console.warn(`⚠️ [CircuitBreaker - ${this.name}] Max concurrent requests limit (${this.config.maxConcurrentRequests}) exceeded. Executing fallback.`);
        return await this.fallback(...args);
      }
      throw new Error(`CircuitBreaker '${this.name}' concurrency limit reached.`);
    }

    this.activeRequests++;
    try {
      // Individual request timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout of ${this.config.requestTimeoutMs}ms exceeded`)), this.config.requestTimeoutMs)
      );

      const result = await Promise.race([action(), timeoutPromise]);
      this.recordSuccess();
      return result;
    } catch (err: any) {
      this.recordFailure();
      if (this.fallback) {
        console.warn(`⚠️ [CircuitBreaker - ${this.name}] Request failed: ${err.message}. Executing fallback.`);
        return await this.fallback(...args);
      }
      throw err;
    } finally {
      this.activeRequests--;
    }
  }
}

/**
 * Reusable utility to run async tasks with exponential backoff retries.
 */
export async function retryWithBackoff<T>(
  action: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
  backoffFactor = 2
): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await action();
    } catch (err) {
      if (attempt >= retries) {
        throw err;
      }
      console.warn(`⚠️ Attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= backoffFactor;
      attempt++;
    }
  }
}
