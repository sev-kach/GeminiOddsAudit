import type { LetterRating, WalletClass } from '../types.ts';

export function formatUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(val).toLocaleString('en-US')}`;
}

export function formatInteger(val: number): string {
  if (!Number.isFinite(val)) return '0';
  return Math.round(val).toLocaleString('en-US');
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%';
  const pct = ratio * 100;
  if (pct < 1) return `${pct.toFixed(1)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export function getLetterBandColor(letter: LetterRating): string {
  if (letter === 'AAA' || letter === 'AA' || letter === 'A') return '#1f7a4d';
  if (letter === 'BBB' || letter === 'BB') return '#b7700b';
  return '#b42318';
}

export function getWalletClassColor(cls: WalletClass): string {
  switch (cls) {
    case 'established':
      return '#1f7a4d';
    case 'other':
      return '#a9b1bf';
    case 'fresh':
      return '#b7700b';
    case 'wash':
      return '#b42318';
  }
}

export function getWalletClassLabel(cls: WalletClass): string {
  switch (cls) {
    case 'established':
      return 'Established trader';
    case 'other':
      return 'Other trader';
    case 'fresh':
      return 'Brand-new wallet';
    case 'wash':
      return 'Wash-like wallet';
  }
}
