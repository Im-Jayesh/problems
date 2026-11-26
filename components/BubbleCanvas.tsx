"use client";

import { useEffect, useRef } from 'react';
import { db } from '@/lib/db';

type BubbleCanvasProps = {
  onBubbleClick: (id: string) => void;
  focusBubbleId?: string | null;
  glowBubbleId?: string | null;
  activeCategory?: string | null;
  searchQuery?: string;
  showClaimedOnly?: boolean;
  theme?: 'light' | 'dark';
};

// 22 distinct, accessible 6-char hex colors for categories (#AEB4A9 reserved for Unknown)
const PALETTE = [
  '#D89A9E', '#C37D92', '#846267', '#F4A261', '#E76F51', '#2A9D8F',
  '#E9C46A', '#264653', '#457B9D', '#6D597A', '#B56576', '#E56B6F',
  '#3D5A80', '#98C1D9', '#52B788', '#40916C', '#BC6C25', '#DDA15E',
  '#7209B7', '#4361EE', '#4CC9F0', '#F72585',
];

const UNKNOWN_COLOR = '#AEB4A9';
const CLAIMED_RING_COLOR = '#10B981';

const getCategoryColor = (category?: string) => {
  if (!category || category === 'Unknown') return UNKNOWN_COLOR;
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

function computeCategoryGravityMap(categories: string[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  const unique = Array.from(
    new Set(categories.filter((c) => c && c !== 'Unknown'))
  ).sort((a, b) => a.localeCompare(b));

  const goldenAngle = 2.399963229728653;
  unique.forEach((cat, idx) => {
    const angle = idx * goldenAngle;
    const distance = 220 + Math.sqrt(idx + 1) * 145;
    map.set(cat, {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    });
  });

  return map;
}

function drawAmoeba(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  time: number,
  seed: number,
  color: string,
  isClaimed: boolean
) {
  const points = 10;
  const vertices: { x: number; y: number }[] = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const noise =
      Math.sin(angle * 3 + time * 0.0015 + seed) * (r * 0.11) +
      Math.cos(angle * 2 - time * 0.001 + seed * 2) * (r * 0.07);
    const radius = r + noise;
    vertices.push({
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius,
    });
  }

  ctx.beginPath();
  const startX = (vertices[points - 1].x + vertices[0].x) / 2;
  const startY = (vertices[points - 1].y + vertices[0].y) / 2;
  ctx.moveTo(startX, startY);

  for (let i = 0; i < points; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % points];
    const xc = (p1.x + p2.x) / 2;
    const yc = (p1.y + p2.y) / 2;
    ctx.quadraticCurveTo(p1.x, p1.y, xc, yc);
  }
  ctx.closePath();

  ctx.fillStyle = `${color}99`;
  ctx.fill();

  ctx.lineWidth = isClaimed ? 3.5 : 2;
  ctx.strokeStyle = isClaimed ? CLAIMED_RING_COLOR : color;
  ctx.stroke();

  if (isClaimed) {
    // Crisp emerald badge at top-right of bubble
    const badgeX = x + r * 0.72;
    const badgeY = y - r * 0.72;
    const badgeR = Math.max(10, Math.min(14, r * 0.16));

    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = CLAIMED_RING_COLOR;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.round(badgeR * 1.15)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', badgeX, badgeY + 0.5);
  }
}

type ClusterRecord = {
  id: string;
  title: string;
  totalWeight?: number;
  submissionCount?: number;
  category?: string;
  claimedByName?: string;
  claims?: { id: string }[];
};

type BubbleNode = {
  id: string;
  title: string;
  totalWeight: number;
  submissionCount: number;
  category?: string;
  hasClaims: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetRadius: number;
  radius: number;
  color: string;
  seed: number;
};

