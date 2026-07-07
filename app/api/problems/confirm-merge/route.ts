import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/admin';
import { id } from '@instantdb/admin';

export async function POST(req: Request) {
  try {
    const { text, embedding, clusterId } = await req.json();
    if (!text || !embedding || !clusterId) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    const db = getAdminDb();
    const queryResult = await db.query({ clusters: { $: { where: { id: clusterId } } } });
    const cluster = queryResult.clusters[0];

    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    const newCount = cluster.submissionCount + 1;
    const oldCentroid = JSON.parse(cluster.centroid);
    const newCentroid = oldCentroid.map((val: number, i: number) => 
      (val * cluster.submissionCount + embedding[i]) / newCount
    );

    const problemId = id();
    
    await db.transact([
      db.tx.clusters[clusterId].update({
        submissionCount: newCount,
        totalWeight: cluster.totalWeight + 1,
        centroid: JSON.stringify(newCentroid),
        updatedAt: Date.now(),
      }),
      db.tx.problems[problemId].update({
        text,
        createdAt: Date.now(),
      }).link({ cluster: clusterId })
    ]);

    return NextResponse.json({ status: 'merged', clusterId });
  } catch (error: any) {
    console.error("Confirm merge error:", error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
