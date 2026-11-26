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
    let res: {
      clusters?: Record<string, unknown>[];
      problems?: Record<string, unknown>[];
    };
    try {
      res = (await db.query({
        clusters: { problems: {} },
        problems: { cluster: {} },
      })) as typeof res;
    } catch {
      res = (await db.query({ clusters: { problems: {} } })) as typeof res;
    }

    const nuancesByCluster: Record<string, NuanceEntry[]> = {};
    const addEntry = (clusterId: string, entry: NuanceEntry) => {
      if (!clusterId || !entry.text?.trim()) return;
      const list = nuancesByCluster[clusterId] || [];
      list.push(entry);
      nuancesByCluster[clusterId] = list;
    };

    for (const cluster of res.clusters || []) {
      const clusterId = typeof cluster.id === 'string' ? cluster.id : '';
      if (!clusterId) continue;
      const scalarNuances = parseNuancesField(
        typeof cluster.nuances === 'string' ? cluster.nuances : undefined
      );
      for (let i = 0; i < scalarNuances.length; i++) {
        addEntry(clusterId, {
          id: `nuance-${clusterId}-${i}`,
          text: scalarNuances[i],
        });
      }
      if (Array.isArray(cluster.problems)) {
        for (const p of cluster.problems as Record<string, unknown>[]) {
          if (typeof p.id === 'string' && typeof p.text === 'string') {
            addEntry(clusterId, {
              id: p.id,
              text: p.text,
              createdAt: typeof p.createdAt === 'number' ? p.createdAt : undefined,
            });
          }
        }
      }
    }

    for (const p of res.problems || []) {
      if (typeof p.id !== 'string' || typeof p.text !== 'string') continue;
      const rawCluster = p.cluster as { id?: string } | { id?: string }[] | undefined;
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
