import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export const PREFIX = 'world_problems:';

export async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `${PREFIX}rate_limit:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour window
  }
  return count <= 10; // Allow 10 submissions per hour
}
