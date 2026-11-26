"use client";

import { useEffect, useRef } from 'react';
import { db } from '@/lib/db';

type BubbleCanvasProps = {
  onBubbleClick: (id: string, problemText?: string) => void;
  focusBubbleId?: string | null;
  glowBubbleId?: string | null;
  mergeHighlight?: { clusterId: string; text?: string; seq: number } | null;
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
  isClaimed: boolean,
  highlighted = false
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

  ctx.save();
  if (highlighted) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = highlighted ? `${color}CC` : `${color}99`;
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = highlighted ? 3 : isClaimed ? 3.5 : 2;
  ctx.strokeStyle = isClaimed ? CLAIMED_RING_COLOR : highlighted ? '#FFFFFF' : color;
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

const MAX_SUB_BUBBLES = 9;

type ProblemItem = {
  id: string;
  text: string;
  createdAt?: number;
};

type TopLevelProblemRecord = {
  id: string;
  text: string;
  createdAt?: number;
  cluster?: { id: string } | { id: string }[];
};

type ClusterRecord = {
  id: string;
  title: string;
  totalWeight?: number;
  submissionCount?: number;
  category?: string;
  claimedByName?: string;
  claims?: { id: string }[];
  problems?: ProblemItem[];
};

type BubbleNode = {
  id: string;
  title: string;
  totalWeight: number;
  submissionCount: number;
  category?: string;
  hasClaims: boolean;
  problems: ProblemItem[];
  hiddenProblemCount: number;
  splitProgress: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetRadius: number;
  radius: number;
  color: string;
  seed: number;
};

function dedupeProblems(
  title: string,
  rawProblems?: ProblemItem[],
  optimisticProblems?: ProblemItem[]
): {
  visible: ProblemItem[];
  hiddenCount: number;
} {
  const seen = new Set<string>();
  const unique: ProblemItem[] = [];

  const pushIfUnique = (item: ProblemItem) => {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  };

  // Ensure the primary cluster title appears first
  pushIfUnique({ id: 'primary', text: title });

  const combined = [...(optimisticProblems || []), ...(rawProblems || [])].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );
  for (const p of combined) {
    pushIfUnique(p);
  }

  // If multiple submissions exist with identical text (e.g. direct re-submit), still allow splitting
  if (unique.length === 1 && combined.length > 1) {
    const fallback = [{ id: 'primary', text: title }, ...combined.slice(0, MAX_SUB_BUBBLES - 1)];
    return {
      visible: fallback.slice(0, MAX_SUB_BUBBLES),
      hiddenCount: Math.max(0, combined.length + 1 - MAX_SUB_BUBBLES),
    };
  }

  if (unique.length <= MAX_SUB_BUBBLES) {
    return { visible: unique, hiddenCount: 0 };
  }
  return {
    visible: unique.slice(0, MAX_SUB_BUBBLES),
    hiddenCount: unique.length - MAX_SUB_BUBBLES,
  };
}

