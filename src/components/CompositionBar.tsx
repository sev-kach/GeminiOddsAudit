import { useState } from 'react';
import type { CompositionData } from '../types.ts';
import { formatPercent } from '../utils/format.ts';

type SegmentKey = 'established' | 'other' | 'fresh' | 'wash';

interface CompositionBarProps {
  composition: CompositionData;
  compact?: boolean;
}

const SEGMENTS: Array<{
  key: SegmentKey;
  label: string;
  color: string;
  note: string;
}> = [
  {
    key: 'established',
    label: 'Established traders',
    color: '#1f7a4d',
    note: 'Wallets with verified trading history and account age.',
  },
  {
    key: 'other',
    label: 'Other traders',
    color: '#a9b1bf',
    note: 'Wallets outside the major-holder cutoff or mid-history.',
  },
  {
    key: 'fresh',
    label: 'Brand-new wallets',
    color: '#b7700b',
    note: 'Recently created or untracked wallets active in this market.',
  },
  {
    key: 'wash',
    label: 'Wash-like wallets',
    color: '#b42318',
    note: 'Wallets flagged for self-trading, closed pairs, or round-trips.',
  },
];

export function CompositionBar({ composition, compact = false }: CompositionBarProps) {
  const [hovered, setHovered] = useState<SegmentKey | null>(null);

  const total =
    composition.established + composition.other + composition.fresh + composition.wash;
  const denom = total > 0 ? total : 1;

  if (compact) {
    return (
      <div
        className="flex w-[180px] h-2.5 gap-[2px] bg-paper"
        aria-label="Volume composition breakdown"
      >
        {SEGMENTS.map((seg) => {
          const val = composition[seg.key];
          const pct = (val / denom) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={seg.key}
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${formatPercent(val / denom)}`}
            />
          );
        })}
      </div>
    );
  }

  const freshInWashRatio =
    composition.totalUsd > 0 ? composition.freshInWash / composition.totalUsd : 0;

  return (
    <div>
      <div
        className="flex w-full h-7 gap-[2px] bg-paper"
        role="img"
        aria-label="Stacked horizontal bar showing volume share by trader type"
      >
        {SEGMENTS.map((seg) => {
          const val = composition[seg.key];
          const pct = (val / denom) * 100;
          if (pct <= 0) return null;
          const isDimmed = hovered !== null && hovered !== seg.key;
          return (
            <div
              key={seg.key}
              onMouseEnter={() => setHovered(seg.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: `${pct}%`,
                backgroundColor: seg.color,
              }}
              className={`h-full transition-opacity duration-150 cursor-pointer ${
                isDimmed ? 'opacity-25' : 'opacity-100'
              }`}
              title={`${seg.label}: ${formatPercent(val / denom)}`}
            />
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {SEGMENTS.map((seg) => {
          const val = composition[seg.key];
          const ratio = total > 0 ? val / total : 0;
          const isDimmed = hovered !== null && hovered !== seg.key;
          const extraWashNote =
            seg.key === 'wash' && freshInWashRatio >= 0.01
              ? ` ${formatPercent(freshInWashRatio)} of all trading from brand-new wallets inside these loops.`
              : '';

          return (
            <div
              key={seg.key}
              onMouseEnter={() => setHovered(seg.key)}
              onMouseLeave={() => setHovered(null)}
              className={`transition-opacity duration-150 cursor-pointer ${
                isDimmed ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-sm font-medium text-ink truncate">{seg.label}</span>
                </div>
                <span className="text-sm font-semibold text-ink tabular-nums shrink-0">
                  {formatPercent(ratio)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                {seg.note}
                {extraWashNote}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
