import { NextResponse } from 'next/server';
import { id } from '@instantdb/admin';
import { getAdminDb } from '@/lib/admin';
import { checkActionRateLimit } from '@/lib/redis';
import {
  attachDeviceCookie,
  getClientIp,
  getDeviceFingerprint,
  getOrCreateDeviceId,
  getSubnet24,
  isTurnstileEnabled,
  isValidHttpUrl,
  sanitizeText,
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
    const rateLimit = await checkActionRateLimit('claim', {
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

    const nameCheck = sanitizeText(body.name, 2, 80, 'Name');
    if (!nameCheck.ok) {
      return respond({ error: nameCheck.error }, 400);
    }

    const linkRaw = typeof body.link === 'string' ? body.link.trim() : '';
    if (!isValidHttpUrl(linkRaw)) {
      return respond({ error: 'Link must be a valid http:// or https:// URL' }, 400);
    }

    const messageCheck = sanitizeText(body.message, 5, 500, 'Message');
    if (!messageCheck.ok) {
      return respond({ error: messageCheck.error }, 400);
    }

    const db = getAdminDb();
    const queryResult = await db.query({
      clusters: { $: { where: { id: clusterId } } },
    });
    const cluster = queryResult.clusters[0];
    if (!cluster) {
      return respond({ error: 'Cluster not found' }, 404);
    }

    const claimId = id();
    const now = Date.now();

    await db.transact([
      db.tx.claims[claimId]
        .update({
          name: nameCheck.value,
          link: linkRaw,
          message: messageCheck.value,
          createdAt: now,
        })
        .link({ cluster: clusterId }),
      db.tx.clusters[clusterId].update({
        claimedByName: nameCheck.value,
        claimedByLink: linkRaw,
        claimedMessage: messageCheck.value,
        claimedAt: now,
        updatedAt: now,
      }),
    ]);

    return respond({ ok: true, clusterId, claimId });
  } catch (error) {
    console.error('Claim error:', error);
    return respond({ error: 'Internal server error' }, 500);
  }
}