export default function BubbleCanvas({
  onBubbleClick,
  focusBubbleId,
  glowBubbleId,
  activeCategory = null,
  searchQuery = '',
  showClaimedOnly = false,
  theme = 'light',
}: BubbleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data } = db.useQuery({ clusters: { claims: {} } });

  const physicsState = useRef<Record<string, BubbleNode>>({});
  const categoryGravityRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const camera = useRef({ x: 0, y: 0, zoom: 1 });
  const targetBubbleId = useRef<string | null>(null);
  const viewportSize = useRef({ width: 1200, height: 800, dpr: 1 });
  const fontFamilyRef = useRef<string>('Inter, sans-serif');

  // Keep latest reactive props in refs so the rAF loop never uses stale closures
  const glowBubbleIdRef = useRef<string | null | undefined>(glowBubbleId);
  const activeCategoryRef = useRef<string | null>(activeCategory);
  const searchQueryRef = useRef<string>(searchQuery);
  const showClaimedOnlyRef = useRef<boolean>(showClaimedOnly);
  const themeRef = useRef<'light' | 'dark'>(theme);
  const onBubbleClickRef = useRef(onBubbleClick);

  useEffect(() => {
    glowBubbleIdRef.current = glowBubbleId;
  }, [glowBubbleId]);

  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    showClaimedOnlyRef.current = showClaimedOnly;
  }, [showClaimedOnly]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    onBubbleClickRef.current = onBubbleClick;
  }, [onBubbleClick]);

  useEffect(() => {
    if (focusBubbleId) targetBubbleId.current = focusBubbleId;
  }, [focusBubbleId]);

  // 1. Handle HiDPI Canvas Resize & Resolved Font
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resolvedFont = getComputedStyle(document.body).fontFamily;
    if (resolvedFont) {
      fontFamilyRef.current = resolvedFont;
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      viewportSize.current = { width, height, dpr };
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  // 2. Sync InstantDB data into Physics State
  useEffect(() => {
    if (!data?.clusters) return;

    const clusters = data.clusters as ClusterRecord[];
    const gravityMap = computeCategoryGravityMap(
      clusters.map((c) => c.category || 'Unknown')
    );
    categoryGravityRef.current = gravityMap;

    const currentIds = new Set(clusters.map((c) => c.id));
    for (const id in physicsState.current) {
      if (!currentIds.has(id)) delete physicsState.current[id];
    }

    clusters.forEach((cluster) => {
      const weight = Math.max(1, cluster.totalWeight || 1);
      // Logarithmic & capped radius so viral outliers don't crush smaller bubbles
      const targetRadius = Math.min(165, 44 + Math.log1p(weight) * 20);
      const isClaimed =
        Boolean(cluster.claimedByName) || Boolean(cluster.claims && cluster.claims.length > 0);
      const gravity =
        (cluster.category && gravityMap.get(cluster.category)) || { x: 0, y: 0 };

      if (!physicsState.current[cluster.id]) {
        physicsState.current[cluster.id] = {
          id: cluster.id,
          title: cluster.title,
          totalWeight: cluster.totalWeight || 1,
          category: cluster.category,
          hasClaims: isClaimed,
          // Spawn near category gravity node with gentle ±120px jitter
          x: gravity.x + (Math.random() - 0.5) * 240,
          y: gravity.y + (Math.random() - 0.5) * 240,
          vx: 0,
          vy: 0,
          targetRadius,
          radius: targetRadius * 0.25,
          color: getCategoryColor(cluster.category),
          seed: Math.random() * 100,
          submissionCount: cluster.submissionCount || 1,
        };
      } else {
        const b = physicsState.current[cluster.id];
        b.title = cluster.title;
        b.totalWeight = cluster.totalWeight || 1;
        b.hasClaims = isClaimed;
        b.targetRadius = targetRadius;
        b.category = cluster.category;
        b.color = getCategoryColor(cluster.category);
        b.submissionCount = cluster.submissionCount || 1;
      }
    });
  }, [data]);

  // 3. Physics Render Loop & Interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const activePointers = new Map<number, { x: number; y: number }>();
    let prevPinchDist: number | null = null;
    let prevPinchMid: { x: number; y: number } | null = null;
    let clickStartX = 0;
    let clickStartY = 0;
    let hadMultiTouch = false;

    const getPinchMetrics = () => {
      const pts = Array.from(activePointers.values());
      if (pts.length < 2) return null;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      return {
        dist: Math.hypot(dx, dy),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetBubbleId.current = null;
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = 1 - e.deltaY * 0.005;
        camera.current.zoom = Math.min(Math.max(0.15, camera.current.zoom * zoomFactor), 4);
      } else {
        camera.current.x += e.deltaX / camera.current.zoom;
        camera.current.y += e.deltaY / camera.current.zoom;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      targetBubbleId.current = null;
      if (activePointers.size === 1) {
        clickStartX = e.clientX;
        clickStartY = e.clientY;
        hadMultiTouch = false;
        canvas.style.cursor = 'grabbing';
      } else if (activePointers.size === 2) {
        hadMultiTouch = true;
        const metrics = getPinchMetrics();
        if (metrics) {
          prevPinchDist = metrics.dist;
          prevPinchMid = metrics.mid;
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const prev = activePointers.get(e.pointerId);
      if (!prev) return;

      if (activePointers.size === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        camera.current.x -= dx / camera.current.zoom;
        camera.current.y -= dy / camera.current.zoom;
      } else if (activePointers.size === 2) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const metrics = getPinchMetrics();
        if (metrics && prevPinchDist && prevPinchDist > 0 && prevPinchMid) {
          const scale = metrics.dist / prevPinchDist;
          camera.current.zoom = Math.min(Math.max(0.15, camera.current.zoom * scale), 4);
          const midDx = metrics.mid.x - prevPinchMid.x;
          const midDy = metrics.mid.y - prevPinchMid.y;
          camera.current.x -= midDx / camera.current.zoom;
          camera.current.y -= midDy / camera.current.zoom;
          prevPinchDist = metrics.dist;
          prevPinchMid = metrics.mid;
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        prevPinchDist = null;
        prevPinchMid = null;
      }
      if (activePointers.size === 0) {
        canvas.style.cursor = 'grab';
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (hadMultiTouch) return;
      if (Math.abs(e.clientX - clickStartX) > 6 || Math.abs(e.clientY - clickStartY) > 6) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const worldX = (mx - rect.width / 2) / camera.current.zoom + camera.current.x;
      const worldY = (my - rect.height / 2) / camera.current.zoom + camera.current.y;

      // Reverse iterate so top-most rendered bubble wins hit-testing
      const bubbles = Object.values(physicsState.current);
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        const dist = Math.hypot(worldX - b.x, worldY - b.y);
        if (dist <= b.radius) {
          onBubbleClickRef.current(b.id);
          break;
        }
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('click', handleClick);

    const CELL_SIZE = 380;

    const render = (time: number) => {
      const { width, height, dpr } = viewportSize.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (targetBubbleId.current && physicsState.current[targetBubbleId.current]) {
        const targetB = physicsState.current[targetBubbleId.current];
        camera.current.x += (targetB.x - camera.current.x) * 0.08;
        camera.current.y += (targetB.y - camera.current.y) * 0.08;
      }

      const camX = camera.current.x;
      const camY = camera.current.y;
      const zoom = camera.current.zoom;

      const halfW = width / (2 * zoom);
      const halfH = height / (2 * zoom);
      const viewMinX = camX - halfW;
      const viewMaxX = camX + halfW;
      const viewMinY = camY - halfH;
      const viewMaxY = camY + halfH;

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      const bubbles = Object.values(physicsState.current);

      // Build spatial grid for O(N) average pairwise physics
      const grid = new Map<string, number[]>();
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const cx = Math.floor(b.x / CELL_SIZE);
        const cy = Math.floor(b.y / CELL_SIZE);
        const key = `${cx},${cy}`;
        const list = grid.get(key);
        if (list) list.push(i);
        else grid.set(key, [i]);
      }

      // Physics step
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.radius += (b.targetRadius - b.radius) * 0.08;

        const gravity =
          (b.category && categoryGravityRef.current.get(b.category)) || { x: 0, y: 0 };
        b.vx += (gravity.x - b.x) * 0.0012;
        b.vy += (gravity.y - b.y) * 0.0012;

        const cx = Math.floor(b.x / CELL_SIZE);
        const cy = Math.floor(b.y / CELL_SIZE);

        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const neighbors = grid.get(`${cx + ox},${cy + oy}`);
            if (!neighbors) continue;
            for (let k = 0; k < neighbors.length; k++) {
              const j = neighbors[k];
              if (j <= i) continue;
              const b2 = bubbles[j];

              const distx = b2.x - b.x;
              const disty = b2.y - b.y;
              let dist = Math.hypot(distx, disty);
              let nx: number;
              let ny: number;

              if (dist < 0.001) {
                // Guard dist === 0 against NaN
                const angle = (i * 1.618 + j) % (Math.PI * 2);
                nx = Math.cos(angle);
                ny = Math.sin(angle);
                dist = 0.001;
              } else {
                nx = distx / dist;
                ny = disty / dist;
              }

              const sameCategory =
                Boolean(b.category && b2.category) &&
                b.category !== 'Unknown' &&
                b.category?.toLowerCase() === b2.category?.toLowerCase();

              // Extra gap accounts for ±18% amoeba wobble, with wider separation between different groups
              const minDist = sameCategory
                ? (b.radius + b2.radius) * 1.15 + 14
                : (b.radius + b2.radius) * 1.18 + 52;

              if (dist < minDist) {
                const force = (minDist - dist) * 0.025;
                b.vx -= nx * force;
                b.vy -= ny * force;
                b2.vx += nx * force;
                b2.vy += ny * force;
              } else if (sameCategory && dist < minDist + 220) {
                const force = 0.002;
                b.vx += nx * force;
                b.vy += ny * force;
                b2.vx -= nx * force;
                b2.vy -= ny * force;
              }
            }
          }
        }

        // Fast damping so bubbles settle in ~1s
        b.vx *= 0.85;
        b.vy *= 0.85;
        b.x += b.vx;
        b.y += b.vy;
      }

      const activeCat = activeCategoryRef.current;
      const query = searchQueryRef.current.trim().toLowerCase();
      const claimedOnly = showClaimedOnlyRef.current;
      const activeGlowId = glowBubbleIdRef.current;
      const font = fontFamilyRef.current;

      // Render step with viewport culling
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const cullMargin = b.radius * 1.3 + 20;
        if (
          b.x + cullMargin < viewMinX ||
          b.x - cullMargin > viewMaxX ||
          b.y + cullMargin < viewMinY ||
          b.y - cullMargin > viewMaxY
        ) {
          continue;
        }

        let matchesFilter = true;
        if (activeCat) {
          const cat = b.category && b.category !== 'Unknown' ? b.category : 'General';
          if (cat !== activeCat) matchesFilter = false;
        }
        if (claimedOnly && !b.hasClaims) {
          matchesFilter = false;
        }
        if (query) {
          const t = (b.title || '').toLowerCase();
          const c = (b.category || '').toLowerCase();
          if (!t.includes(query) && !c.includes(query)) matchesFilter = false;
        }

        ctx.save();
        if (!matchesFilter) {
          ctx.globalAlpha = 0.16;
        }

        let drawColor = b.color;
        if (activeGlowId && b.id === activeGlowId) {
          const colorIndex = Math.floor(time / 50) % PALETTE.length;
          drawColor = PALETTE[colorIndex];
        }

        drawAmoeba(ctx, b.x, b.y, b.radius, time, b.seed, drawColor, b.hasClaims);

        if (b.radius * zoom > 16) {
          const isDark = themeRef.current === 'dark';
          ctx.fillStyle = isDark ? '#F5ECEE' : '#4A3A3D';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          ctx.font = `600 14px ${font}`;
          const title = b.title.length > 24 ? `${b.title.slice(0, 24)}...` : b.title;
          ctx.fillText(title, b.x, b.y - 8);

          ctx.font = `12px ${font}`;
          ctx.fillStyle = isDark ? 'rgba(245, 236, 238, 0.78)' : 'rgba(74, 58, 61, 0.75)';
          ctx.fillText(`${b.totalWeight} votes`, b.x, b.y + 13);
        }

        ctx.restore();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1,
        cursor: 'grab',
        touchAction: 'none',
      }}
    />
  );
}
