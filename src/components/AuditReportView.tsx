import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { AnalystVerdict, AuditCheck, AuditReport, CheckStatus } from '../types.ts';
import {
  formatInteger,
  formatPercent,
  formatUsd,
  getLetterBandColor,
} from '../utils/format.ts';
import { CompositionBar } from './CompositionBar.tsx';
import { MarketThumbnail } from './MarketThumbnail.tsx';
import { NetworkGraph } from './NetworkGraph.tsx';
import { PriceChart } from './PriceChart.tsx';

interface AuditReportViewProps {
  report: AuditReport;
  verdict: AnalystVerdict | null;
  verdictLoading: boolean;
  verdictError: string | null;
}

function getStatusMeta(status: CheckStatus): { word: string; color: string } {
  switch (status) {
    case 'pass':
      return { word: 'Pass', color: '#1f7a4d' };
    case 'warn':
      return { word: 'Watch', color: '#b7700b' };
    case 'fail':
      return { word: 'Fail', color: '#b42318' };
    case 'info':
      return { word: 'Note', color: '#6b7487' };
  }
}

function getRiskMeta(risk: AnalystVerdict['risk']): { label: string; color: string } {
  switch (risk) {
    case 'low':
      return { label: 'Low risk', color: '#1f7a4d' };
    case 'medium':
      return { label: 'Medium risk', color: '#b7700b' };
    case 'high':
      return { label: 'High risk', color: '#b42318' };
  }
}

