import { NextResponse } from 'next/server';
import { id } from '@instantdb/admin';
import { getAdminDb } from '@/lib/admin';
import { normalizeVector } from '@/lib/gemini';
import { checkActionRateLimit } from '@/lib/redis';
import {
  attachDeviceCookie,
  getClientIp,
  getDeviceFingerprint,
  getOrCreateDeviceId,
  getSubnet24,
  isTurnstileEnabled,
  sanitizeCategory,
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

    const payload = verifyBorderlineToken(body.borderlineToken);
    if (!payload) {
      return respond({ error: 'Invalid or expired confirmation token' }, 400);
    }

    const finalCategory =
      sanitizeCategory(body.userCategory) || sanitizeCategory(payload.category);

    const db = getAdminDb();
    const clusterId = id();
    const problemId = id();
    const now = Date.now();
    const normalizedEmbedding = normalizeVector(payload.embedding);

    await db.transact([
      db.tx.clusters[clusterId].update({
        title: payload.text,
        submissionCount: 1,
        plusOneCount: 0,
        totalWeight: 1,
        centroid: JSON.stringify(normalizedEmbedding),
        createdAt: now,
        updatedAt: now,
        velocity: 1,
        category: finalCategory,
      }),
      db.tx.problems[problemId]
        .update({
          text: payload.text,
          createdAt: now,
        })
        .link({ cluster: clusterId }),
    ]);

    const undoToken = signUndoToken({
      action: 'created',
      clusterId,
      problemId,
    });

    return respond({ status: 'created', clusterId, undoToken });
  } catch (error) {
    console.error('Confirm new error:', error);
    return respond({ error: 'Internal server error' }, 500);
  }
}
