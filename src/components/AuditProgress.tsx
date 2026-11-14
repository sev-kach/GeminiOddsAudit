import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const STEPS = [
  'Finding the market',
  'Reading 7 days of trades, both sides',
  'Tracing the history of every major wallet',
  'Reading the order book and price history',
  'Running the checks',
];

export function AuditProgress() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 700);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      aria-live="polite"
      aria-label="Rating progress"
      className="bg-sheet border border-rule p-6 sm:p-8"
    >
      <h2 className="font-serif font-semibold text-xl text-ink">Building market audit</h2>
      <ol className="mt-5 divide-y divide-rule border-t border-b border-rule">
        {STEPS.map((label, idx) => {
          const done = idx < activeIndex;
          const active = idx === activeIndex;
          return (
            <li
              key={label}
              className="py-3.5 flex items-center justify-between gap-4 text-sm"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className={`tabular-nums w-6 text-xs font-medium shrink-0 ${
                    done ? 'text-pass' : active ? 'text-ink' : 'text-ink-faint'
                  }`}
                >
                  0{idx + 1}
                </span>
                <span
                  className={
                    done
                      ? 'text-ink'
                      : active
                        ? 'text-ink font-medium'
                        : 'text-ink-faint'
                  }
                >
                  {label}
                </span>
              </div>
              <span className="shrink-0 text-xs">
                {done ? (
                  <span className="inline-flex items-center gap-1 text-pass font-medium">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Done
                  </span>
                ) : active ? (
                  <span className="text-ink-soft font-medium">In progress</span>
                ) : (
                  <span className="text-ink-faint">Queued</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
