import type { BoardRow } from '../types.ts';
import { formatUsd, getLetterBandColor } from '../utils/format.ts';
import { CompositionBar } from './CompositionBar.tsx';
import { MarketThumbnail } from './MarketThumbnail.tsx';

interface RatingsBoardTableProps {
  rows: BoardRow[];
  loading: boolean;
  error: string | null;
  activeMarketUrl: string | null;
  onSelectMarket: (url: string) => void;
}

export function RatingsBoardTable({
  rows,
  loading,
  error,
  activeMarketUrl,
  onSelectMarket,
}: RatingsBoardTableProps) {
  return (
    <section id="board" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <h2 className="font-serif font-semibold text-2xl text-ink">Ratings board</h2>
        <p className="text-sm text-ink-soft">
          Active Polymarket markets sorted by 7-day volume. Select a row to open its full audit.
        </p>
      </div>

      <div className="bg-sheet border border-rule overflow-x-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-paper animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-fail">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-ink-soft">
            No live markets could be rated right now.
          </div>
        ) : (
          <table className="w-full border-collapse text-left min-w-[780px]">
            <thead>
              <tr className="border-b border-rule text-xs font-medium text-ink-soft">
                <th className="py-3 px-4 w-20">Rating</th>
                <th className="py-3 px-4">Market</th>
                <th className="py-3 px-4 text-right w-32">Traded, 7 days</th>
                <th className="py-3 px-4 w-52">Where the money came from</th>
                <th className="py-3 px-4 w-72">Main concern</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-sm">
              {rows.map((row) => {
                const bandColor = getLetterBandColor(row.letter);
                const isSelected = activeMarketUrl === row.url;

                return (
                  <tr
                    key={row.url}
                    onClick={() => onSelectMarket(row.url)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectMarket(row.url);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Rate ${row.question}, currently ${row.letter}`}
                    className={`cursor-pointer transition-colors hover:bg-paper/70 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-navy ${
                      isSelected ? 'bg-paper' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 align-middle">
                      <div className="flex items-center">
                        <span
                          className="font-serif font-semibold text-sm w-11 h-7 border flex items-center justify-center"
                          style={{
                            color: bandColor,
                            borderColor: bandColor,
                          }}
                        >
                          {row.letter}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 align-middle">
                      <div className="flex items-center gap-3 min-w-0">
                        <MarketThumbnail
                          src={row.image}
                          alt={row.question}
                          sizeClass="w-9 h-9"
                        />
                        <span className="font-medium text-ink leading-snug line-clamp-2">
                          {row.question}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 align-middle text-right">
                      <div className="flex justify-end">
                        <span className="font-medium text-ink tabular-nums">
                          {formatUsd(row.volumeUsd)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 align-middle">
                      <div className="flex items-center">
                        <CompositionBar composition={row.composition} compact />
                      </div>
                    </td>
                    <td className="py-3.5 px-4 align-middle">
                      <div className="flex items-center">
                        {row.concern ? (
                          <span className="text-ink-soft leading-snug">{row.concern}</span>
                        ) : (
                          <span className="font-medium text-pass">No failed checks</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
