import { NextResponse } from 'next/server';
import { id } from '@instantdb/admin';
import { getAdminDb } from '@/lib/admin';
import {
  getEmbedding,
  checkModeration,
  cosineSimilarity,
  computeUpdatedCentroid,
  normalizeVector,
  ModerationServiceError,
} from '@/lib/gemini';
import { checkSubmissionRateLimit } from '@/lib/redis';
import { appendNuanceList } from '@/lib/nuances';
import {
  attachDeviceCookie,
  getClientIp,
  getDeviceFingerprint,
  getOrCreateDeviceId,
  getSubnet24,
  isTurnstileEnabled,
  sanitizeCategory,
  sanitizeText,
  signBorderlineToken,
  signUndoToken,
  verifyTurnstile,
} from '@/lib/security';

const THRESHOLD_MERGE = 0.82;
const THRESHOLD_BORDERLINE = 0.70;

export async function POST(req: Request) {
  const { deviceId, cookieHeader } = getOrCreateDeviceId(req);
  const ip = getClientIp(req);
  const subnet = getSubnet24(ip);
  const fingerprint = getDeviceFingerprint(req);

  const respond = <T>(body: T, status = 200) =>
    attachDeviceCookie(NextResponse.json(body, { status }), cookieHeader);

  try {
    const rateLimit = await checkSubmissionRateLimit({ ip, subnet, deviceId, fingerprint });
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

    const textCheck = sanitizeText(body.text, 5, 500, 'Problem description');
    if (!textCheck.ok) {
      return respond({ error: textCheck.error }, 400);
    }
    const text = textCheck.value;
    const cleanUserCategory = sanitizeCategory(body.userCategory);

    let modResult: { isSafe: boolean; reason?: string; category?: string };
    try {
      modResult = await checkModeration(text);
    } catch (err) {
      if (err instanceof ModerationServiceError) {
        return respond(
          { error: 'Moderation service is temporarily unavailable. Please try again.' },
          503
        );
      }
      throw err;
    }

    if (!modResult.isSafe) {
      return respond(
        { error: modResult.reason || 'Content violates community guidelines.' },
        400
      );
    }

    const finalCategory = cleanUserCategory || sanitizeCategory(modResult.category);
    if (!cleanUserCategory && !finalCategory) {
      return respond({ status: 'needs_category' });
    }

    let embedding: number[];
    try {
      embedding = await getEmbedding(text);
    } catch (err) {
      if (err instanceof ModerationServiceError) {
        return respond(
          { error: 'Embedding service is temporarily unavailable. Please try again.' },
          503
        );
      }
      throw err;
    }

    const db = getAdminDb();
    const queryResult = await db.query({ clusters: {} });
    const clusters = queryResult.clusters || [];

    let bestMatch: (typeof clusters)[number] | null = null;
    let bestCentroid: number[] | null = null;
    let maxSim = -1;

    for (const cluster of clusters) {
      if (!cluster.centroid) continue;
      try {
        const centroid = JSON.parse(cluster.centroid) as number[];
        const sim = cosineSimilarity(embedding, centroid);
        if (sim > maxSim) {
          maxSim = sim;
          bestMatch = cluster;
          bestCentroid = centroid;
        }
      } catch {
        continue;
      }
    }

    const now = Date.now();

    if (bestMatch && bestCentroid && maxSim >= THRESHOLD_MERGE) {
      const oldCount = bestMatch.submissionCount || 1;
      const newCount = oldCount + 1;
      const newCentroid = computeUpdatedCentroid(bestCentroid, oldCount, embedding);
      const problemId = id();

      await db.transact([
        db.tx.clusters[bestMatch.id].update({
          submissionCount: newCount,
          totalWeight: (bestMatch.totalWeight || 0) + 1,
          velocity: (bestMatch.velocity || 0) + 1,
          centroid: JSON.stringify(newCentroid),
          updatedAt: now,
        }),
        db.tx.problems[problemId]
          .update({
            text,
            createdAt: now,
          })
          .link({ cluster: bestMatch.id }),
      ]);

      try {
        const nextNuances = appendNuanceList(
          (bestMatch as { nuances?: string }).nuances,
          bestMatch.title,
          text
        );
        await db.transact([
          db.tx.clusters[bestMatch.id].update({ nuances: nextNuances }),
        ]);
      } catch {
        // Non-fatal if InstantDB schema is strict
      }

      const undoToken = signUndoToken({
        action: 'merged',
        clusterId: bestMatch.id,
        problemId,
        previousCentroid: bestCentroid,
        previousSubmissionCount: bestMatch.submissionCount,
        previousTotalWeight: bestMatch.totalWeight,
        previousUpdatedAt: bestMatch.updatedAt,
      });

      return respond({
        status: 'merged',
        clusterId: bestMatch.id,
        matchedTitle: bestMatch.title,
        similarity: maxSim,
        undoToken,
      });
    }

    if (bestMatch && maxSim >= THRESHOLD_BORDERLINE) {
      const borderlineToken = signBorderlineToken({
        text,
        embedding: normalizeVector(embedding),
        category: finalCategory,
        matchId: bestMatch.id,
      });

      return respond({
        status: 'borderline',
        match: {
          id: bestMatch.id,
          title: bestMatch.title,
          similarity: maxSim,
          category: bestMatch.category,
        },
        text,
        borderlineToken,
      });
    }

    const clusterId = id();
    const problemId = id();
    const normalizedEmbedding = normalizeVector(embedding);

    await db.transact([
      db.tx.clusters[clusterId].update({
        title: text,
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
          text,
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
    console.error('Submit error:', error);
    return respond({ error: 'Internal server error' }, 500);
  }
}
