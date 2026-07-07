"use client";

import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import BubbleCanvas from '@/components/BubbleCanvas';
import ProblemInput from '@/components/ProblemInput';
import TrendingRail from '@/components/TrendingRail';
import Onboarding from '@/components/Onboarding';
import ClaimModal from '@/components/ClaimModal';
import ToastProvider from '@/components/ToastProvider';

export default function Home() {
  const [showIntro, setShowIntro] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [focusBubbleId, setFocusBubbleId] = useState<string | null>(null);

  const handleTrendingClick = (id: string) => {
    setFocusBubbleId(id);
    setSelectedClusterId(id);
  };

  // Presence for the "watching now" counter
  const { peers, publishPresence } = db.rooms.usePresence(db.room('lobby'));
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('seen_intro');
      if (!seen) {
        setShowIntro(true);
      }
      publishPresence({ active: true, lastActive: Date.now() });
    }
  }, [publishPresence]);

  const handleFinishIntro = () => {
    localStorage.setItem('seen_intro', 'true');
    setShowIntro(false);
  };

  return (
    <main>
      <ToastProvider />
      {showIntro && <Onboarding onFinish={handleFinishIntro} />}
      
      {!showIntro && (
        <>
          <div className="presence-counter">
            <div className="presence-dot"></div>
            {Object.keys(peers).length + 1} here now
          </div>

          <div className="canvas-hint">
            Drag to pan &nbsp;•&nbsp; ⌘/Ctrl + Scroll to zoom
          </div>

          <BubbleCanvas onBubbleClick={setSelectedClusterId} focusBubbleId={focusBubbleId} />
          
          <TrendingRail onBubbleClick={handleTrendingClick} />
          
          <ProblemInput />
          
          {selectedClusterId && (
            <ClaimModal 
              clusterId={selectedClusterId} 
              onClose={() => setSelectedClusterId(null)} 
            />
          )}
        </>
      )}
    </main>
  );
}
