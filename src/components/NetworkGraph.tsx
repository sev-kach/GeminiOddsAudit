import { useMemo, useState } from 'react';
import type { GraphLink, GraphNode } from '../types.ts';
import { formatUsd, getWalletClassColor, getWalletClassLabel } from '../utils/format.ts';

interface NetworkGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  r: number;
}

const WIDTH = 520;
const HEIGHT = 340;
const PAD = 26;

function simulateGraph(nodes: GraphNode[], links: GraphLink[]): PositionedNode[] {
  if (nodes.length === 0) return [];

  const maxUsd = Math.max(...nodes.map((n) => n.usd), 1);
  const pos: PositionedNode[] = nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    const ring = 40 + (i % 4) * 28;
    const r = 5 + Math.sqrt(Math.max(n.usd, 0) / maxUsd) * 16;
    return {
      ...n,
      r,
      x: WIDTH / 2 + Math.cos(angle) * ring,
      y: HEIGHT / 2 + Math.sin(angle) * ring,
    };
  });

  const indexById = new Map<string, number>();
  pos.forEach((n, idx) => indexById.set(n.id, idx));

  const vx = new Float64Array(pos.length);
  const vy = new Float64Array(pos.length);

  const ticks = 300;
  for (let tick = 0; tick < ticks; tick++) {
    const alpha = 1 - tick / ticks;
    const repulseK = 1800 * (0.3 + 0.7 * alpha);

    // Pairwise repulsion
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        let dx = pos[j].x - pos[i].x;
        let dy = pos[j].y - pos[i].y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) {
          dx = (i % 2 === 0 ? 1 : -1) * 0.7;
          dy = (j % 2 === 0 ? 1 : -1) * 0.7;
          distSq = 1;
        }
        const dist = Math.sqrt(distSq);
        const minDist = pos[i].r + pos[j].r + 8;
        let force = repulseK / distSq;
        if (dist < minDist) {
          force += (minDist - dist) * 0.35;
        }
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        vx[i] -= fx;
        vy[i] -= fy;
        vx[j] += fx;
        vy[j] += fy;
      }
    }

    // Link springs
    for (const l of links) {
      const ia = indexById.get(l.a);
      const ib = indexById.get(l.b);
      if (ia === undefined || ib === undefined) continue;
      const dx = pos[ib].x - pos[ia].x;
      const dy = pos[ib].y - pos[ia].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetDist = pos[ia].r + pos[ib].r + 36;
      const pull = (dist - targetDist) * 0.045;
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      vx[ia] += fx;
      vy[ia] += fy;
      vx[ib] -= fx;
      vy[ib] -= fy;
    }

    // Gentle centering + integration + clamp
    for (let i = 0; i < pos.length; i++) {
      vx[i] = (vx[i] + (WIDTH / 2 - pos[i].x) * 0.014) * 0.65;
      vy[i] = (vy[i] + (HEIGHT / 2 - pos[i].y) * 0.014) * 0.65;

      pos[i].x += vx[i];
      pos[i].y += vy[i];

      const boundX = PAD + pos[i].r;
      const boundY = PAD + pos[i].r;
      pos[i].x = Math.max(boundX, Math.min(WIDTH - boundX, pos[i].x));
      pos[i].y = Math.max(boundY, Math.min(HEIGHT - boundY, pos[i].y));
    }
  }

  return pos;
}

export function NetworkGraph({ nodes, links }: NetworkGraphProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const positioned = useMemo(() => simulateGraph(nodes, links), [nodes, links]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    for (const n of positioned) m.set(n.id, n);
    return m;
  }, [positioned]);

  const neighborSet = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const l of links) {
      if (l.a === activeId) set.add(l.b);
      if (l.b === activeId) set.add(l.a);
    }
    return set;
  }, [activeId, links]);

  const maxLinkUsd = useMemo(
    () => Math.max(...links.map((l) => l.usd), 1),
    [links]
  );

  const activeNode = activeId ? nodeMap.get(activeId) ?? null : null;

  if (nodes.length === 0) {
    return (
      <div className="border border-rule bg-paper h-[280px] flex items-center justify-center p-6 text-sm text-ink-soft">
        No wallet trading pairs found in the past 7 days.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="border border-rule bg-paper relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto block"
          role="img"
          aria-label="Force-directed graph of the largest wallets and their shared transactions"
        >
          {links.map((link) => {
            const a = nodeMap.get(link.a);
            const b = nodeMap.get(link.b);
            if (!a || !b) return null;
            const isConnected = activeId ? link.a === activeId || link.b === activeId : true;
            const width = 0.8 + (link.usd / maxLinkUsd) * 2.8;
            return (
              <line
                key={`${link.a}-${link.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={activeId && isConnected ? '#14223d' : '#cfd6e0'}
                strokeWidth={width}
                strokeOpacity={activeId ? (isConnected ? 0.85 : 0.12) : 0.75}
              />
            );
          })}

          {positioned.map((node) => {
            const isVisible = neighborSet ? neighborSet.has(node.id) : true;
            const isSelected = activeId === node.id;
            return (
              <circle
                key={node.id}
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={getWalletClassColor(node.cls)}
                stroke={isSelected ? '#14223d' : '#ffffff'}
                strokeWidth={isSelected ? 2 : 1.5}
                fillOpacity={isVisible ? 0.94 : 0.16}
                strokeOpacity={isVisible ? 1 : 0.2}
                tabIndex={0}
                role="button"
                aria-label={`Wallet ${node.label}, ${getWalletClassLabel(node.cls)}, ${formatUsd(
                  node.usd
                )}`}
                onMouseEnter={() => setActiveId(node.id)}
                onMouseLeave={() => setActiveId(null)}
                onFocus={() => setActiveId(node.id)}
                onBlur={() => setActiveId(null)}
                className="cursor-pointer focus:outline-none"
              />
            );
          })}
        </svg>

        {activeNode && (
          <div
            className="pointer-events-none absolute z-10 bg-navy text-white px-3 py-2 text-xs leading-snug"
            style={{
              left: `${Math.min(Math.max((activeNode.x / WIDTH) * 100, 14), 72)}%`,
              top: `${activeNode.y > HEIGHT * 0.55 ? ((activeNode.y - activeNode.r - 12) / HEIGHT) * 100 : ((activeNode.y + activeNode.r + 12) / HEIGHT) * 100}%`,
              transform: activeNode.y > HEIGHT * 0.55 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
          >
            <div className="font-semibold tabular-nums">Wallet {activeNode.label}</div>
            <div className="text-[#d9dee5]">{getWalletClassLabel(activeNode.cls)}</div>
            <div className="tabular-nums font-medium mt-0.5">{formatUsd(activeNode.usd)}</div>
          </div>
        )}
      </div>

      <p className="mt-2.5 text-xs text-ink-soft leading-relaxed">
        Circles show the 40 largest wallets sized by dollar volume and colored by wallet type. Lines
        link wallets that filled trades inside the same transaction.
      </p>
    </div>
  );
}
