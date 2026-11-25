import { Injectable } from '@nestjs/common';

interface Bucket {
  hits: number[];
}

/**
 * Small in-memory sliding-window rate limiter. Suitable for a single
 * instance development deployment; production should use Redis.
 */
@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly max = 5,
  ) {}

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((hit) => now - hit < this.windowMs);

    if (bucket.hits.length >= this.max) {
      this.buckets.set(key, bucket);
      const oldest = bucket.hits[0] ?? now;
      return { allowed: false, retryAfterMs: Math.max(0, this.windowMs - (now - oldest)) };
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}