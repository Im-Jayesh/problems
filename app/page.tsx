"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { db } from '@/lib/db';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { Sun, Moon } from 'lucide-react';
import BubbleCanvas from '@/components/BubbleCanvas';
import ProblemInput from '@/components/ProblemInput';
import TrendingRail from '@/components/TrendingRail';
import Onboarding from '@/components/Onboarding';
import ClaimModal from '@/components/ClaimModal';
import ToastProvider from '@/components/ToastProvider';

const subscribeTheme = (cb: () => void) => {
  window.addEventListener('theme-change', cb);
  return () => window.removeEventListener('theme-change', cb);
};

const getThemeSnapshot = (): 'light' | 'dark' => {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getServerThemeSnapshot = (): 'light' | 'dark' => 'light';

const subscribeIntro = (cb: () => void) => {
  window.addEventListener('intro-change', cb);
  return () => window.removeEventListener('intro-change', cb);
};

const getIntroSnapshot = (): boolean => !localStorage.getItem('seen_intro');
const getServerIntroSnapshot = (): boolean => false;

const subscribeMounted = () => () => {};
const getMountedSnapshot = (): boolean => true;
const getServerMountedSnapshot = (): boolean => false;

export default function Home() {
  const mounted = useSyncExternalStore(subscribeMounted, getMountedSnapshot, getServerMountedSnapshot);
  const showIntro = useSyncExternalStore(subscribeIntro, getIntroSnapshot, getServerIntroSnapshot);
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [focusBubbleId, setFocusBubbleId] = useState<string | null>(null);
  const [glowBubbleId, setGlowBubbleId] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showClaimedOnly, setShowClaimedOnly] = useState(false);

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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    window.dispatchEvent(new Event('theme-change'));
  };

  const startTour = useCallback(() => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      popoverClass: theme === 'dark' ? 'theme-dark' : undefined,
      steps: [
        {
          element: '.problem-input-container',
          popover: {
            title: '1. Drop a problem',
            description:
              'Type anything that bugs you and hit send. Similar problems automatically merge into a bigger bubble, or let you choose if it is borderline.',
          },
        },
        {
          element: '.trending-rail',
          popover: {
            title: '2. Filter & Rank Pain Points',
            description:
              'Sort by Top, Trending, Newest, or Most Reported. Filter by category or Claimed status, and click any item to fly the camera right to it.',
          },
        },
        {
          element: '.canvas-hint',
          popover: {
            title: '3. Explore, +1, or Claim',
            description:
              'Drag to pan, scroll or pinch to zoom, and click any bubble to add a +1 Me Too vote or claim it to build a solution!',
          },
        },
      ],
      onDestroyStarted: () => {
        localStorage.setItem('has_seen_tour', 'true');
        driverObj.destroy();
      },
    });
    driverObj.drive();
  }, [theme]);

  const { peers, publishPresence } = db.rooms.usePresence(db.room('lobby'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    publishPresence({ active: true, lastActive: Date.now() });
  }, [publishPresence]);

  // Only start the tour once Onboarding is closed and board DOM is mounted
  useEffect(() => {
    if (!mounted || showIntro) return;
    const hasSeenTour = localStorage.getItem('has_seen_tour');
    if (hasSeenTour) return;

    const timer = setTimeout(() => {
      startTour();
    }, 800);
    return () => clearTimeout(timer);
  }, [mounted, showIntro, startTour]);

  const handleFinishIntro = () => {
    localStorage.setItem('seen_intro', 'true');
    window.dispatchEvent(new Event('intro-change'));
  };

  return (
    <main>
      <ToastProvider />
      {showIntro && <Onboarding onFinish={handleFinishIntro} />}

      {!showIntro && (
        <>
          <div className="presence-bar">
            <div className="presence-counter">
              <div className="presence-dot"></div>
              {Object.keys(peers).length + 1} here now
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="canvas-hint">
            <button
              type="button"
              onClick={startTour}
              style={{
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                marginRight: '10px',
                pointerEvents: 'auto',
                fontWeight: 600,
              }}
            >
              Help / Tour
            </button>
            <span className="canvas-hint-text">
              Drag to pan &nbsp;•&nbsp; ⌘/Ctrl + Scroll to zoom
            </span>
          </div>

          <BubbleCanvas
            onBubbleClick={setSelectedClusterId}
            focusBubbleId={focusBubbleId}
            glowBubbleId={glowBubbleId}
            activeCategory={activeCategory}
            searchQuery={searchQuery}
            showClaimedOnly={showClaimedOnly}
            theme={theme}
          />

          <TrendingRail
            onBubbleClick={handleTrendingClick}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showClaimedOnly={showClaimedOnly}
            onShowClaimedOnlyChange={setShowClaimedOnly}
          />

          <ProblemInput onMerged={handleMerged} />

          {selectedClusterId && (
            <ClaimModal
              key={selectedClusterId}
              clusterId={selectedClusterId}
              onClose={() => setSelectedClusterId(null)}
            />
          )}
        </>
      )}
    </main>
  );
}
