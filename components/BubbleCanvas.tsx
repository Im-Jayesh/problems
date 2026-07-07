"use client";

import { useEffect, useRef } from 'react';
import { db } from '@/lib/db';

type BubbleCanvasProps = {
  onBubbleClick: (id: string) => void;
};

// Palette for random assignments
const PALETTE = ['#AEB4A9', '#D89A9E', '#C37D92', '#846267'];

function drawAmoeba(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, seed: number, color: string, isClaimed: boolean) {
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

export default function BubbleCanvas({ onBubbleClick }: BubbleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data } = db.useQuery({ clusters: {} });
  
  // Persist physics state outside of React's render cycle so bubbles don't teleport when data updates
  const physicsState = useRef<{ [id: string]: any }>({});

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
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: 0,
          vy: 0,
          targetRadius,
          radius: 0, // Animate in from 0
          color: PALETTE[i % PALETTE.length],
          seed: Math.random() * 100,
        };
      } else {
        // Update data but keep physics intact
        physicsState.current[cluster.id].title = cluster.title;
        physicsState.current[cluster.id].totalWeight = cluster.totalWeight;
        physicsState.current[cluster.id].claimedByName = cluster.claimedByName;
        physicsState.current[cluster.id].targetRadius = targetRadius;
        physicsState.current[cluster.id].category = cluster.category;
      }
    });
  }, [data]);

  // 3. Physics Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      const bubbles = Object.values(physicsState.current);

      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        
        // Smoothly animate radius growing/shrinking
        b.radius += (b.targetRadius - b.radius) * 0.05;

        // Gravity to center
        const dx = cx - b.x;
        const dy = cy - b.y;
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
        drawAmoeba(ctx, b.x, b.y, b.radius, time, b.seed, b.color, !!b.claimedByName);

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

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const bubbles = Object.values(physicsState.current);
      for (const b of bubbles) {
        const dist = Math.sqrt(Math.pow(mx - b.x, 2) + Math.pow(my - b.y, 2));
        if (dist <= b.radius) {
          onBubbleClick(b.id);
          break;
        }
      }
    };
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);
    };
  }, [onBubbleClick]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1, cursor: 'pointer' }}
    />
  );
}
