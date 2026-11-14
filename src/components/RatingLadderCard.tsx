import type { BoardResponse, LetterRating } from '../types.ts';
import { formatInteger, getLetterBandColor } from '../utils/format.ts';

interface RatingLadderCardProps {
  board: BoardResponse | null;
  loading: boolean;
  error: string | null;
}

const LETTERS: Array<{ letter: LetterRating; caption?: string }> = [
  { letter: 'AAA', caption: 'Real, broad trading' },
  { letter: 'AA' },
  { letter: 'A' },
  { letter: 'BBB', caption: 'Usable with care' },
  { letter: 'BB' },
  { letter: 'B' },
  { letter: 'CCC', caption: 'Likely staged' },
];

export function RatingLadderCard({ board, loading, error }: RatingLadderCardProps) {
  const counts = new Map<LetterRating, number>();
  for (const item of LETTERS) counts.set(item.letter, 0);
  if (board) {
    for (const row of board.rows) {
      counts.set(row.letter, (counts.get(row.letter) ?? 0) + 1);
    }
  }
  const maxCount = Math.max(1, ...Array.from(counts.values()));

  return (
    <aside className="bg-sheet border border-rule p-5 sm:p-6 flex flex-col justify-between">
      <div>
        <h2 className="font-serif font-semibold text-lg text-ink">Today&apos;s board</h2>
        {loading ? (
          <p className="mt-1.5 text-sm text-ink-soft">
            Rating live Polymarket markets and tracing wallet histories…
          </p>
        ) : error ? (
          <p className="mt-1.5 text-sm text-fail">{error}</p>
        ) : board ? (
          <p className="mt-1.5 text-sm text-ink-soft leading-relaxed tabular-nums">
            {board.rows.length} live markets rated from {formatInteger(board.totalFills)} trade
            records and {formatInteger(board.totalWallets)} wallet histories.
          </p>
        ) : null}
      </div>

      <div className="mt-5 space-y-2.5">
        {LETTERS.map(({ letter, caption }) => {
          const count = counts.get(letter) ?? 0;
          const pct = board ? (count / maxCount) * 100 : 0;
          const color = getLetterBandColor(letter);

          return (
            <div key={letter}>
              <div className="flex items-center gap-3">
                <span
                  className="font-serif font-semibold text-sm w-9 shrink-0"
                  style={{ color }}
                >
                  {letter}
                </span>
                <div className="flex-1 h-2.5 bg-paper overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{
                      width: count > 0 ? `${Math.max(pct, 6)}%` : '0%',
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="text-xs text-ink-soft tabular-nums w-6 text-right shrink-0">
                  {loading ? '—' : count}
                </span>
              </div>
              {caption && (
                <div className="pl-12 mt-0.5 text-[11px] text-ink-faint">{caption}</div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
