import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/admin';
import { checkActionRateLimit } from '@/lib/redis';
import {
  attachDeviceCookie,
  getClientIp,
  getDeviceFingerprint,
  getOrCreateDeviceId,
  getSubnet24,
  verifyUndoToken,
} from '@/lib/security';

export async function POST(req: Request) {
  const { deviceId, cookieHeader } = getOrCreateDeviceId(req);
  const ip = getClientIp(req);
  const subnet = getSubnet24(ip);
  const fingerprint = getDeviceFingerprint(req);

  const respond = <T>(body: T, status = 200) =>
    attachDeviceCookie(NextResponse.json(body, { status }), cookieHeader);

  try {
    const rateLimit = await checkActionRateLimit('undo', {
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

    const payload = verifyUndoToken(body.undoToken);
    if (!payload) {
      return respond({ error: 'Invalid or expired undo token' }, 400);
    }

    const db = getAdminDb();
    const [problemRes, clusterRes] = await Promise.all([
      db.query({ problems: { $: { where: { id: payload.problemId } } } }),
      db.query({ clusters: { $: { where: { id: payload.clusterId } } } }),
    ]);

    const existingProblem = problemRes.problems[0];
    const existingCluster = clusterRes.clusters[0];

    if (payload.action === 'created') {
      if (!existingProblem && !existingCluster) {
        return respond({ error: 'Submission was already undone' }, 409);
      }
      const tx = [
        ...(existingProblem ? [db.tx.problems[payload.problemId].delete()] : []),
        ...(existingCluster ? [db.tx.clusters[payload.clusterId].delete()] : []),
      ];
      await db.transact(tx);
      return respond({ ok: true, action: 'created', clusterId: payload.clusterId });
    }

    // action === 'merged'
    if (!existingProblem) {
      return respond({ error: 'Submission was already undone' }, 409);
    }

    const clusterUpdates = existingCluster
      ? (() => {
          const restoredCount =
            typeof payload.previousSubmissionCount === 'number'
              ? Math.max(1, payload.previousSubmissionCount)
              : Math.max(1, (existingCluster.submissionCount || 1) - 1);
          const restoredWeight =
            typeof payload.previousTotalWeight === 'number'
              ? Math.max(1, payload.previousTotalWeight)
              : Math.max(1, (existingCluster.totalWeight || 1) - 1);
          const restoredUpdatedAt =
            typeof payload.previousUpdatedAt === 'number'
              ? payload.previousUpdatedAt
              : existingCluster.updatedAt;

          const updateFields: Record<string, unknown> = {
            submissionCount: restoredCount,
            totalWeight: restoredWeight,
            velocity: Math.max(0, (existingCluster.velocity || 0) - 1),
            updatedAt: restoredUpdatedAt,
          };
          if (Array.isArray(payload.previousCentroid) && payload.previousCentroid.length > 0) {
            updateFields.centroid = JSON.stringify(payload.previousCentroid);
          }
          return [db.tx.clusters[payload.clusterId].update(updateFields)];
        })()
      : [];

    await db.transact([db.tx.problems[payload.problemId].delete(), ...clusterUpdates]);
    return respond({ ok: true, action: 'merged', clusterId: payload.clusterId });
  } catch (error) {
    console.error('Undo error:', error);
    return respond({ error: 'Internal server error' }, 500);
  }
}
