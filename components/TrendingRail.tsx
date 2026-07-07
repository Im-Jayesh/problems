"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export default function TrendingRail({ onBubbleClick }: { onBubbleClick: (id: string) => void }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    if (window.innerWidth <= 768) {
      setIsCollapsed(true);
    }
  }, []);

  const { data, isLoading } = db.useQuery({ clusters: {} });

  if (isLoading || !data) return null;

  // Filter based on search query (matches category or title)
  const filteredClusters = [...data.clusters].filter(c => {
    const term = searchQuery.toLowerCase();
    const matchesCategory = (c.category || '').toLowerCase().includes(term);
    const matchesTitle = (c.title || '').toLowerCase().includes(term);
    return matchesCategory || matchesTitle;
  });

  // Sort by totalWeight and grab the top 15
  const trending = filteredClusters.sort((a, b) => (b.totalWeight || 0) - (a.totalWeight || 0)).slice(0, 15);

  // Group the top problems by category
  const grouped = trending.reduce((acc, cluster) => {
    const cat = (cluster.category && cluster.category !== 'Unknown') ? cluster.category : 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cluster);
    return acc;
  }, {} as Record<string, any[]>);

  if (isCollapsed) {
    return (
      <button 
        className="glass-panel fade-in"
        onClick={() => setIsCollapsed(false)}
        style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 10,
          padding: '12px', cursor: 'pointer', border: '1px solid var(--bubble-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
        title="Open Trending"
      >
        <ChevronLeft size={24} color="var(--foreground)" />
      </button>
    );
  }

  return (
    <div className="trending-rail glass-panel fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Trending Problems</h3>
        <button 
          onClick={() => setIsCollapsed(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
          title="Close Trending"
        >
          <ChevronRight size={20} color="var(--foreground)" />
        </button>
      </div>

      <input 
        type="text" 
        placeholder="Search categories..." 
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: '8px', 
          border: '1px solid var(--bubble-border)', background: 'rgba(255, 255, 255, 0.6)',
          marginBottom: '20px', outline: 'none', color: 'var(--foreground)'
        }}
      />
      
      {Object.entries(grouped).map(([category, clusters]) => (
        <div key={category} style={{ marginBottom: '16px' }}>
          <div style={{ 
            fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', 
            opacity: 0.6, marginBottom: '8px', marginLeft: '4px', fontWeight: 600 
          }}>
            {category}
          </div>
          {clusters.map(cluster => (
            <div 
              key={cluster.id} 
              className="trending-item"
              onClick={() => onBubbleClick(cluster.id)}
            >
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{cluster.title}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{cluster.totalWeight} votes</span>
                {cluster.claimedByName && <span style={{ color: 'var(--accent)' }}>Claimed ✓</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
