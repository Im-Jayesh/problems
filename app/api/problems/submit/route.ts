import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/admin';
import { getEmbedding, checkModeration, cosineSimilarity } from '@/lib/gemini';
import { checkRateLimit } from '@/lib/redis';
import { id } from '@instantdb/admin';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const isAllowed = await checkRateLimit(ip);
    if (!isAllowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const { text, userCategory } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Invalid text' }, { status: 400 });
    }

    const modResult = await checkModeration(text);
    if (!modResult.isSafe) {
      return NextResponse.json({ error: modResult.reason || "Content violates community guidelines." }, { status: 400 });
    }

    const finalCategory = userCategory || modResult.category;
    
    if (!userCategory && finalCategory === 'Unknown') {
      return NextResponse.json({ status: 'needs_category' });
    }

    const embedding = await getEmbedding(text);
    const db = getAdminDb();
    const queryResult = await db.query({ clusters: {} });
    const clusters = queryResult.clusters;

    let bestMatch = null;
    let maxSim = -1;

    for (const cluster of clusters) {
      if (!cluster.centroid) continue;
      const centroid = JSON.parse(cluster.centroid);
      const sim = cosineSimilarity(embedding, centroid);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = cluster;
      }
    }

    const THRESHOLD_MERGE = 0.82;
    const THRESHOLD_BORDERLINE = 0.72;

    if (bestMatch && maxSim >= THRESHOLD_MERGE) {
      const newCount = bestMatch.submissionCount + 1;
      const oldCentroid = JSON.parse(bestMatch.centroid);
      const newCentroid = oldCentroid.map((val: number, i: number) => 
        (val * bestMatch.submissionCount + embedding[i]) / newCount
      );

      const problemId = id();
      
      await db.transact([
        db.tx.clusters[bestMatch.id].update({
          submissionCount: newCount,
          totalWeight: bestMatch.totalWeight + 1,
          centroid: JSON.stringify(newCentroid),
          updatedAt: Date.now(),
        }),
        db.tx.problems[problemId].update({
          text,
          createdAt: Date.now(),
        }).link({ cluster: bestMatch.id })
      ]);

      return NextResponse.json({ status: 'merged', clusterId: bestMatch.id });
    } else if (bestMatch && maxSim >= THRESHOLD_BORDERLINE) {
      return NextResponse.json({ 
        status: 'borderline', 
        match: { id: bestMatch.id, title: bestMatch.title, similarity: maxSim },
        embedding,
        text
      });
    } else {
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
          category: finalCategory !== 'Unknown' ? finalCategory : undefined
        }),
        db.tx.problems[problemId].update({
          text,
          createdAt: Date.now(),
        }).link({ cluster: clusterId })
      ]);

      return NextResponse.json({ status: 'created', clusterId });
    }

  } catch (error: any) {
    console.error("Submit error:", error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
