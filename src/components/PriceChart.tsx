import { useState, type MouseEvent } from 'react';
import type { BiggestMove, PricePoint } from '../types.ts';

interface PriceChartProps {
  prices: PricePoint[];
  biggestMove: BiggestMove | null;
}

const WIDTH = 520;
const HEIGHT = 190;
const PAD_LEFT = 38;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;

function formatTimestamp(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function PriceChart({ prices, biggestMove }: PriceChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (prices.length < 2) {
    return (
      <div className="border border-rule bg-paper h-[190px] flex items-center justify-center p-6 text-sm text-ink-soft">
        Price history is unavailable for this market.
      </div>
    );
  }

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const minT = prices[0].t;
  const maxT = prices[prices.length - 1].t;
  const spanT = Math.max(maxT - minT, 1);

  const xOf = (t: number) => PAD_LEFT + ((t - minT) / spanT) * plotW;
  const yOf = (p: number) => PAD_TOP + (1 - Math.max(0, Math.min(1, p))) * plotH;

  const linePath = prices
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xOf(pt.t).toFixed(1)} ${yOf(pt.p).toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${xOf(prices[prices.length - 1].t).toFixed(1)} ${(
    PAD_TOP + plotH
  ).toFixed(1)} L ${xOf(prices[0].t).toFixed(1)} ${(PAD_TOP + plotH).toFixed(1)} Z`;

  const gridLevels = [0.25, 0.5, 0.75];

  const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const targetT = minT + ((svgX - PAD_LEFT) / plotW) * spanT;

    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < prices.length; i++) {
      const dist = Math.abs(prices[i].t - targetT);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  };

  const hoverPt = hoverIdx !== null ? prices[hoverIdx] ?? null : null;

  return (
    <div className="relative border border-rule bg-sheet p-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto block cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Yes share price over the last 7 days"
      >
        {gridLevels.map((lvl) => {
          const y = yOf(lvl);
          return (
            <g key={lvl}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={WIDTH - PAD_RIGHT}
                y2={y}
                stroke="#d9dee5"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#8a93a6"
                className="tabular-nums"
              >
                {Math.round(lvl * 100)}¢
              </text>
            </g>
          );
        })}

        {biggestMove && (
          <rect
            x={Math.max(PAD_LEFT, xOf(biggestMove.startAt))}
            y={PAD_TOP}
            width={Math.max(
              3,
              Math.min(WIDTH - PAD_RIGHT, xOf(biggestMove.at)) -
                Math.max(PAD_LEFT, xOf(biggestMove.startAt))
            )}
            height={plotH}
            fill="#b7700b"
            fillOpacity={0.13}
          />
        )}

        <path d={areaPath} fill="#14223d" fillOpacity={0.06} />
        <path d={linePath} fill="none" stroke="#14223d" strokeWidth={2} strokeLinejoin="round" />

        {hoverPt && (
          <g>
            <line
              x1={xOf(hoverPt.t)}
              y1={PAD_TOP}
              x2={xOf(hoverPt.t)}
              y2={PAD_TOP + plotH}
              stroke="#57627a"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle cx={xOf(hoverPt.t)} cy={yOf(hoverPt.p)} r={3.5} fill="#14223d" />
          </g>
        )}

        <text x={PAD_LEFT} y={HEIGHT - 5} fontSize="11" fill="#8a93a6">
          7 days ago
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 5} textAnchor="end" fontSize="11" fill="#8a93a6">
          now
        </text>
      </svg>

      {hoverPt && (
        <div
          className="pointer-events-none absolute top-3 bg-navy text-white px-2.5 py-1.5 text-xs tabular-nums"
          style={{
            left: `${Math.min(Math.max((xOf(hoverPt.t) / WIDTH) * 100, 18), 78)}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="font-semibold">{(hoverPt.p * 100).toFixed(1)}¢</span>
          <span className="text-[#d9dee5] ml-2">{formatTimestamp(hoverPt.t)}</span>
        </div>
      )}
    </div>
  );
}
