const METHOD_STEPS = [
  {
    num: '01',
    title: 'Read every trade',
    body: 'Collects up to 7 days of filled orders across both sides of every transaction on the market.',
  },
  {
    num: '02',
    title: 'Trace the wallets',
    body: 'Looks up lifetime trade counts, first-trade timestamps, and realized profits for the largest wallets.',
  },
  {
    num: '03',
    title: 'Run seven checks',
    body: 'Measures established volume, wallet concentration, wash loops, fresh clusters, book depth, and price swings.',
  },
  {
    num: '04',
    title: 'Check the news',
    body: 'Cross-references the past week of reporting to judge whether real news or isolated trading moved the odds.',
  },
  {
    num: '05',
    title: 'Issue the rating',
    body: 'Weights the checks and applies failure caps to assign a 0–100 score and an AAA to CCC credit rating.',
  },
];

export function MethodBand() {
  return (
    <section id="method" className="bg-navy text-white border-t border-rule">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h2 className="font-serif font-semibold text-2xl sm:text-3xl">How a rating is made</h2>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8">
          {METHOD_STEPS.map((step) => (
            <div key={step.num} className="border-t border-white/20 pt-4">
              <div className="text-xs text-[#a9b1bf] tabular-nums">{step.num}</div>
              <h3 className="mt-1.5 font-serif font-semibold text-base text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-[#d9dee5] leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
