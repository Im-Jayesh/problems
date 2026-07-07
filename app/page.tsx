"use client";

import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
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
  const [glowBubbleId, setGlowBubbleId] = useState<string | null>(null);

  const handleTrendingClick = (id: string) => {
    setFocusBubbleId(id);
    setSelectedClusterId(id);
  };

  const handleMerged = (id: string) => {
    setFocusBubbleId(id);
    setGlowBubbleId(id);
    setTimeout(() => {
      setGlowBubbleId(null);
    }, 4000);
  };

  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      popoverClass: 'theme-dark',
      steps: [
        { 
          element: '.problem-input-container', 
          popover: { 
            title: '1. Tell us your problems 🤬', 
            description: 'What annoys you every day? Type your complaint here and hit send! If someone else complained about the exact same thing, our AI will magically merge your text with theirs to make the problem bigger!' 
          } 
        },
        { 
          element: '.trending-rail', 
          popover: { 
            title: '2. See what hurts the most 📈', 
            description: 'This panel ranks the biggest, most painful problems right now. The more votes a problem has, the higher it ranks. Click on any problem in this list to instantly fly your camera over to it.' 
          } 
        },
        { 
          element: '.canvas-hint', 
          popover: { 
            title: '3. Explore the Universe 🪐', 
            description: 'You are floating in an infinite space of problems! Click and drag your mouse to pan around. Scroll your mouse wheel (or use two fingers on a trackpad) to zoom in and out. Click on any bubble to read the problem and claim it if you want to build a solution for it!' 
          } 
        },
      ],
      onDestroyStarted: () => {
        localStorage.setItem('has_seen_tour', 'true');
        driverObj.destroy();
      }
    });
    driverObj.drive();
  };

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('has_seen_tour');
    if (!hasSeenTour) {
      setTimeout(startTour, 1000); // Wait for render
    }
  }, []);

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
            <button onClick={startTour} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', marginRight: '10px', pointerEvents: 'auto', fontWeight: 600 }}>Help / Tour</button>
            Drag to pan &nbsp;•&nbsp; ⌘/Ctrl + Scroll to zoom
          </div>

          <BubbleCanvas onBubbleClick={setSelectedClusterId} focusBubbleId={focusBubbleId} glowBubbleId={glowBubbleId} />
          
          <TrendingRail onBubbleClick={handleTrendingClick} />
          
          <ProblemInput onMerged={handleMerged} />
          
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
