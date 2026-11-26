import { Redis } from '@upstash/redis';

export const PREFIX = 'world_problems:';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis: Redis | null =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : null;

interface MemoryCounter {
  count: number;
  expiresAt: number;
}

const memoryCounters = new Map<string, MemoryCounter>();
const memoryVotes = new Map<string, Set<string>>();

let warnedRedisFallback = false;
function logRedisFallback(err?: unknown) {
  if (!warnedRedisFallback) {
    warnedRedisFallback = true;
    console.warn('[redis] Using in-memory fallback for rate limiting/dedup.', err ?? '');
  }
}

const ATOMIC_INCR_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return c
`;

async function atomicIncrWithTtl(key: string, windowSeconds: number): Promise<number> {
  if (redis) {
    try {
      const result = await redis.eval(ATOMIC_INCR_SCRIPT, [key], [String(windowSeconds)]);
      const count = Number(result);
      if (Number.isFinite(count)) return count;
    } catch (err) {
      logRedisFallback(err);
    }
  } else {
    logRedisFallback();
  }

  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (!existing || now > existing.expiresAt) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export interface RateLimitContext {
  ip: string;
  subnet: string;
  deviceId: string;
  fingerprint: string;
}

export interface RateLimitResult {
  allowed: boolean;
  suspicious: boolean;
}

const WINDOW_SECONDS = 3600;

export async function checkRateLimit(ip: string): Promise<boolean> {
  const count = await atomicIncrWithTtl(`${PREFIX}rate_limit:ip:${ip}`, WINDOW_SECONDS);
  return count <= 15;
}

export async function checkSubmissionRateLimit(ctx: RateLimitContext): Promise<RateLimitResult> {
  const deviceKey = `${ctx.deviceId}:${ctx.fingerprint}`;
  const [ipCount, subnetCount, deviceCount] = await Promise.all([
    atomicIncrWithTtl(`${PREFIX}rl:submit:ip:${ctx.ip}`, WINDOW_SECONDS),
    atomicIncrWithTtl(`${PREFIX}rl:submit:subnet:${ctx.subnet}`, WINDOW_SECONDS),
    atomicIncrWithTtl(`${PREFIX}rl:submit:dev:${deviceKey}`, WINDOW_SECONDS),
  ]);

  const ipLimit = 15;
  const subnetLimit = 40;
  const deviceLimit = 10;

  const allowed = ipCount <= ipLimit && subnetCount <= subnetLimit && deviceCount <= deviceLimit;
  const suspicious =
    ctx.ip === 'unknown' ||
    ctx.fingerprint === 'none' ||
    ipCount > Math.floor(ipLimit * 0.6) ||
    subnetCount > Math.floor(subnetLimit * 0.6) ||
    deviceCount > Math.floor(deviceLimit * 0.6);

  return { allowed, suspicious };
}

export type ActionScope = 'vote' | 'claim' | 'confirm' | 'undo';

const ACTION_LIMITS: Record<ActionScope, { ip: number; subnet: number; device: number }> = {
  vote: { ip: 80, subnet: 200, device: 60 },
  claim: { ip: 10, subnet: 25, device: 8 },
  confirm: { ip: 20, subnet: 50, device: 15 },
  undo: { ip: 20, subnet: 50, device: 15 },
};

export async function checkActionRateLimit(
  scope: ActionScope,
  ctx: RateLimitContext
): Promise<RateLimitResult> {
  const limits = ACTION_LIMITS[scope];
  const deviceKey = `${ctx.deviceId}:${ctx.fingerprint}`;
  const [ipCount, subnetCount, deviceCount] = await Promise.all([
    atomicIncrWithTtl(`${PREFIX}rl:${scope}:ip:${ctx.ip}`, WINDOW_SECONDS),
    atomicIncrWithTtl(`${PREFIX}rl:${scope}:subnet:${ctx.subnet}`, WINDOW_SECONDS),
    atomicIncrWithTtl(`${PREFIX}rl:${scope}:dev:${deviceKey}`, WINDOW_SECONDS),
  ]);

  const allowed =
    ipCount <= limits.ip && subnetCount <= limits.subnet && deviceCount <= limits.device;
  const suspicious =
    ctx.ip === 'unknown' ||
    ipCount > Math.floor(limits.ip * 0.7) ||
    deviceCount > Math.floor(limits.device * 0.7);

  return { allowed, suspicious };
}

export function getVoterKey(ctx: RateLimitContext): string {
  if (ctx.fingerprint && ctx.fingerprint !== 'none') {
    return `${ctx.deviceId}:${ctx.fingerprint}`;
  }
  return `${ctx.deviceId}:${ctx.ip}`;
}

export async function setClusterVote(
  clusterId: string,
  voterKey: string,
  add: boolean
): Promise<{ changed: boolean; voted: boolean }> {
  const key = `${PREFIX}votes:${clusterId}`;

  if (redis) {
    try {
      const changedCount = add
        ? await redis.sadd(key, voterKey)
        : await redis.srem(key, voterKey);
      return { changed: Number(changedCount) > 0, voted: add };
    } catch (err) {
      logRedisFallback(err);
    }
  } else {
    logRedisFallback();
  }

  let set = memoryVotes.get(clusterId);
  if (!set) {
    set = new Set<string>();
    memoryVotes.set(clusterId, set);
  }
  if (add) {
    const had = set.has(voterKey);
    set.add(voterKey);
    return { changed: !had, voted: true };
  } else {
    const had = set.delete(voterKey);
    return { changed: had, voted: false };
  }
}
