import { TtlPromiseCache } from './cache.ts';
import { getAuditParams } from './config.ts';
import {
  fetchOrderBook,
  fetchPriceHistory,
  fetchSevenDayTrades,
  fetchWalletHistories,
  parsePolymarketInput,
  resolvePolymarketMarket,
  type OrderBook,
  type TradeRow,
  type WalletHistory,
} from './polymarket.ts';
import type {
  AuditCheck,
  AuditMarket,
  AuditReport,
  BiggestMove,
  CompositionData,
  GradeLabel,
  GraphLink,
  GraphNode,
  LetterRating,
  PricePoint,
  WalletClass,
} from '../src/types.ts';

const AUDIT_TTL_MS = 10 * 60 * 1000;
const auditCache = new TtlPromiseCache<AuditReport>(AUDIT_TTL_MS);

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmtUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 10_000) return `$${Math.round(val).toLocaleString('en-US')}`;
  if (val >= 100) return `$${Math.round(val).toLocaleString('en-US')}`;
  return `$${val.toFixed(0)}`;
}

function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%';
  const pct = ratio * 100;
  if (pct < 1) return `${pct.toFixed(1)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

function getLetterRating(score: number): LetterRating {
  if (score >= 90) return 'AAA';
  if (score >= 82) return 'AA';
  if (score >= 75) return 'A';
  if (score >= 65) return 'BBB';
  if (score >= 50) return 'BB';
  if (score >= 35) return 'B';
  return 'CCC';
}

function getGradeLabel(score: number): GradeLabel {
  if (score >= 75) return 'Trustworthy';
  if (score >= 50) return 'Caution';
  return 'Unreliable';
}

export async function runMarketAudit(
  marketOrInput: string | AuditMarket,
  walletLimit = 200
): Promise<AuditReport> {
  const params = getAuditParams();
  const market =
    typeof marketOrInput === 'string' ? await resolvePolymarketMarket(marketOrInput) : marketOrInput;

  const nowSec = Math.floor(Date.now() / 1000);

  const [{ rows, truncated }, book, prices] = await Promise.all([
    fetchSevenDayTrades(market.conditionId, nowSec),
    fetchOrderBook(market.yesToken),
    fetchPriceHistory(market.yesToken),
  ]);

  return computeAuditFromData({
    market,
    rows,
    truncated,
    book,
    prices,
    nowSec,
    walletLimit,
    params,
  });
}

export function getCachedAudit(input: string): Promise<AuditReport> {
  let key = input.trim().toLowerCase();
  try {
    const parsed = parsePolymarketInput(input);
    if (parsed.marketSlug) key = `m:${parsed.marketSlug.toLowerCase()}`;
    else if (parsed.eventSlug) key = `e:${parsed.eventSlug.toLowerCase()}`;
  } catch {
    // Let runMarketAudit throw UserInputError without caching
    return runMarketAudit(input, 200);
  }
  return auditCache.getOrSet(key, () => runMarketAudit(input, 200));
}

interface ComputeInput {
  market: AuditMarket;
  rows: TradeRow[];
  truncated: boolean;
  book: OrderBook | null;
  prices: PricePoint[];
  nowSec: number;
  walletLimit: number;
  params: ReturnType<typeof getAuditParams>;
}

async function computeAuditFromData(input: ComputeInput): Promise<AuditReport> {
  const { market, rows, truncated, book, prices, nowSec, walletLimit, params } = input;

  // Aggregate per-wallet USD and total row USD
  const walletUsd = new Map<string, number>();
  const walletGrossShares = new Map<string, number>();
  const walletNetYesShares = new Map<string, number>();
  const txGroups = new Map<string, TradeRow[]>();

  let totalRowUsd = 0;
  let oldestTs = nowSec;

  for (const row of rows) {
    const usd = row.size * row.price;
    totalRowUsd += usd;
    if (row.timestamp < oldestTs) oldestTs = row.timestamp;

    walletUsd.set(row.proxy_wallet, (walletUsd.get(row.proxy_wallet) ?? 0) + usd);
    walletGrossShares.set(
      row.proxy_wallet,
      (walletGrossShares.get(row.proxy_wallet) ?? 0) + row.size
    );

    const yesDelta =
      row.outcome_index === 0
        ? row.side === 'BUY'
          ? row.size
          : -row.size
        : row.side === 'BUY'
          ? -row.size
          : row.size;
    walletNetYesShares.set(
      row.proxy_wallet,
      (walletNetYesShares.get(row.proxy_wallet) ?? 0) + yesDelta
    );

    let list = txGroups.get(row.transaction_hash);
    if (!list) {
      list = [];
      txGroups.set(row.transaction_hash, list);
    }
    list.push(row);
  }

  const volumeUsd = totalRowUsd / 2;
  const sortedWallets = Array.from(walletUsd.entries()).sort((a, b) => b[1] - a[1]);
  const topLookupTargets = sortedWallets.slice(0, walletLimit).map(([w]) => w);

  const walletHistoryMap: Map<string, WalletHistory> = await fetchWalletHistories(
    topLookupTargets,
    25
  );

  let lookedUpUsd = 0;
  for (const w of topLookupTargets) {
    lookedUpUsd += walletUsd.get(w) ?? 0;
  }
  const coverage = totalRowUsd > 0 ? lookedUpUsd / totalRowUsd : 0;

  const isEstablished = (w: string): boolean => {
    const h = walletHistoryMap.get(w);
    if (!h || h.unknown) return false;
    if (h.trades === null || h.firstTrade === null) return false;
    return h.trades >= params.estMinTrades && h.firstTrade <= nowSec - params.estMinAgeDays * 86400;
  };

  const isFresh = (w: string): boolean => {
    const h = walletHistoryMap.get(w);
    if (!h) return false; // only looked-up wallets are evaluated for fresh
    if (h.unknown || h.firstTrade === null) return true;
    return h.firstTrade >= nowSec - params.freshDays * 86400;
  };

  const share = (w: string): number => (totalRowUsd > 0 ? (walletUsd.get(w) ?? 0) / totalRowUsd : 0);

  // =========================================================================
  // Check 1: Established-trader volume (weight 30)
  // =========================================================================
  let estUsd = 0;
  let estCappedRowUsd = 0;
  let estWalletCount = 0;
  for (const w of topLookupTargets) {
    if (isEstablished(w)) {
      const wUsd = walletUsd.get(w) ?? 0;
      estUsd += wUsd;
      estCappedRowUsd += Math.min(wUsd, 2 * params.estWalletCapUsd);
      estWalletCount++;
    }
  }
  const cappedEstUsd = estCappedRowUsd / 2;
  const estShare = totalRowUsd > 0 ? estUsd / totalRowUsd : 0;
  const check1Passes = cappedEstUsd >= params.estMinUsd;
  const check1Score =
    rows.length === 0
      ? 0
      : 60 * Math.min(1, params.estMinUsd > 0 ? cappedEstUsd / params.estMinUsd : 1) +
        40 * Math.min(1, estShare / 0.6);
  const check1Status =
    check1Passes && estShare >= 0.3 ? 'pass' : check1Passes ? 'warn' : 'fail';

  const check1Headline =
    check1Status === 'fail'
      ? `Only ${fmtUsd(cappedEstUsd)} of trading comes from wallets with real history`
      : check1Status === 'warn'
        ? `${fmtUsd(cappedEstUsd)} in capped volume from established wallets (${fmtPct(estShare)} share)`
        : `${fmtPct(estShare)} of trading comes from wallets with established history`;

  const check1: AuditCheck = {
    id: 'established',
    title: 'Established-trader volume',
    status: check1Status,
    score: Math.round(check1Score),
    weight: 30,
    headline: check1Headline,
    metrics: [
      { label: 'Established share', value: fmtPct(estShare) },
      { label: 'Capped volume', value: fmtUsd(cappedEstUsd) },
      { label: 'Established wallets', value: String(estWalletCount) },
    ],
    method:
      'Measures how much trading comes from wallets with sustained history and account age, capping single-wallet contributions so one whale cannot carry the market.',
  };

  // =========================================================================
  // Check 2: Wallet concentration (weight 10)
  // =========================================================================
  const top3 = sortedWallets.slice(0, 3);
  const top3Share = top3.reduce((acc, [w]) => acc + share(w), 0);
  const check2Score = rows.length === 0 ? 0 : 100 * (1 - clamp01((top3Share - 0.2) / 0.6));
  const check2Status = top3Share < 0.35 ? 'pass' : top3Share < 0.6 ? 'warn' : 'fail';
  const check2Headline =
    check2Status === 'pass'
      ? `Top 3 wallets account for ${fmtPct(top3Share)} of trading`
      : check2Status === 'warn'
        ? `Top 3 wallets concentrate ${fmtPct(top3Share)} of trading`
        : `Heavy concentration: top 3 wallets make up ${fmtPct(top3Share)} of trading`;

  const check2: AuditCheck = {
    id: 'concentration',
    title: 'Wallet concentration',
    status: check2Status,
    score: Math.round(check2Score),
    weight: 10,
    headline: check2Headline,
    metrics:
      top3.length > 0
        ? top3.map(([w, usd]) => ({
            label: `Wallet …${w.slice(-4)}`,
            value: `${fmtPct(share(w))} (${fmtUsd(usd)})`,
          }))
        : [{ label: 'Top wallets', value: 'None' }],
    method:
      'Checks whether a handful of wallets dominate trading volume. Broad participation makes prices harder for a few actors to steer.',
  };

  // =========================================================================
  // Check 3: Wash-trade loops (weight 25)
  // =========================================================================
  const selfTraders = new Set<string>();
  const counterparties = new Map<string, Set<string>>();
  const pairStats = new Map<string, { a: string; b: string; usd: number; n: number }>();

  for (const txRows of txGroups.values()) {
    // Track per-wallet direction & tx USD inside this transaction
    const walletDirs = new Map<string, { pos: boolean; neg: boolean }>();
    const txWalletUsd = new Map<string, number>();

    for (const r of txRows) {
      const dir = (r.outcome_index === 0) === (r.side === 'BUY');
      let d = walletDirs.get(r.proxy_wallet);
      if (!d) {
        d = { pos: false, neg: false };
        walletDirs.set(r.proxy_wallet, d);
      }
      if (dir) d.pos = true;
      else d.neg = true;

      txWalletUsd.set(r.proxy_wallet, (txWalletUsd.get(r.proxy_wallet) ?? 0) + r.size * r.price);
    }

    for (const [w, d] of walletDirs.entries()) {
      if (d.pos && d.neg) {
        selfTraders.add(w);
      }
    }

    const txWallets = Array.from(txWalletUsd.keys()).sort();
    for (let i = 0; i < txWallets.length; i++) {
      const a = txWallets[i];
      let cpA = counterparties.get(a);
      if (!cpA) {
        cpA = new Set<string>();
        counterparties.set(a, cpA);
      }
      for (let j = i + 1; j < txWallets.length; j++) {
        const b = txWallets[j];
        cpA.add(b);
        let cpB = counterparties.get(b);
        if (!cpB) {
          cpB = new Set<string>();
          counterparties.set(b, cpB);
        }
        cpB.add(a);

        const pairKey = `${a}|${b}`;
        const minUsd = Math.min(txWalletUsd.get(a) ?? 0, txWalletUsd.get(b) ?? 0);
        let pStat = pairStats.get(pairKey);
        if (!pStat) {
          pStat = { a, b, usd: 0, n: 0 };
          pairStats.set(pairKey, pStat);
        }
        pStat.usd += minUsd;
        pStat.n += 1;
      }
    }
  }

  const closedPairWallets = new Set<string>();
  let closedPairCount = 0;
  for (const pStat of pairStats.values()) {
    const usdA = walletUsd.get(pStat.a) ?? 0;
    const usdB = walletUsd.get(pStat.b) ?? 0;
    if (pStat.n >= 3 && usdA > 0 && usdB > 0 && pStat.usd >= 0.5 * usdA && pStat.usd >= 0.5 * usdB) {
      closedPairCount++;
      closedPairWallets.add(pStat.a);
      closedPairWallets.add(pStat.b);
    }
  }

  const roundTrippers = new Set<string>();
  for (const [w, usd] of walletUsd.entries()) {
    if (usd < 200) continue;
    const gross = walletGrossShares.get(w) ?? 0;
    const net = Math.abs(walletNetYesShares.get(w) ?? 0);
    const cpCount = counterparties.get(w)?.size ?? 0;
    if (gross > 0 && net < 0.1 * gross && cpCount <= 3) {
      roundTrippers.add(w);
    }
  }

  const washWallets = new Set<string>([...selfTraders, ...closedPairWallets, ...roundTrippers]);
  let washShare = 0;
  for (const w of washWallets) {
    washShare += share(w);
  }

  const check3Score = rows.length === 0 ? 0 : 100 * (1 - clamp01(washShare / 0.4));
  const check3Status = washShare < 0.1 ? 'pass' : washShare < 0.25 ? 'warn' : 'fail';
  const check3Headline =
    washWallets.size === 0
      ? 'No circular or self-trading loops detected'
      : check3Status === 'pass'
        ? `Minimal wash-like activity detected (${fmtPct(washShare)} of volume)`
        : `${fmtPct(washShare)} of volume traced to ${washWallets.size} wallet${
            washWallets.size === 1 ? '' : 's'
          } in wash-like loops`;

  const check3: AuditCheck = {
    id: 'wash',
    title: 'Wash-trade loops',
    status: check3Status,
    score: Math.round(check3Score),
    weight: 25,
    headline: check3Headline,
    metrics: [
      { label: 'Wash-like share', value: fmtPct(washShare) },
      { label: 'Self-traders', value: String(selfTraders.size) },
      { label: 'Closed pairs', value: String(closedPairCount) },
      { label: 'Round-trippers', value: String(roundTrippers.size) },
    ],
    method:
      'Detects wallets trading against themselves in the same transaction, closed pairs repeating trades with one another, and round-trip wallets netting near zero with at most three counterparties.',
  };

  // =========================================================================
  // Check 4: Fresh-wallet cluster (weight 15)
  // =========================================================================
  let freshUsd = 0;
  let freshCount = 0;
  const datedFresh: Array<{ w: string; firstTrade: number; usd: number }> = [];

  for (const w of topLookupTargets) {
    if (isFresh(w)) {
      const usd = walletUsd.get(w) ?? 0;
      freshUsd += usd;
      freshCount++;
      const h = walletHistoryMap.get(w);
      if (h && !h.unknown && h.firstTrade !== null) {
        datedFresh.push({ w, firstTrade: h.firstTrade, usd });
      }
    }
  }

  const freshShare = lookedUpUsd > 0 ? freshUsd / lookedUpUsd : 0;

  datedFresh.sort((a, b) => a.firstTrade - b.firstTrade);
  let bestClusterCount = 0;
  let bestClusterUsd = 0;
  let left = 0;
  let windowUsd = 0;
  for (let right = 0; right < datedFresh.length; right++) {
    windowUsd += datedFresh[right].usd;
    while (datedFresh[right].firstTrade - datedFresh[left].firstTrade > 48 * 3600) {
      windowUsd -= datedFresh[left].usd;
      left++;
    }
    const count = right - left + 1;
    if (count > bestClusterCount || (count === bestClusterCount && windowUsd > bestClusterUsd)) {
      bestClusterCount = count;
      bestClusterUsd = windowUsd;
    }
  }
  const clusterShare = totalRowUsd > 0 ? bestClusterUsd / totalRowUsd : 0;

  const check4Status =
    freshShare > 0.5 || (bestClusterCount >= 5 && clusterShare > 0.2)
      ? 'fail'
      : freshShare > 0.25 || (bestClusterCount >= 3 && clusterShare > 0.1)
        ? 'warn'
        : 'pass';

  const check4Score =
    rows.length === 0
      ? 0
      : 100 * (1 - clamp01(Math.max(freshShare / 0.6, clusterShare / 0.3)));

  const check4Headline =
    clusterShare >= 0.05
      ? `${fmtPct(freshShare)} from brand-new wallets, including ${bestClusterCount} wallets activated within 48 hours (${fmtPct(clusterShare)} of volume)`
      : `${fmtPct(freshShare)} of volume comes from wallets that are brand new`;

  const check4: AuditCheck = {
    id: 'fresh',
    title: 'Fresh-wallet cluster',
    status: check4Status,
    score: Math.round(check4Score),
    weight: 15,
    headline: check4Headline,
    metrics: [
      { label: 'Fresh-wallet share', value: fmtPct(freshShare) },
      { label: 'Fresh wallets', value: String(freshCount) },
      { label: 'Largest 48h cluster', value: `${bestClusterCount} wallets (${fmtPct(clusterShare)})` },
    ],
    method:
      'Flags newly created or unknown wallets and checks whether several of them placed their first trades inside the same 48-hour window.',
  };

  // =========================================================================
  // Check 5: Order-book depth (weight 10)
  // =========================================================================
  let check5: AuditCheck;
  if (market.closed || !book || book.bids.length === 0 || book.asks.length === 0) {
    check5 = {
      id: 'book',
      title: 'Order-book depth',
      status: 'info',
      score: null,
      weight: 10,
      headline: market.closed
        ? 'Market is closed; order book is inactive'
        : 'Order book has an empty side or is unavailable',
      metrics: [
        { label: 'Best bid', value: book?.bids[0] ? `${(book.bids[0].price * 100).toFixed(1)}¢` : '—' },
        { label: 'Best ask', value: book?.asks[0] ? `${(book.asks[0].price * 100).toFixed(1)}¢` : '—' },
      ],
      method:
        'Measures the bid-ask spread and resting dollar liquidity within 5¢ of the midpoint on the thinner side of the order book.',
    };
  } else {
    const bestBid = book.bids[0].price;
    const bestAsk = book.asks[0].price;
    const mid = (bestBid + bestAsk) / 2;
    const spread = Math.max(0, bestAsk - bestBid);

    let bidDepth = 0;
    for (const lvl of book.bids) {
      if (lvl.price >= mid - 0.05) bidDepth += lvl.price * lvl.size;
    }
    let askDepth = 0;
    for (const lvl of book.asks) {
      if (lvl.price <= mid + 0.05) askDepth += lvl.price * lvl.size;
    }
    const thin = Math.min(bidDepth, askDepth);
    const check5Score =
      50 * clamp01(1 - (spread - 0.01) / 0.09) +
      50 * clamp01(Math.log10(Math.max(thin, 1) / 100) / 2);

    const check5Status =
      spread <= 0.03 && thin >= 2000 ? 'pass' : spread > 0.1 || thin < 200 ? 'fail' : 'warn';

    const spreadCents = (spread * 100).toFixed(1);
    const check5Headline =
      check5Status === 'pass'
        ? `Tight ${spreadCents}¢ spread with ${fmtUsd(thin)} resting depth near midpoint`
        : check5Status === 'warn'
          ? `${spreadCents}¢ spread with ${fmtUsd(thin)} depth on the thinner side`
          : `Shallow book: ${spreadCents}¢ spread and only ${fmtUsd(thin)} on the thinner side`;

    check5 = {
      id: 'book',
      title: 'Order-book depth',
      status: check5Status,
      score: Math.round(check5Score),
      weight: 10,
      headline: check5Headline,
      metrics: [
        { label: 'Spread', value: `${spreadCents}¢` },
        { label: 'Bid depth (±5¢)', value: fmtUsd(bidDepth) },
        { label: 'Ask depth (±5¢)', value: fmtUsd(askDepth) },
        { label: 'Thinner side', value: fmtUsd(thin) },
      ],
      method:
        'Measures the bid-ask spread and resting dollar liquidity within 5¢ of the midpoint on the thinner side of the order book.',
    };
  }

  // =========================================================================
  // Check 6: Price move vs real volume (weight 10)
  // =========================================================================
  let biggestMove: BiggestMove | null = null;
  if (prices.length >= 2) {
    let bestAbs = -1;
    let bestFrom = prices[0];
    let bestTo = prices[1];
    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        if (prices[j].t - prices[i].t > 86400) break;
        const diff = Math.abs(prices[j].p - prices[i].p);
        if (diff > bestAbs) {
          bestAbs = diff;
          bestFrom = prices[i];
          bestTo = prices[j];
        }
      }
    }
    if (bestAbs >= 0) {
      biggestMove = {
        from: bestFrom.p,
        to: bestTo.p,
        startAt: bestFrom.t,
        at: bestTo.t,
        deltaPts: Math.round((bestTo.p - bestFrom.p) * 1000) / 10,
      };
    }
  }

  let check6: AuditCheck;
  if (!biggestMove) {
    check6 = {
      id: 'pricemove',
      title: 'Price move vs real volume',
      status: 'info',
      score: null,
      weight: 10,
      headline: 'Price history unavailable for the past 7 days',
      metrics: [],
      method:
        'Finds the sharpest 24-hour price swing and checks how much of the trading during that window came from established wallets.',
    };
  } else {
    const absPts = Math.abs(biggestMove.deltaPts);
    if (absPts < 10) {
      check6 = {
        id: 'pricemove',
        title: 'Price move vs real volume',
        status: 'pass',
        score: 100,
        weight: 10,
        headline: `Largest 24-hour move was ${absPts.toFixed(1)} points, within normal range`,
        metrics: [
          {
            label: 'Biggest 24h move',
            value: `${(biggestMove.from * 100).toFixed(0)}¢ → ${(biggestMove.to * 100).toFixed(0)}¢`,
          },
        ],
        method:
          'Finds the sharpest 24-hour price swing and checks how much of the trading during that window came from established wallets.',
      };
    } else {
      const spanRows = rows.filter(
        (r) => r.timestamp >= biggestMove.startAt && r.timestamp <= biggestMove.at
      );
      const spanOlderThanReads =
        rows.length === 0 ||
        biggestMove.at < oldestTs ||
        (truncated && biggestMove.startAt < oldestTs && spanRows.length === 0);

      if (spanOlderThanReads) {
        check6 = {
          id: 'pricemove',
          title: 'Price move vs real volume',
          status: 'info',
          score: null,
          weight: 10,
          headline: `A ${absPts.toFixed(1)}-point swing occurred outside the traced fill window`,
          metrics: [
            {
              label: 'Biggest 24h move',
              value: `${(biggestMove.from * 100).toFixed(0)}¢ → ${(biggestMove.to * 100).toFixed(0)}¢`,
            },
          ],
          method:
            'Finds the sharpest 24-hour price swing and checks how much of the trading during that window came from established wallets.',
        };
      } else {
        let spanTotalUsd = 0;
        let spanEstUsd = 0;
        for (const r of spanRows) {
          const usd = r.size * r.price;
          spanTotalUsd += usd;
          if (isEstablished(r.proxy_wallet)) {
            spanEstUsd += usd;
          }
        }
        const spanEstShare = spanTotalUsd > 0 ? spanEstUsd / spanTotalUsd : 0;
        const check6Score = 100 * clamp01(spanEstShare / 0.5);
        const check6Status =
          spanEstShare < 0.2 ? 'fail' : spanEstShare < 0.4 ? 'warn' : 'pass';
        const check6Headline =
          check6Status === 'pass'
            ? `${fmtPct(spanEstShare)} of volume during the ${absPts.toFixed(1)}-point swing came from established wallets`
            : check6Status === 'warn'
              ? `Only ${fmtPct(spanEstShare)} of volume during the ${absPts.toFixed(1)}-point swing came from established wallets`
              : `${absPts.toFixed(1)}-point swing driven mostly by unestablished wallets (${fmtPct(spanEstShare)} established)`;

        check6 = {
          id: 'pricemove',
          title: 'Price move vs real volume',
          status: check6Status,
          score: Math.round(check6Score),
          weight: 10,
          headline: check6Headline,
          metrics: [
            {
              label: 'Biggest 24h move',
              value: `${(biggestMove.from * 100).toFixed(0)}¢ → ${(biggestMove.to * 100).toFixed(0)}¢`,
            },
            { label: 'Established share in move', value: fmtPct(spanEstShare) },
            { label: 'Move volume', value: fmtUsd(spanTotalUsd / 2) },
          ],
          method:
            'Finds the sharpest 24-hour price swing and checks how much of the trading during that window came from established wallets.',
        };
      }
    }
  }

  // =========================================================================
  // Check 7: Proven traders present (weight 0, score null, bonus only)
  // =========================================================================
  let smartUsd = 0;
  let smartCount = 0;
  for (const w of topLookupTargets) {
    const h = walletHistoryMap.get(w);
    if (h && !h.unknown && h.pnl !== null && h.pnl >= params.smartPnlUsd) {
      smartUsd += walletUsd.get(w) ?? 0;
      smartCount++;
    }
  }
  const smartShare = totalRowUsd > 0 ? smartUsd / totalRowUsd : 0;
  const bonus = rows.length === 0 ? 0 : Math.min(5, smartShare * 20);
  const check7Status = smartShare >= 0.1 ? 'pass' : 'info';
  const check7Headline =
    smartShare >= 0.1
      ? `${fmtPct(smartShare)} of trading comes from wallets with strong realized profits`
      : `Limited presence from proven profitable wallets (${fmtPct(smartShare)} of volume)`;

  const check7: AuditCheck = {
    id: 'smart',
    title: 'Proven traders present',
    status: check7Status,
    score: null,
    weight: 0,
    headline: check7Headline,
    metrics: [
      { label: 'Proven-trader share', value: fmtPct(smartShare) },
      { label: 'Profitable wallets', value: String(smartCount) },
      { label: 'Score bonus', value: `+${bonus.toFixed(1)} pts` },
    ],
    method:
      'Bonus check that awards up to 5 extra points when historically profitable traders are active in the market; never penalizes the rating.',
  };

  const checks: AuditCheck[] = [check1, check2, check3, check4, check5, check6, check7];

  // =========================================================================
  // Total Score, Grade, Letter
  // =========================================================================
  let totalScore = 0;
  if (rows.length > 0) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const c of checks) {
      if (c.score !== null && c.weight > 0) {
        weightedSum += c.score * c.weight;
        totalWeight += c.weight;
      }
    }
    const base = totalWeight > 0 ? weightedSum / totalWeight : 0;
    let combined = base + bonus;

    if (check1.status === 'fail' || check3.status === 'fail') {
      combined = Math.min(combined, 55);
    } else if (checks.some((c) => c.status === 'fail')) {
      combined = Math.min(combined, 74);
    }

    totalScore = Math.round(Math.max(0, Math.min(100, combined)));
  }

  const grade = getGradeLabel(totalScore);
  const letter = getLetterRating(totalScore);

  // =========================================================================
  // Visuals: Composition, Graph Nodes & Links
  // =========================================================================
  const lookedUpSet = new Set(topLookupTargets);
  const classifyWallet = (w: string): WalletClass => {
    if (washWallets.has(w)) return 'wash';
    if (lookedUpSet.has(w) && isFresh(w)) return 'fresh';
    if (lookedUpSet.has(w) && isEstablished(w)) return 'established';
    return 'other';
  };

  let compEst = 0;
  let compOther = 0;
  let compFresh = 0;
  let compWash = 0;
  let freshInWash = 0;

  for (const [w, usd] of walletUsd.entries()) {
    const marketUsd = usd / 2;
    const cls = classifyWallet(w);
    if (cls === 'wash') {
      compWash += marketUsd;
      if (lookedUpSet.has(w) && isFresh(w)) {
        freshInWash += marketUsd;
      }
    } else if (cls === 'fresh') {
      compFresh += marketUsd;
    } else if (cls === 'established') {
      compEst += marketUsd;
    } else {
      compOther += marketUsd;
    }
  }

  const composition: CompositionData = {
    established: compEst,
    other: compOther,
    fresh: compFresh,
    wash: compWash,
    freshInWash,
    totalUsd: volumeUsd,
  };

  const top40 = sortedWallets.slice(0, 40);
  const top40Set = new Set(top40.map(([w]) => w));
  const nodes: GraphNode[] = top40.map(([w, usd]) => ({
    id: w,
    label: `…${w.slice(-4)}`,
    usd: usd / 2,
    cls: classifyWallet(w),
  }));

  const links: GraphLink[] = [];
  for (const pStat of pairStats.values()) {
    if (top40Set.has(pStat.a) && top40Set.has(pStat.b)) {
      links.push({
        a: pStat.a,
        b: pStat.b,
        usd: pStat.usd / 2,
        n: pStat.n,
      });
    }
  }
  links.sort((x, y) => y.usd - x.usd);
  const topLinks = links.slice(0, 80);

  const windowHours =
    rows.length > 0
      ? truncated
        ? Math.max(1, Math.round(((nowSec - oldestTs) / 3600) * 10) / 10)
        : 168
      : 168;

  return {
    market,
    score: totalScore,
    grade,
    letter,
    checks,
    composition,
    nodes,
    links: topLinks,
    prices,
    biggestMove,
    stats: {
      volumeUsd,
      fills: rows.length,
      wallets: walletUsd.size,
      windowHours,
      truncated,
      lookedUp: topLookupTargets.length,
      coverage,
    },
  };
}