function CheckRow({ check }: { check: AuditCheck }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getStatusMeta(check.status);

  return (
    <div className="border-b border-rule last:border-b-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left py-4 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-paper/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 min-w-0 flex-1">
          <div className="flex items-center gap-2 w-20 shrink-0">
            <span
              aria-hidden="true"
              className="w-2 h-2 shrink-0"
              style={{ backgroundColor: meta.color }}
            />
            <span className="text-sm font-semibold" style={{ color: meta.color }}>
              {meta.word}
            </span>
          </div>
          <div className="sm:w-52 shrink-0 text-sm font-medium text-ink">
            {check.title}
          </div>
          <div className="text-sm text-ink-soft min-w-0 flex-1 leading-snug">
            {check.headline}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-0 sm:pl-4">
          <span className="text-sm font-medium text-ink tabular-nums">
            {check.score !== null ? `${check.score}/100` : check.weight === 0 ? 'Bonus' : '—'}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-ink-soft" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-ink-soft" aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="pb-5 pt-2 px-1 sm:pl-[100px] space-y-4">
          {check.metrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-rule pt-4">
              {check.metrics.map((m) => (
                <div key={m.label}>
                  <div className="text-xs text-ink-soft">{m.label}</div>
                  <div className="mt-0.5 text-sm font-semibold text-ink tabular-nums">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-ink-soft leading-relaxed max-w-[68ch]">{check.method}</p>
        </div>
      )}
    </div>
  );
}

export function AuditReportView({
  report,
  verdict,
  verdictLoading,
  verdictError,
}: AuditReportViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const bandColor = getLetterBandColor(report.letter);

  const failCount = report.checks.filter((c) => c.status === 'fail').length;
  const warnCount = report.checks.filter((c) => c.status === 'warn').length;
  const passCount = report.checks.filter((c) => c.status === 'pass').length;

  return (
    <article
      id="report"
      className="bg-sheet border border-rule divide-y divide-rule"
      aria-label="Market credit rating report"
    >
      {/* Report Header */}
      <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-8 md:items-center">
        <div className="flex md:flex-col items-baseline md:items-start gap-4 md:gap-1 md:w-44 shrink-0">
          <motion.div
            key={`${report.market.conditionId}-${report.letter}`}
            initial={prefersReducedMotion ? false : { scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="font-serif font-semibold text-[72px] sm:text-[96px] leading-none tracking-tight"
            style={{ color: bandColor }}
          >
            {report.letter}
          </motion.div>
          <div className="md:mt-2">
            <div className="text-base font-semibold text-ink">{report.grade}</div>
            <div className="text-sm text-ink-soft tabular-nums">{report.score} of 100</div>
          </div>
        </div>

        <div className="flex-1 min-w-0 md:border-l md:border-rule md:pl-8">
          <div className="flex items-start gap-4">
            <MarketThumbnail
              src={report.market.image}
              alt={report.market.question}
              sizeClass="w-12 h-12"
            />
            <div className="min-w-0 flex-1">
              <a
                href={report.market.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-serif font-semibold text-xl sm:text-2xl leading-snug text-ink hover:underline inline-flex items-baseline gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                <span>{report.market.question}</span>
                <ExternalLink className="w-4 h-4 text-ink-faint shrink-0 inline" aria-hidden="true" />
              </a>
              <p className="mt-1.5 text-sm text-ink-soft tabular-nums">
                {failCount} {failCount === 1 ? 'check' : 'checks'} failed, {warnCount} to watch,{' '}
                {passCount} passed
              </p>
            </div>
          </div>

          <dl className="mt-6 pt-5 border-t border-rule grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div>
              <dt className="text-xs text-ink-soft">Traded, 7 days</dt>
              <dd className="mt-1 text-base font-semibold text-ink tabular-nums">
                {formatUsd(report.stats.volumeUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Trade records</dt>
              <dd className="mt-1 text-base font-semibold text-ink tabular-nums">
                {formatInteger(report.stats.fills)}
                {report.stats.truncated && (
                  <span className="block text-xs font-normal text-ink-faint">
                    Last {report.stats.windowHours}h traced
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Wallets</dt>
              <dd className="mt-1 text-base font-semibold text-ink tabular-nums">
                {formatInteger(report.stats.wallets)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Money traced</dt>
              <dd className="mt-1 text-base font-semibold text-ink tabular-nums">
                {formatPercent(report.stats.coverage)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Where the money came from */}
      <section className="p-6 sm:p-8">
        <h2 className="font-serif font-semibold text-lg text-ink">Where the money came from</h2>
        <div className="mt-4">
          <CompositionBar composition={report.composition} />
        </div>
      </section>

      {/* Two columns: Network Graph & Price Chart + Analyst Note */}
      <section className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="font-serif font-semibold text-lg text-ink">Who traded with whom</h2>
          <div className="mt-4">
            <NetworkGraph nodes={report.nodes} links={report.links} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-serif font-semibold text-lg text-ink">Price, last 7 days</h2>
            <div className="mt-4">
              <PriceChart prices={report.prices} biggestMove={report.biggestMove} />
            </div>
          </div>

          <div className="border-t border-rule pt-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-serif font-semibold text-lg text-ink">Analyst note</h3>
              {verdict && (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold shrink-0"
                  style={{ color: getRiskMeta(verdict.risk).color }}
                >
                  <span
                    aria-hidden="true"
                    className="w-2 h-2"
                    style={{ backgroundColor: getRiskMeta(verdict.risk).color }}
                  />
                  {getRiskMeta(verdict.risk).label}
                </span>
              )}
            </div>

            {verdictLoading ? (
              <p className="mt-2.5 text-sm text-ink-soft">
                Checking this week&apos;s news against the trading…
              </p>
            ) : verdictError ? (
              <p className="mt-2.5 text-sm text-fail">{verdictError}</p>
            ) : verdict ? (
              <div className="mt-3 space-y-2.5">
                <p className="font-serif font-semibold text-base sm:text-[17px] leading-snug text-ink">
                  {verdict.summary}
                </p>
                <p className="text-sm text-ink-soft leading-relaxed">{verdict.news}</p>
                {verdict.sources.length > 0 && (
                  <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                    {verdict.sources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-soft underline hover:text-ink truncate max-w-[240px]"
                      >
                        {src.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* The seven checks */}
      <section className="p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif font-semibold text-lg text-ink">The seven checks</h2>
          <span className="text-xs text-ink-faint">Select any row to inspect metrics</span>
        </div>
        <div className="mt-4 border-t border-rule">
          {report.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      </section>
    </article>
  );
}