function getSubBubbleOffsets(b: BubbleNode): {
  subRadius: number;
  orbitRadius: number;
  items: { problem: ProblemItem; dx: number; dy: number }[];
} {
  const count = b.problems.length;
  const subRadius = Math.max(38, Math.min(54, b.radius * 0.54));
  const minCenterGap = subRadius * 2.65;

  if (count <= 1) {
    return { subRadius: b.radius, orbitRadius: 0, items: [] };
  }

  if (count >= 7) {
    const outerCount = count - 1;
    const orbitRadius = Math.max(
      minCenterGap,
      minCenterGap / (2 * Math.sin(Math.PI / outerCount))
    );
    const items = b.problems.map((problem, idx) => {
      if (idx === 0) return { problem, dx: 0, dy: 0 };
      const angle = ((idx - 1) / outerCount) * Math.PI * 2 - Math.PI / 2;
      return {
        problem,
        dx: Math.cos(angle) * orbitRadius,
        dy: Math.sin(angle) * orbitRadius,
      };
    });
    return { subRadius, orbitRadius, items };
  }

  const orbitRadius = Math.max(
    b.radius * 0.95,
    minCenterGap / (2 * Math.sin(Math.PI / count))
  );
  const items = b.problems.map((problem, idx) => {
    const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
    return {
      problem,
      dx: Math.cos(angle) * orbitRadius,
      dy: Math.sin(angle) * orbitRadius,
    };
  });
  return { subRadius, orbitRadius, items };
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        // Fit remaining words into last line with ellipsis if needed
        const rest = [current, ...words.slice(i + 1)].join(' ');
        let clipped = rest;
        while (clipped.length > 3 && ctx.measureText(`${clipped}...`).width > maxWidth) {
          clipped = clipped.slice(0, -1);
        }
        lines.push(clipped === rest ? clipped : `${clipped.trimEnd()}...`);
        current = '';
        break;
      }
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}

