import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/admin';
import { id } from '@instantdb/admin';

export async function POST(req: Request) {
  try {
    const { text, embedding } = await req.json();
    if (!text || !embedding) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    const db = getAdminDb();
    const clusterId = id();
    const problemId = id();

    await db.transact([
      db.tx.clusters[clusterId].update({
        title: text,
        submissionCount: 1,
        plusOneCount: 0,
        totalWeight: 1,
        centroid: JSON.stringify(embedding),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        velocity: 1,
      }),
      db.tx.problems[problemId].update({
        text,
        createdAt: Date.now(),
      }).link({ cluster: clusterId })
    ]);

    return NextResponse.json({ status: 'created', clusterId });
  } catch (error: any) {
    console.error("Confirm new error:", error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
