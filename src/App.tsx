import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AuditProgress } from './components/AuditProgress.tsx';
import { AuditReportView } from './components/AuditReportView.tsx';
import { MethodBand } from './components/MethodBand.tsx';
import { RatingLadderCard } from './components/RatingLadderCard.tsx';
import { RatingsBoardTable } from './components/RatingsBoardTable.tsx';
import type { AnalystVerdict, AuditReport, BoardResponse, BoardRow } from './types.ts';

function pickSampleMarkets(rows: BoardRow[]): { lowest: BoardRow | null; top: BoardRow | null } {
  if (rows.length === 0) return { lowest: null, top: null };
  const byScoreAsc = [...rows].sort((a, b) => a.score - b.score || a.volumeUsd - b.volumeUsd);
  const lowest = byScoreAsc[0];
  const byScoreDesc = [...rows].sort((a, b) => b.score - a.score || b.volumeUsd - a.volumeUsd);
  const top = byScoreDesc.find((r) => r.url !== lowest.url) ?? null;
  return { lowest, top };
}

function truncateLabel(text: string, maxLen = 46): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

export default function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [report, setReport] = useState<AuditReport | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [verdict, setVerdict] = useState<AnalystVerdict | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  const reqCounterRef = useRef(0);
  const reportAnchorRef = useRef<HTMLDivElement | null>(null);

  const runAudit = useCallback(
    async (targetUrl: string, opts?: { updateHistory?: boolean; scrollToReport?: boolean }) => {
      const trimmed = targetUrl.trim();
      if (!trimmed) {
        setAuditError(
          'Paste a Polymarket market link, for example polymarket.com/event/… or /market/…'
        );
        return;
      }

      const reqId = ++reqCounterRef.current;
      setInputUrl(trimmed);
      setAuditError(null);
      setAuditLoading(true);
      setReport(null);
      setVerdict(null);
      setVerdictError(null);
      setVerdictLoading(false);

      if (opts?.updateHistory !== false) {
        const next = new URL(window.location.href);
        next.searchParams.set('m', trimmed);
        window.history.pushState({ m: trimmed }, '', next.toString());
      }

      if (opts?.scrollToReport) {
        window.setTimeout(() => {
          reportAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
      }

      try {
        const res = await fetch(`/api/audit?url=${encodeURIComponent(trimmed)}`);
        const data = (await res.json()) as AuditReport & { error?: string };
        if (reqCounterRef.current !== reqId) return;

        if (!res.ok || data.error) {
          setAuditError(
            data.error ||
              "That link didn't match a Polymarket market. Paste a link from polymarket.com/event/… or /market/…"
          );
          setAuditLoading(false);
          return;
        }

        setReport(data);
        setAuditLoading(false);

        const canonicalUrl = data.market.url;
        const nextUrl = new URL(window.location.href);
        if (nextUrl.searchParams.get('m') !== canonicalUrl) {
          nextUrl.searchParams.set('m', canonicalUrl);
          window.history.replaceState({ m: canonicalUrl }, '', nextUrl.toString());
        }

        // Load Gemini analyst note
        setVerdictLoading(true);
        try {
          const vRes = await fetch(`/api/verdict?url=${encodeURIComponent(canonicalUrl)}`);
          const vData = (await vRes.json()) as AnalystVerdict & { error?: string };
          if (reqCounterRef.current !== reqId) return;
          if (!vRes.ok || vData.error) {
            setVerdictError(vData.error || 'Could not generate the news analyst note right now.');
          } else {
            setVerdict(vData);
          }
        } catch {
          if (reqCounterRef.current !== reqId) return;
          setVerdictError('Could not generate the news analyst note right now.');
        } finally {
          if (reqCounterRef.current === reqId) {
            setVerdictLoading(false);
          }
        }
      } catch {
        if (reqCounterRef.current !== reqId) return;
        setAuditError('Could not reach the audit server. Please try again in a moment.');
        setAuditLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setBoardLoading(true);
      setBoardError(null);
      try {
        const res = await fetch('/api/board');
        const data = (await res.json()) as BoardResponse & { error?: string };
        if (!active) return;
        if (!res.ok || data.error) {
          setBoardError(data.error || 'Could not load the ratings board right now.');
        } else {
          setBoard(data);
        }
      } catch {
        if (!active) return;
        setBoardError('Could not load the ratings board right now.');
      } finally {
        if (active) setBoardLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const initialM = new URLSearchParams(window.location.search).get('m');
    if (initialM && initialM.trim()) {
      runAudit(initialM, { updateHistory: false });
    }

    const handlePopState = () => {
      const m = new URLSearchParams(window.location.search).get('m');
      if (m && m.trim()) {
        runAudit(m, { updateHistory: false });
      } else {
        reqCounterRef.current++;
        setReport(null);
        setAuditLoading(false);
        setAuditError(null);
        setVerdict(null);
        setVerdictLoading(false);
        setVerdictError(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [runAudit]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runAudit(inputUrl, { updateHistory: true, scrollToReport: true });
  };

  const { lowest, top } = useMemo(
    () => pickSampleMarkets(board?.rows ?? []),
    [board]
  );

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      {/* Top Bar */}
      <header className="bg-sheet border-b border-rule">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              reqCounterRef.current++;
              setInputUrl('');
              setReport(null);
              setAuditLoading(false);
              setAuditError(null);
              setVerdict(null);
              const clean = new URL(window.location.href);
              clean.searchParams.delete('m');
              window.history.pushState({}, '', clean.pathname);
            }}
            className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <span
              aria-hidden="true"
              className="w-7 h-7 bg-navy text-white font-serif font-semibold text-base flex items-center justify-center"
            >
              A
            </span>
            <span className="font-serif font-semibold text-lg text-ink tracking-tight">
              OddsAudit
            </span>
          </a>

          <nav className="flex items-center gap-6 text-sm font-medium text-ink-soft">
            <a
              href="#board"
              className="hover:text-ink hover:underline underline-offset-4 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              Ratings board
            </a>
            <a
              href="#method"
              className="hover:text-ink hover:underline underline-offset-4 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              Method
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <h1 className="font-serif font-semibold text-[36px] sm:text-[48px] lg:text-[60px] leading-[1.06] tracking-tight text-ink text-balance">
                Credit ratings for prediction markets
              </h1>
              <p className="mt-4 text-base text-ink-soft leading-relaxed max-w-[54ch]">
                Before you trade on a price, lend against it or quote it, check who made it.
                OddsAudit traces a week of trading to the wallets behind it and rates the market
                from AAA to CCC.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row">
                <label htmlFor="market-url-input" className="sr-only">
                  Paste a Polymarket market link
                </label>
                <input
                  id="market-url-input"
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Paste a Polymarket market link"
                  className="flex-1 min-w-0 min-h-[46px] bg-sheet border border-rule sm:border-r-0 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy"
                />
                <button
                  type="submit"
                  disabled={auditLoading}
                  className="min-h-[46px] bg-navy text-white px-6 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 hover:bg-[#1d3054] transition-colors cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                >
                  {auditLoading ? 'Rating…' : 'Rate market'}
                </button>
              </form>

              {auditError && (
                <p role="alert" className="mt-3 text-sm text-fail">
                  {auditError}
                </p>
              )}

              {(lowest || top) && (
                <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-xs text-ink-soft">
                  <span>Try</span>
                  {lowest && (
                    <button
                      type="button"
                      onClick={() =>
                        runAudit(lowest.url, { updateHistory: true, scrollToReport: true })
                      }
                      className="text-ink underline underline-offset-4 hover:text-ink-soft cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                    >
                      {truncateLabel(lowest.question)} ({lowest.letter})
                    </button>
                  )}
                  {lowest && top && <span aria-hidden="true">·</span>}
                  {top && (
                    <button
                      type="button"
                      onClick={() =>
                        runAudit(top.url, { updateHistory: true, scrollToReport: true })
                      }
                      className="text-ink underline underline-offset-4 hover:text-ink-soft cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                    >
                      {truncateLabel(top.question)} ({top.letter})
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 flex flex-col">
              <RatingLadderCard board={board} loading={boardLoading} error={boardError} />
            </div>
          </div>
        </section>

        {/* Progress or Report */}
        <div ref={reportAnchorRef} className="max-w-[1180px] mx-auto px-4 sm:px-6">
          {auditLoading && (
            <div className="pb-12">
              <AuditProgress />
            </div>
          )}

          {!auditLoading && report && (
            <div className="pb-12">
              <AuditReportView
                report={report}
                verdict={verdict}
                verdictLoading={verdictLoading}
                verdictError={verdictError}
              />
            </div>
          )}
        </div>

        {/* Ratings Board */}
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-16">
          <RatingsBoardTable
            rows={board?.rows ?? []}
            loading={boardLoading}
            error={boardError}
            activeMarketUrl={report?.market.url ?? null}
            onSelectMarket={(url) =>
              runAudit(url, { updateHistory: true, scrollToReport: true })
            }
          />
        </div>

        {/* Method Band */}
        <MethodBand />
      </main>

      {/* Footer */}
      <footer className="bg-sheet border-t border-rule">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 text-xs text-ink-soft">
          OddsAudit rates market integrity, not outcomes. A rating says whether a price was made by
          real trading, not whether it is right.
        </div>
      </footer>
    </div>
  );
}