export default function BubbleCanvas({
  onBubbleClick,
  focusBubbleId,
  glowBubbleId,
  mergeHighlight = null,
  activeCategory = null,
  searchQuery = '',
  showClaimedOnly = false,
  theme = 'light',
}: BubbleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data } = db.useQuery({
    clusters: { claims: {}, problems: {} },
    problems: { cluster: {} },
  });

  const physicsState = useRef<Record<string, BubbleNode>>({});
  const categoryGravityRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const camera = useRef({ x: 0, y: 0, zoom: 1 });
  const targetBubbleId = useRef<string | null>(null);
  const viewportSize = useRef({ width: 1200, height: 800, dpr: 1 });
  const fontFamilyRef = useRef<string>('Inter, sans-serif');
  const hoveredClusterIdRef = useRef<string | null>(null);
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  const optimisticProblemsRef = useRef<Map<string, ProblemItem[]>>(new Map());
  const autoSplitUntilRef = useRef<{ clusterId: string; until: number } | null>(null);

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

  useEffect(() => {
    if (!mergeHighlight) return;
    const { clusterId, text, seq } = mergeHighlight;
    autoSplitUntilRef.current = { clusterId, until: Date.now() + 4500 };

    if (text && text.trim()) {
      const existing = optimisticProblemsRef.current.get(clusterId) || [];
      const next = [
        { id: `optimistic-${seq}`, text: text.trim(), createdAt: Date.now() },
        ...existing,
      ].slice(0, MAX_SUB_BUBBLES);
      optimisticProblemsRef.current.set(clusterId, next);

      const node = physicsState.current[clusterId];
      if (node) {
        const { visible, hiddenCount } = dedupeProblems(node.title, node.problems, next);
        node.problems = visible;
        node.hiddenProblemCount = hiddenCount;
      }
    }
  }, [mergeHighlight]);

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
    const problemsByCluster = new Map<string, ProblemItem[]>();
    const topLevelProblems = (data.problems || []) as TopLevelProblemRecord[];
    for (const p of topLevelProblems) {
      const linked = Array.isArray(p.cluster) ? p.cluster : p.cluster ? [p.cluster] : [];
      for (const c of linked) {
        if (!c?.id) continue;
        const list = problemsByCluster.get(c.id) || [];
        list.push({ id: p.id, text: p.text, createdAt: p.createdAt });
        problemsByCluster.set(c.id, list);
      }
    }

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

      const optimistic = optimisticProblemsRef.current.get(cluster.id);
      const mergedRawProblems = [
        ...(cluster.problems || []),
        ...(problemsByCluster.get(cluster.id) || []),
      ];
      const { visible, hiddenCount } = dedupeProblems(
        cluster.title,
        mergedRawProblems,
        optimistic
      );

      if (!physicsState.current[cluster.id]) {
        physicsState.current[cluster.id] = {
          id: cluster.id,
          title: cluster.title,
          totalWeight: cluster.totalWeight || 1,
          category: cluster.category,
          hasClaims: isClaimed,
          problems: visible,
          hiddenProblemCount: hiddenCount,
          splitProgress: 0,
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
        b.problems = visible;
        b.hiddenProblemCount = hiddenCount;
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

    const toWorldCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      return {
        x: (mx - rect.width / 2) / camera.current.zoom + camera.current.x,
        y: (my - rect.height / 2) / camera.current.zoom + camera.current.y,
      };
    };

    const handlePointerDown = (e: PointerEvent) => {
      lastPointerTypeRef.current = e.pointerType || 'mouse';
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      targetBubbleId.current = null;
      if (e.pointerType !== 'touch') {
        pointerClientRef.current = { x: e.clientX, y: e.clientY };
      }
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

    const isOverUiOverlay = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      return Boolean(
        el?.closest('.trending-rail, .problem-input-container, .modal-overlay, .presence-bar')
      );
    };

    const handlePointerMove = (e: PointerEvent) => {
      lastPointerTypeRef.current = e.pointerType || 'mouse';
      if (e.pointerType !== 'touch') {
        if (e.buttons === 0 && activePointers.size > 0) {
          activePointers.clear();
        }
        if (!isOverUiOverlay(e.clientX, e.clientY)) {
          pointerClientRef.current = { x: e.clientX, y: e.clientY };
        } else if (activePointers.size === 0) {
          pointerClientRef.current = null;
          hoveredClusterIdRef.current = null;
        }
      }

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

    const handleMouseMove = (e: MouseEvent) => {
      if (lastPointerTypeRef.current === 'touch') return;
      if (e.buttons === 0 && activePointers.size > 0) {
        activePointers.clear();
      }
      if (!isOverUiOverlay(e.clientX, e.clientY)) {
        pointerClientRef.current = { x: e.clientX, y: e.clientY };
      } else if (activePointers.size === 0) {
        pointerClientRef.current = null;
        hoveredClusterIdRef.current = null;
      }
    };

    const handlePointerLeave = () => {
      if (lastPointerTypeRef.current !== 'touch') {
        pointerClientRef.current = null;
        hoveredClusterIdRef.current = null;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        prevPinchDist = null;
        prevPinchMid = null;
      }
      if (activePointers.size === 0) {
        canvas.style.cursor = hoveredClusterIdRef.current ? 'pointer' : 'grab';
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (hadMultiTouch) return;
      if (Math.abs(e.clientX - clickStartX) > 6 || Math.abs(e.clientY - clickStartY) > 6) {
        return;
      }

      const { x: worldX, y: worldY } = toWorldCoords(e.clientX, e.clientY);
      const bubbles = Object.values(physicsState.current);

      // Check active split sub-bubbles first
      const activeId = hoveredClusterIdRef.current;
      if (activeId && physicsState.current[activeId]) {
        const activeBubble = physicsState.current[activeId];
        if (activeBubble.problems.length > 1 && activeBubble.splitProgress > 0.25) {
          const layout = getSubBubbleOffsets(activeBubble);
          for (let s = layout.items.length - 1; s >= 0; s--) {
            const item = layout.items[s];
            const sx = activeBubble.x + item.dx * activeBubble.splitProgress;
            const sy = activeBubble.y + item.dy * activeBubble.splitProgress;
            const sr =
              activeBubble.radius +
              (layout.subRadius - activeBubble.radius) * activeBubble.splitProgress;
            if (Math.hypot(worldX - sx, worldY - sy) <= sr) {
              onBubbleClickRef.current(activeBubble.id, item.problem.text);
              return;
            }
          }
          // Clicking center of an expanded cluster on touch opens the modal
          if (
            Math.hypot(worldX - activeBubble.x, worldY - activeBubble.y) <=
            layout.orbitRadius + layout.subRadius
          ) {
            onBubbleClickRef.current(activeBubble.id);
            return;
          }
          // Tapping outside collapses touch-expanded cluster
          if (lastPointerTypeRef.current === 'touch') {
            hoveredClusterIdRef.current = null;
            return;
          }
        }
      }

      // Reverse iterate so top-most rendered bubble wins hit-testing
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        const dist = Math.hypot(worldX - b.x, worldY - b.y);
        if (dist <= b.radius) {
          // On touch devices, tapping a multi-problem bubble splits it first
          if (
            lastPointerTypeRef.current === 'touch' &&
            b.problems.length > 1 &&
            hoveredClusterIdRef.current !== b.id
          ) {
            hoveredClusterIdRef.current = b.id;
            return;
          }
          onBubbleClickRef.current(b.id);
          break;
        }
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('mousemove', handleMouseMove);
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

      // Compute live world pointer coordinates every frame so pan/zoom stays synced
      const ptr = pointerClientRef.current
        ? toWorldCoords(pointerClientRef.current.x, pointerClientRef.current.y)
        : null;

      // Update hover target with generous anti-flicker ring for split bubbles
      if (lastPointerTypeRef.current !== 'touch' && activePointers.size === 0) {
        if (ptr) {
          let nextHoverId: string | null = null;
          const currentHoverId = hoveredClusterIdRef.current;

          if (currentHoverId && physicsState.current[currentHoverId]) {
            const hb = physicsState.current[currentHoverId];
            if (hb.problems.length > 1 && hb.splitProgress > 0.05) {
              const layout = getSubBubbleOffsets(hb);
              const hitZone = layout.orbitRadius + layout.subRadius + 32;
              if (Math.hypot(ptr.x - hb.x, ptr.y - hb.y) <= hitZone) {
                nextHoverId = hb.id;
              }
            }
          }

          if (!nextHoverId) {
            for (let i = bubbles.length - 1; i >= 0; i--) {
              const b = bubbles[i];
              if (Math.hypot(ptr.x - b.x, ptr.y - b.y) <= b.radius * 1.12) {
                nextHoverId = b.id;
                break;
              }
            }
          }

          hoveredClusterIdRef.current = nextHoverId;
          canvas.style.cursor = nextHoverId ? 'pointer' : 'grab';
        } else {
          hoveredClusterIdRef.current = null;
          canvas.style.cursor = 'grab';
        }
      }

      // Advance split/merge animations and find max active split for background dimming
      let maxSplit = 0;
      const hoveredId = hoveredClusterIdRef.current;
      const nowMs = Date.now();
      const autoSplit = autoSplitUntilRef.current;
      const autoSplitId =
        autoSplit && nowMs < autoSplit.until && (!hoveredId || hoveredId === autoSplit.clusterId)
          ? autoSplit.clusterId
          : null;
      if (autoSplit && nowMs >= autoSplit.until) {
        autoSplitUntilRef.current = null;
      }

      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const isSplitActive = hoveredId === b.id || autoSplitId === b.id;
        const targetSplit = isSplitActive && b.problems.length > 1 ? 1 : 0;
        b.splitProgress += (targetSplit - b.splitProgress) * 0.16;
        if (b.splitProgress < 0.004 && targetSplit === 0) b.splitProgress = 0;
        if (b.splitProgress > 0.996 && targetSplit === 1) b.splitProgress = 1;
        if (b.splitProgress > maxSplit) maxSplit = b.splitProgress;
      }

      const splitBubbles: BubbleNode[] = [];

      // Render non-splitting bubbles first with viewport culling
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        if (b.splitProgress > 0.005 && b.problems.length > 1) {
          splitBubbles.push(b);
          continue;
        }

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
          const anySub = b.problems.some((p) => p.text.toLowerCase().includes(query));
          if (!t.includes(query) && !c.includes(query) && !anySub) matchesFilter = false;
        }

        const isHoveredSingle = hoveredId === b.id;
        const isGlowing = Boolean(activeGlowId && b.id === activeGlowId);

        ctx.save();
        if (!matchesFilter) {
          ctx.globalAlpha = 0.16;
        } else if (maxSplit > 0.01) {
          ctx.globalAlpha = 1 - maxSplit * 0.65;
        }

        // Gentle single-color pulse ring on merge instead of flashing random colors
        if (isGlowing) {
          const pulse = (Math.sin(time * 0.008) + 1) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius + 8 + pulse * 10, 0, Math.PI * 2);
          ctx.strokeStyle = b.color;
          ctx.globalAlpha = 0.25 + pulse * 0.45;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }

        drawAmoeba(
          ctx,
          b.x,
          b.y,
          b.radius,
          time,
          b.seed,
          b.color,
          b.hasClaims,
          isHoveredSingle || isGlowing
        );

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
          const subLabel =
            b.problems.length > 1
              ? `${b.totalWeight} votes · ${b.problems.length} nuances`
              : `${b.totalWeight} votes`;
          ctx.fillText(subLabel, b.x, b.y + 13);
        }

        ctx.restore();
      }

      // Render splitting / split clusters on top so sub-bubbles are highlighted & unobstructed
      const isDark = themeRef.current === 'dark';
      for (let sIdx = 0; sIdx < splitBubbles.length; sIdx++) {
        const b = splitBubbles[sIdx];
        const layout = getSubBubbleOffsets(b);
        const p = b.splitProgress;

        ctx.save();

        // Soft outer halo ring indicating the merged group boundary
        ctx.beginPath();
        ctx.arc(b.x, b.y, (layout.orbitRadius + layout.subRadius + 10) * p, 0, Math.PI * 2);
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.25 * p;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tether lines from parent center to each sub-bubble
        ctx.globalAlpha = 0.4 * p;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        for (let k = 0; k < layout.items.length; k++) {
          const item = layout.items[k];
          if (item.dx === 0 && item.dy === 0) continue;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x + item.dx * p, b.y + item.dy * p);
          ctx.stroke();
        }

        ctx.globalAlpha = 1;

        for (let k = 0; k < layout.items.length; k++) {
          const item = layout.items[k];
          const sx = b.x + item.dx * p;
          const sy = b.y + item.dy * p;
          const sr = b.radius + (layout.subRadius - b.radius) * p;
          const isSubHovered =
            Boolean(ptr) && Math.hypot(ptr!.x - sx, ptr!.y - sy) <= sr * 1.05;

          drawAmoeba(
            ctx,
            sx,
            sy,
            isSubHovered ? sr * 1.06 : sr,
            time,
            b.seed + k * 1.7,
            b.color,
            k === 0 && b.hasClaims,
            true
          );

          if (p > 0.35 && sr * zoom > 16) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, (p - 0.35) / 0.45);
            ctx.fillStyle = isDark ? '#FFF7F9' : '#2E2225';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `600 12px ${font}`;
            drawWrappedText(ctx, item.problem.text, sx, sy, sr * 1.55, 14, 3);
            ctx.restore();
          }
        }

        if (b.hiddenProblemCount > 0 && p > 0.5) {
          ctx.save();
          ctx.globalAlpha = (p - 0.5) * 2;
          const badgeY = b.y + (layout.orbitRadius + layout.subRadius + 24) * p;
          const label = `+${b.hiddenProblemCount} more nuances (click to view all)`;
          ctx.font = `600 12px ${font}`;
          const textW = ctx.measureText(label).width + 20;
          ctx.fillStyle = isDark ? 'rgba(30, 24, 26, 0.9)' : 'rgba(255, 255, 255, 0.92)';
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(b.x - textW / 2, badgeY - 13, textW, 26, 13);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isDark ? '#F5ECEE' : '#4A3A3D';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, b.x, badgeY);
          ctx.restore();
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
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handleMouseMove);
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
