import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/admin';
import { checkActionRateLimit, getVoterKey, setClusterVote } from '@/lib/redis';
import {
  attachDeviceCookie,
  getClientIp,
  getDeviceFingerprint,
  getOrCreateDeviceId,
  getSubnet24,
  isTurnstileEnabled,
  verifyTurnstile,
} from '@/lib/security';

export async function POST(req: Request) {
  const { deviceId, cookieHeader } = getOrCreateDeviceId(req);
  const ip = getClientIp(req);
  const subnet = getSubnet24(ip);
  const fingerprint = getDeviceFingerprint(req);

  const respond = <T>(body: T, status = 200) =>
    attachDeviceCookie(NextResponse.json(body, { status }), cookieHeader);

  try {
    const ctx = { ip, subnet, deviceId, fingerprint };
    const rateLimit = await checkActionRateLimit('vote', ctx);
    if (!rateLimit.allowed) {
      return respond({ error: 'Rate limit exceeded. Please try again later.' }, 429);
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return respond({ error: 'Invalid JSON request body' }, 400);
    }

    if (isTurnstileEnabled() && (rateLimit.suspicious || body.turnstileToken)) {
      const captcha = await verifyTurnstile(body.turnstileToken, ip);
      if (!captcha.ok) {
        return respond({ error: captcha.error || 'CAPTCHA verification failed' }, 403);
      }
    }

    const clusterId = typeof body.clusterId === 'string' ? body.clusterId.trim() : '';
    if (!clusterId) {
      return respond({ error: 'Missing clusterId' }, 400);
    }

    const action = body.action === 'remove' ? 'remove' : 'add';
    if (body.action !== undefined && body.action !== 'add' && body.action !== 'remove') {
      return respond({ error: 'Invalid vote action' }, 400);
    }

    const db = getAdminDb();
    const queryResult = await db.query({
      clusters: { $: { where: { id: clusterId } } },
    });
    const cluster = queryResult.clusters[0];
    if (!cluster) {
      return respond({ error: 'Cluster not found' }, 404);
    }

    const voterKey = getVoterKey(ctx);
    const { changed, voted } = await setClusterVote(clusterId, voterKey, action === 'add');

    let plusOneCount = cluster.plusOneCount || 0;
    let totalWeight = cluster.totalWeight || 0;

    if (changed) {
      const delta = action === 'add' ? 1 : -1;
      plusOneCount = Math.max(0, plusOneCount + delta);
      totalWeight = Math.max(1, totalWeight + delta);
      const velocity = Math.max(0, (cluster.velocity || 0) + delta);

      await db.transact([
        db.tx.clusters[clusterId].update({
          plusOneCount,
          totalWeight,
          velocity,
          updatedAt: Date.now(),
        }),
      ]);
    }

    return respond({
      ok: true,
      plusOneCount,
      totalWeight,
      voted,
    });
  } catch (error) {
    console.error('Vote error:', error);
    return respond({ error: 'Internal server error' }, 500);
  }
}
