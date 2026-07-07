"use client";

import { useEffect, useRef } from 'react';
import { db } from '@/lib/db';

type BubbleCanvasProps = {
  onBubbleClick: (id: string) => void;
  focusBubbleId?: string | null;
  glowBubbleId?: string | null;
};

// Expanded palette for categories
const PALETTE = [
  '#AEB4A9', '#D89A9E', '#C37D92', '#846267', 
  '#F4A261', '#E76F51', '#2A9D8F', '#E9C46A', '#264653', '#A8DADC', '#457B9D'
];

const getCategoryColor = (category?: string) => {
  if (!category || category === 'Unknown') return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

const getCategoryGravity = (category?: string) => {
  if (!category || category === 'Unknown') return { x: 0, y: 0 };
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  const distance = 800; // Orbit distance from world origin
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance
  };
};

function drawAmoeba(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, seed: number, color: string, isClaimed: boolean, submissionCount: number = 1) {
  const points = 10;
  const vertices = [];
  
  // Calculate organic points
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    // Layered sine waves for organic movement
    const noise = Math.sin(angle * 3 + time * 0.0015 + seed) * (r * 0.12) 
                + Math.cos(angle * 2 - time * 0.001 + seed * 2) * (r * 0.08);
    const radius = r + noise;
    vertices.push({
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius
    });
  }

  ctx.beginPath();
  // Start at the midpoint between the last and first vertex
  const startX = (vertices[points - 1].x + vertices[0].x) / 2;
  const startY = (vertices[points - 1].y + vertices[0].y) / 2;
  ctx.moveTo(startX, startY);

  for (let i = 0; i < points; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % points];
    const xc = (p1.x + p2.x) / 2;
    const yc = (p1.y + p2.y) / 2;
    // Draw curve through the vertex to the next midpoint
    ctx.quadraticCurveTo(p1.x, p1.y, xc, yc);
  }
  ctx.closePath();

  // Fill with slight transparency for overlapping glass effect
  ctx.fillStyle = color + '99'; // 60% opacity hex
  ctx.fill();
  
  ctx.lineWidth = isClaimed ? 4 : 2;
  ctx.strokeStyle = isClaimed ? '#AEB4A9' : color;
  ctx.stroke();
}

