import { NextResponse } from 'next/server';
import { id } from '@instantdb/admin';
import { getAdminDb } from '@/lib/admin';
import { computeUpdatedCentroid } from '@/lib/gemini';
import { checkActionRateLimit } from '@/lib/redis';
import {
  attachDeviceCookie,
  getClientIp,
  getDeviceFingerprint,
  getOrCreateDeviceId,
  getSubnet24,
  isTurnstileEnabled,
  signUndoToken,
  verifyBorderlineToken,
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
    const rateLimit = await checkActionRateLimit('confirm', {
      ip,
      subnet,
      deviceId,
      fingerprint,
    });
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

    const payload = verifyBorderlineToken(body.borderlineToken);
    if (!payload) {
      return respond({ error: 'Invalid or expired confirmation token' }, 400);
    }

    const db = getAdminDb();
    const queryResult = await db.query({
      clusters: { $: { where: { id: clusterId } } },
    });
    const cluster = queryResult.clusters[0];

    if (!cluster) {
      return respond({ error: 'Cluster not found' }, 404);
    }

    let oldCentroid: number[] = [];
    try {
      oldCentroid = cluster.centroid ? (JSON.parse(cluster.centroid) as number[]) : [];
    } catch {
      oldCentroid = [];
    }

    const oldCount = cluster.submissionCount || 1;
    const newCount = oldCount + 1;
    const newCentroid = computeUpdatedCentroid(oldCentroid, oldCount, payload.embedding);
    const problemId = id();
    const now = Date.now();

    await db.transact([
      db.tx.clusters[clusterId].update({
        submissionCount: newCount,
        totalWeight: (cluster.totalWeight || 0) + 1,
        velocity: (cluster.velocity || 0) + 1,
        centroid: JSON.stringify(newCentroid),
        updatedAt: now,
      }),
      db.tx.problems[problemId]
        .update({
          text: payload.text,
          createdAt: now,
        })
        .link({ cluster: clusterId }),
    ]);

    const undoToken = signUndoToken({
      action: 'merged',
      clusterId,
      problemId,
      previousCentroid: oldCentroid.length > 0 ? oldCentroid : undefined,
      previousSubmissionCount: cluster.submissionCount,
      previousTotalWeight: cluster.totalWeight,
      previousUpdatedAt: cluster.updatedAt,
    });

    return respond({ status: 'merged', clusterId, undoToken });
  } catch (error) {
    console.error('Confirm merge error:', error);
    return respond({ error: 'Internal server error' }, 500);
  }
}
