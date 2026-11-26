import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/admin';
import { parseNuancesField } from '@/lib/nuances';

export const dynamic = 'force-dynamic';

type NuanceEntry = {
  id: string;
  text: string;
  createdAt?: number;
};

export async function GET() {
  try {
    const db = getAdminDb();
    const res = await db.query({
      clusters: { problems: {} },
      problems: { cluster: {} },
    });

    const nuancesByCluster: Record<string, NuanceEntry[]> = {};
    const addEntry = (clusterId: string, entry: NuanceEntry) => {
      if (!clusterId || !entry.text?.trim()) return;
      const list = nuancesByCluster[clusterId] || [];
      list.push(entry);
      nuancesByCluster[clusterId] = list;
    };

    for (const cluster of res.clusters || []) {
      const scalarNuances = parseNuancesField(
        (cluster as { nuances?: string }).nuances
      );
      for (let i = 0; i < scalarNuances.length; i++) {
        addEntry(cluster.id, {
          id: `nuance-${cluster.id}-${i}`,
          text: scalarNuances[i],
        });
      }
      if (Array.isArray(cluster.problems)) {
        for (const p of cluster.problems) {
          if (typeof p.text === 'string') {
            addEntry(cluster.id, {
              id: p.id,
              text: p.text,
              createdAt: typeof p.createdAt === 'number' ? p.createdAt : undefined,
            });
          }
        }
      }
    }

    for (const p of res.problems || []) {
      if (typeof p.text !== 'string') continue;
      const rawCluster = p.cluster;
      const linked = Array.isArray(rawCluster)
        ? rawCluster
        : rawCluster
        ? [rawCluster]
        : [];
      for (const c of linked) {
        if (c && typeof c.id === 'string') {
          addEntry(c.id, {
            id: p.id,
            text: p.text,
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : undefined,
          });
        }
      }
    }

    return NextResponse.json({ nuancesByCluster });
  } catch (error) {
    console.error('Fetch nuances error:', error);
    return NextResponse.json({ nuancesByCluster: {} }, { status: 200 });
  }
}
