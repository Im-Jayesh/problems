"use client";

import { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export type SortMode = 'top' | 'trending' | 'newest' | 'most_reported';

type ClusterItem = {
  id: string;
  title: string;
  category?: string;
  totalWeight?: number;
  velocity?: number;
  createdAt?: number;
  submissionCount?: number;
  claimedByName?: string;
  claims?: { id: string }[];
};

type TrendingRailProps = {
  onBubbleClick: (id: string) => void;
  activeCategory: string | null;
  onCategoryChange: (cat: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showClaimedOnly: boolean;
  onShowClaimedOnlyChange: (v: boolean) => void;
};

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'trending', label: 'Trending' },
  { id: 'newest', label: 'Newest' },
  { id: 'most_reported', label: 'Most Reported' },
];

export default function TrendingRail({
  onBubbleClick,
  activeCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  showClaimedOnly,
  onShowClaimedOnlyChange,
}: TrendingRailProps) {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 768
  );
  const [sortMode, setSortMode] = useState<SortMode>('top');

  const { data, isLoading } = db.useQuery({ clusters: { claims: {} } });

  const categories = useMemo(() => {
    if (!data?.clusters) return [];
    const cats = new Set<string>();
    (data.clusters as ClusterItem[]).forEach((c) => {
      const cat = c.category && c.category !== 'Unknown' ? c.category : 'General';
      cats.add(cat);
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [data]);

  if (isLoading || !data) return null;

  const isClusterClaimed = (c: ClusterItem) =>
    Boolean(c.claimedByName) || Boolean(c.claims && c.claims.length > 0);

  const term = searchQuery.trim().toLowerCase();
  const filteredClusters = [...(data.clusters as ClusterItem[])].filter((c) => {
    const cat = c.category && c.category !== 'Unknown' ? c.category : 'General';
    if (activeCategory && cat !== activeCategory) return false;
    if (showClaimedOnly && !isClusterClaimed(c)) return false;
    if (term) {
      const matchesCategory = cat.toLowerCase().includes(term);
      const matchesTitle = (c.title || '').toLowerCase().includes(term);
      if (!matchesCategory && !matchesTitle) return false;
    }
    return true;
  });

  const sortedClusters = filteredClusters
    .sort((a, b) => {
      switch (sortMode) {
        case 'trending':
          return (b.velocity || 0) - (a.velocity || 0);
        case 'newest':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'most_reported':
          return (b.submissionCount || 0) - (a.submissionCount || 0);
        case 'top':
        default:
          return (b.totalWeight || 0) - (a.totalWeight || 0);
      }
    })
    .slice(0, 20);

  const grouped = sortedClusters.reduce<Record<string, ClusterItem[]>>((acc, cluster) => {
    const cat =
      cluster.category && cluster.category !== 'Unknown' ? cluster.category : 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cluster);
    return acc;
  }, {});

  if (isCollapsed) {
    return (
      <button
        className="glass-panel fade-in"
        onClick={() => setIsCollapsed(false)}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10,
          padding: '12px',
          cursor: 'pointer',
          border: '1px solid var(--bubble-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Open Trending"
      >
        <ChevronLeft size={24} color="var(--foreground)" />
      </button>
    );
  }

  return (
    <div className="trending-rail glass-panel fade-in">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          flexShrink: 0,
        }}
      >
        <h3 style={{ margin: 0 }}>Trending Problems</h3>
        <button
          onClick={() => setIsCollapsed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
          }}
          title="Close Trending"
        >
          <ChevronRight size={20} color="var(--foreground)" />
        </button>
      </div>

      <input
        type="text"
        placeholder="Search problems or categories..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          width: '100%',
          padding: '9px 12px',
          borderRadius: '8px',
          border: '1px solid var(--bubble-border)',
          background: 'var(--input-bg)',
          marginBottom: '10px',
          outline: 'none',
          color: 'var(--foreground)',
          fontSize: '0.88rem',
          flexShrink: 0,
        }}
      />

      {/* Sort modes */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginBottom: '10px',
          flexShrink: 0,
        }}
      >
        {SORT_OPTIONS.map((opt) => {
          const active = sortMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortMode(opt.id)}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                border: '1px solid var(--bubble-border)',
                background: active ? 'var(--accent)' : 'var(--chip-bg)',
                color: active ? 'white' : 'var(--foreground)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onShowClaimedOnlyChange(!showClaimedOnly)}
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            border: `1px solid ${showClaimedOnly ? '#10B981' : 'var(--bubble-border)'}`,
            background: showClaimedOnly ? '#10B981' : 'var(--chip-bg)',
            color: showClaimedOnly ? 'white' : 'var(--foreground)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Claimed ✓
        </button>
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div
          className="no-scrollbar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
            maxHeight: '110px',
            overflowY: 'auto',
            paddingTop: '2px',
            paddingBottom: '10px',
            marginBottom: '6px',
            borderBottom: '1px solid var(--bubble-border)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            style={{
              flexShrink: 0,
              padding: '3px 9px',
              borderRadius: '999px',
              border: '1px solid var(--bubble-border)',
              background: !activeCategory ? 'var(--accent)' : 'var(--chip-bg)',
              color: !activeCategory ? 'white' : 'var(--foreground)',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All
          </button>
          {categories.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(active ? null : cat)}
                style={{
                  flexShrink: 0,
                  padding: '3px 9px',
                  borderRadius: '999px',
                  border: '1px solid var(--bubble-border)',
                  background: active ? 'var(--accent)' : 'var(--chip-bg)',
                  color: active ? 'white' : 'var(--foreground)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      <div className="trending-rail-scroll no-scrollbar" style={{ paddingTop: '6px' }}>
        {sortedClusters.length === 0 ? (
          <div style={{ fontSize: '0.85rem', opacity: 0.65, padding: '12px 4px' }}>
            No matching problems found.
          </div>
        ) : (
          Object.entries(grouped).map(([category, clusters]) => (
            <div key={category} style={{ marginBottom: '16px' }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  opacity: 0.6,
                  marginBottom: '8px',
                  marginLeft: '4px',
                  fontWeight: 600,
                }}
              >
                {category}
              </div>
              {clusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className="trending-item"
                  onClick={() => onBubbleClick(cluster.id)}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{cluster.title}</div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      opacity: 0.78,
                      marginTop: '4px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      {cluster.totalWeight} {cluster.totalWeight === 1 ? 'vote' : 'votes'}
                      {(cluster.submissionCount ?? 0) > 1 ? ` • ${cluster.submissionCount} reports` : ''}
                    </span>
                    {isClusterClaimed(cluster) && (
                      <span style={{ color: '#10B981', fontWeight: 700 }}>Claimed ✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