export default function BubbleCanvas({ onBubbleClick, focusBubbleId, glowBubbleId }: BubbleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data } = db.useQuery({ clusters: { claims: {} } });
  
  // Persist physics state outside of React's render cycle
  const physicsState = useRef<{ [id: string]: any }>({});
  
  // Camera state for the infinite canvas
  const camera = useRef({ x: 0, y: 0, zoom: 1 });
  const targetBubbleId = useRef<string | null>(null);

  useEffect(() => {
    if (focusBubbleId) targetBubbleId.current = focusBubbleId;
  }, [focusBubbleId]);

  // 1. Handle Canvas Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  // 2. Sync InstantDB data into Physics State
  useEffect(() => {
    if (!data?.clusters) return;
    
    // Find the highest voted problem to calculate relative sizing
    const maxWeight = Math.max(1, ...data.clusters.map(c => c.totalWeight || 1));
    const currentIds = new Set(data.clusters.map(c => c.id));
    
    // Remove deleted clusters
    for (const id in physicsState.current) {
      if (!currentIds.has(id)) delete physicsState.current[id];
    }

    // Add new or update existing clusters
    data.clusters.forEach((cluster, i) => {
      // Calculate target radius relative to the biggest bubble
      // Min radius: 50, Max radius: 220
      const weightRatio = (cluster.totalWeight || 1) / maxWeight;
      const targetRadius = 50 + (weightRatio * 170);

      if (!physicsState.current[cluster.id]) {
        physicsState.current[cluster.id] = {
          ...cluster,
          hasClaims: cluster.claims && cluster.claims.length > 0,
          // Spawn in world space around origin
          x: (Math.random() - 0.5) * 1000,
          y: (Math.random() - 0.5) * 1000,
          vx: 0,
          vy: 0,
          targetRadius,
          radius: 0, // Animate in from 0
          color: getCategoryColor(cluster.category),
          seed: Math.random() * 100,
          submissionCount: cluster.submissionCount || 1,
        };
      } else {
        // Update data but keep physics intact
        physicsState.current[cluster.id].title = cluster.title;
        physicsState.current[cluster.id].totalWeight = cluster.totalWeight;
        physicsState.current[cluster.id].hasClaims = cluster.claims && cluster.claims.length > 0;
        physicsState.current[cluster.id].targetRadius = targetRadius;
        physicsState.current[cluster.id].category = cluster.category;
        physicsState.current[cluster.id].color = getCategoryColor(cluster.category);
        physicsState.current[cluster.id].submissionCount = cluster.submissionCount || 1;
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
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let clickStartX = 0;
    let clickStartY = 0;

    // --- Interaction Handlers ---
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetBubbleId.current = null; // Break camera lock
      if (e.ctrlKey || e.metaKey) {
        // Pinch to zoom
        const zoomDelta = e.deltaY * -0.01;
        camera.current.zoom = Math.min(Math.max(0.1, camera.current.zoom + zoomDelta), 5);
      } else {
        // Two-finger scroll to pan
        camera.current.x += e.deltaX / camera.current.zoom;
        camera.current.y += e.deltaY / camera.current.zoom;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      targetBubbleId.current = null; // Break camera lock
      lastX = e.clientX;
      lastY = e.clientY;
      clickStartX = e.clientX;
      clickStartY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      // Move camera opposite to drag direction
      camera.current.x -= dx / camera.current.zoom;
      camera.current.y -= dy / camera.current.zoom;
    };

    const handlePointerUp = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    const handleClick = (e: MouseEvent) => {
      // Ignore if it was a drag
      if (Math.abs(e.clientX - clickStartX) > 5 || Math.abs(e.clientY - clickStartY) > 5) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Transform screen coordinates to world coordinates
      const worldX = (mx - canvas.width / 2) / camera.current.zoom + camera.current.x;
      const worldY = (my - canvas.height / 2) / camera.current.zoom + camera.current.y;

      const bubbles = Object.values(physicsState.current);
      for (const b of bubbles) {
        const dist = Math.sqrt(Math.pow(worldX - b.x, 2) + Math.pow(worldY - b.y, 2));
        if (dist <= b.radius) {
          onBubbleClick(b.id);
          break;
        }
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('click', handleClick);

    // --- Render Loop ---
    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smooth camera pan to target
      if (targetBubbleId.current && physicsState.current[targetBubbleId.current]) {
        const targetB = physicsState.current[targetBubbleId.current];
        camera.current.x += (targetB.x - camera.current.x) * 0.05;
        camera.current.y += (targetB.y - camera.current.y) * 0.05;
      }

      ctx.save();
      // Move to center of screen
      ctx.translate(canvas.width / 2, canvas.height / 2);
      // Apply zoom
      ctx.scale(camera.current.zoom, camera.current.zoom);
      // Apply pan offset
      ctx.translate(-camera.current.x, -camera.current.y);

      const bubbles = Object.values(physicsState.current);

      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        
        // Smoothly animate radius growing/shrinking
        b.radius += (b.targetRadius - b.radius) * 0.05;

        // Gravity to Category-Specific Orbit Node
        const gravity = getCategoryGravity(b.category);
        const dx = gravity.x - b.x;
        const dy = gravity.y - b.y;
        b.vx += dx * 0.00005;
        b.vy += dy * 0.00005;

        // Repulsion (Soft organic collision)
        for (let j = i + 1; j < bubbles.length; j++) {
          const b2 = bubbles[j];
          const distx = b2.x - b.x;
          const disty = b2.y - b.y;
          const dist = Math.sqrt(distx * distx + disty * disty);
          const minDist = b.radius + b2.radius + 5;

          if (dist < minDist) {
            const force = (minDist - dist) * 0.02;
            const nx = distx / dist;
            const ny = disty / dist;
            b.vx -= nx * force;
            b.vy -= ny * force;
            b2.vx += nx * force;
            b2.vy += ny * force;
          } else if (b.category && b2.category && b.category.toLowerCase() === b2.category.toLowerCase() && b.category !== 'Unknown' && dist < minDist + 300) {
            // Magnetic attraction for same category! (Semantic Constellations)
            const force = 0.001; // Gentle tug
            const nx = distx / dist;
            const ny = disty / dist;
            b.vx += nx * force;
            b.vy += ny * force;
            b2.vx -= nx * force;
            b2.vy -= ny * force;
          }
        }

        // Friction & Update
        b.vx *= 0.94;
        b.vy *= 0.94;
        b.x += b.vx;
        b.y += b.vy;

        // Draw organic amoeba
        ctx.save();
        let drawColor = b.color;
        
        if (glowBubbleId && b.id === glowBubbleId) {
          // Flicker through all colors in the palette rapidly (every 50ms)
          const colorIndex = Math.floor(time / 50) % PALETTE.length;
          drawColor = PALETTE[colorIndex];
        }
        
        drawAmoeba(ctx, b.x, b.y, b.radius, time, b.seed, drawColor, b.hasClaims, b.submissionCount);
        ctx.restore();

        // Draw text
        ctx.fillStyle = '#4A3A3D';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.font = '600 14px Inter';
        const title = b.title.length > 25 ? b.title.slice(0, 25) + '...' : b.title;
        ctx.fillText(title, b.x, b.y - 8);
        
        ctx.font = '13px Inter';
        ctx.fillStyle = 'rgba(74, 58, 61, 0.7)';
        ctx.fillText(`${b.totalWeight} votes`, b.x, b.y + 14);
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
      canvas.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);
    };
  }, [onBubbleClick]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1, cursor: 'grab' }}
    />
  );
}
