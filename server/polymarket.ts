import { TtlPromiseCache } from './cache.ts';
import type { AuditMarket, PricePoint } from '../src/types.ts';

const FETCH_TIMEOUT_MS = 12_000;
const WALLET_TTL_MS = 30 * 60 * 1000;

export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserInputError';
  }
}

export interface TradeRow {
  proxy_wallet: string;
  side: 'BUY' | 'SELL';
  outcome_index: number;
  size: number;
  price: number;
  timestamp: number;
  transaction_hash: string;
}

export interface WalletHistory {
  wallet: string;
  trades: number | null;
  firstTrade: number | null;
  pnl: number | null;
  unknown: boolean;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

function parseJsonStringArray(raw: unknown, fallback: string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x));
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

interface RawGammaMarket {
  question?: string;
  slug?: string;
  conditionId?: string;
  clobTokenIds?: unknown;
  outcomes?: unknown;
  image?: string | null;
  icon?: string | null;
  endDate?: string | null;
  closed?: boolean;
  volumeNum?: number | string;
  volume?: number | string;
  events?: Array<{ slug?: string }>;
}

interface RawGammaEvent {
  slug?: string;
  markets?: RawGammaMarket[];
}

export function normalizeGammaMarket(raw: RawGammaMarket, fallbackEventSlug: string | null = null): AuditMarket {
  const slug = String(raw.slug || '').trim();
  const conditionId = String(raw.conditionId || '').trim();
  const clobTokenIds = parseJsonStringArray(raw.clobTokenIds, []);
  const yesToken = clobTokenIds[0] || '';
  if (!slug || !conditionId || !yesToken) {
    throw new UserInputError(
      "That link didn't match a Polymarket market. Paste a link from polymarket.com/event/… or /market/…"
    );
  }

  const outcomes = parseJsonStringArray(raw.outcomes, ['Yes', 'No']);
  const eventSlug =
    (Array.isArray(raw.events) && raw.events[0]?.slug ? String(raw.events[0].slug) : null) ||
    fallbackEventSlug;

  const url = eventSlug
    ? eventSlug === slug
      ? `https://polymarket.com/event/${eventSlug}`
      : `https://polymarket.com/event/${eventSlug}/${slug}`
    : `https://polymarket.com/market/${slug}`;

  return {
    question: String(raw.question || slug),
    slug,
    eventSlug,
    url,
    conditionId,
    yesToken,
    outcomes,
    image: raw.image || raw.icon || null,
    endDate: raw.endDate || null,
    closed: Boolean(raw.closed),
  };
}

interface ParsedLink {
  marketSlug: string | null;
  eventSlug: string | null;
  isBareSlug: boolean;
}

export function parsePolymarketInput(rawInput: string): ParsedLink {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new UserInputError(
      'Paste a Polymarket market link, for example polymarket.com/event/… or /market/…'
    );
  }

  if (trimmed.includes('polymarket.com') || /^https?:\/\//i.test(trimmed)) {
    let parsedUrl: URL;
    try {
      const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      parsedUrl = new URL(withProto);
    } catch {
      throw new UserInputError(
        "That link didn't match a Polymarket market. Paste a link from polymarket.com/event/… or /market/…"
      );
    }

    if (!parsedUrl.hostname.toLowerCase().endsWith('polymarket.com')) {
      throw new UserInputError(
        "That link didn't match a Polymarket market. Paste a link from polymarket.com/event/… or /market/…"
      );
    }

    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '');
    const eventMarketMatch = cleanPath.match(/^\/event\/([^/]+)\/([^/]+)$/);
    if (eventMarketMatch) {
      return {
        eventSlug: decodeURIComponent(eventMarketMatch[1]),
        marketSlug: decodeURIComponent(eventMarketMatch[2]),
        isBareSlug: false,
      };
    }

    const eventMatch = cleanPath.match(/^\/event\/([^/]+)$/);
    if (eventMatch) {
      return {
        eventSlug: decodeURIComponent(eventMatch[1]),
        marketSlug: null,
        isBareSlug: false,
      };
    }

    const marketMatch = cleanPath.match(/^\/market\/([^/]+)$/);
    if (marketMatch) {
      return {
        eventSlug: null,
        marketSlug: decodeURIComponent(marketMatch[1]),
        isBareSlug: false,
      };
    }

    throw new UserInputError(
      "That link didn't match a Polymarket market. Paste a link from polymarket.com/event/… or /market/…"
    );
  }

  const bare = trimmed.split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '');
  if (!bare || bare.includes('/') || /\s/.test(bare)) {
    throw new UserInputError(
      "That link didn't match a Polymarket market. Paste a link from polymarket.com/event/… or /market/…"
    );
  }

  return {
    marketSlug: bare,
    eventSlug: null,
    isBareSlug: true,
  };
}

async function fetchMarketBySlug(slug: string): Promise<RawGammaMarket | null> {
  const openList = await fetchJsonWithTimeout<RawGammaMarket[]>(
    `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&closed=false`
  );
  if (Array.isArray(openList) && openList.length > 0) {
    return openList[0];
  }
  const closedList = await fetchJsonWithTimeout<RawGammaMarket[]>(
    `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&closed=true`
  );
  if (Array.isArray(closedList) && closedList.length > 0) {
    return closedList[0];
  }
  return null;
}

async function fetchMarketByEventSlug(
  eventSlug: string
): Promise<{ market: RawGammaMarket; eventSlug: string } | null> {
  const events = await fetchJsonWithTimeout<RawGammaEvent[]>(
    `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug)}`
  );
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }
  const markets = events[0].markets;
  if (!Array.isArray(markets) || markets.length === 0) {
    return null;
  }
  const openMarkets = markets.filter((m) => !m.closed);
  const pool = openMarkets.length > 0 ? openMarkets : markets;
  const best = pool.reduce((acc, cur) => {
    const accVol = Number(acc.volumeNum ?? acc.volume ?? 0);
    const curVol = Number(cur.volumeNum ?? cur.volume ?? 0);
    return curVol > accVol ? cur : acc;
  }, pool[0]);

  return {
    market: best,
    eventSlug: events[0].slug || eventSlug,
  };
}

export async function resolvePolymarketMarket(input: string): Promise<AuditMarket> {
  const parsed = parsePolymarketInput(input);

  if (parsed.marketSlug) {
    const market = await fetchMarketBySlug(parsed.marketSlug);
    if (market) {
      return normalizeGammaMarket(market, parsed.eventSlug);
    }
    if (parsed.isBareSlug) {
      const fromEvent = await fetchMarketByEventSlug(parsed.marketSlug);
      if (fromEvent) {
        return normalizeGammaMarket(fromEvent.market, fromEvent.eventSlug);
      }
    }
  } else if (parsed.eventSlug) {
    const fromEvent = await fetchMarketByEventSlug(parsed.eventSlug);
    if (fromEvent) {
      return normalizeGammaMarket(fromEvent.market, fromEvent.eventSlug);
    }
  }

  throw new UserInputError(
    "That link didn't match a Polymarket market. Paste a link from polymarket.com/event/… or /market/…"
  );
}

interface TradesApiRow {
  proxy_wallet?: string;
  side?: string;
  outcome_index?: number | string;
  size?: number | string;
  price?: number | string;
  timestamp?: number | string;
  transaction_hash?: string;
}

interface TradesApiResponse {
  data?: TradesApiRow[];
  pagination?: {
    has_more?: boolean;
    next_cursor?: string | null;
  };
}

function toSeconds(ts: number): number {
  return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
}

export async function fetchSevenDayTrades(
  conditionId: string,
  nowSec: number
): Promise<{ rows: TradeRow[]; truncated: boolean }> {
  const cutoff = nowSec - 7 * 86400;
  const rows: TradeRow[] = [];
  let cursor: string | null = null;
  let truncated = false;

  for (let page = 1; page <= 12; page++) {
    const url: string = `https://data-api.polymarket.com/v2/trades?condition=${encodeURIComponent(
      conditionId
    )}&limit=500&taker_only=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;

    const res: TradesApiResponse = await fetchJsonWithTimeout<TradesApiResponse>(url);
    const data = Array.isArray(res.data) ? res.data : [];

    let hitCutoff = false;
    for (const raw of data) {
      if (!raw.proxy_wallet || !raw.transaction_hash) continue;
      const rawTs = Number(raw.timestamp);
      if (!Number.isFinite(rawTs)) continue;
      const ts = toSeconds(rawTs);

      if (ts > nowSec) continue;
      if (ts < cutoff) {
        hitCutoff = true;
        break;
      }

      const size = Number(raw.size);
      const price = Number(raw.price);
      const outcomeIndex = Number(raw.outcome_index);
      const side = String(raw.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      if (!Number.isFinite(size) || !Number.isFinite(price) || !Number.isFinite(outcomeIndex)) {
        continue;
      }

      rows.push({
        proxy_wallet: String(raw.proxy_wallet).toLowerCase(),
        side,
        outcome_index: outcomeIndex,
        size,
        price,
        timestamp: ts,
        transaction_hash: String(raw.transaction_hash),
      });
    }

    if (hitCutoff) {
      break;
    }

    const hasMore = Boolean(res.pagination?.has_more && res.pagination?.next_cursor);
    if (!hasMore) {
      break;
    }

    if (page === 12) {
      truncated = true;
      break;
    }

    cursor = res.pagination!.next_cursor!;
  }

  return { rows, truncated };
}

interface UserStatsResponse {
  data?: {
    trades?: number;
    all_time_pnl?: {
      realized_pnl?: number | null;
    } | null;
  } | null;
}

interface ActivityResponse {
  data?: Array<{
    timestamp?: number | string;
  }> | null;
}

const walletCache = new TtlPromiseCache<WalletHistory>(WALLET_TTL_MS);

async function fetchSingleWalletHistory(wallet: string): Promise<WalletHistory> {
  const normalized = wallet.toLowerCase();
  return walletCache.getOrSet(
    normalized,
    async () => {
      const [statsResult, activityResult] = await Promise.allSettled([
        fetchJsonWithTimeout<UserStatsResponse>(
          `https://data-api.polymarket.com/v2/user-stats?user=${encodeURIComponent(normalized)}`
        ),
        fetchJsonWithTimeout<ActivityResponse>(
          `https://data-api.polymarket.com/v2/activity?user=${encodeURIComponent(
            normalized
          )}&limit=1&sort_direction=ASC&type=TRADE`
        ),
      ]);

      const statsOk = statsResult.status === 'fulfilled';
      const activityOk = activityResult.status === 'fulfilled';

      if (!statsOk && !activityOk) {
        return {
          wallet: normalized,
          trades: null,
          firstTrade: null,
          pnl: null,
          unknown: true,
        };
      }

      let firstTrade: number | null = null;
      if (activityOk && Array.isArray(activityResult.value?.data) && activityResult.value.data.length > 0) {
        const rawTs = Number(activityResult.value.data[0].timestamp);
        if (Number.isFinite(rawTs) && rawTs > 0) {
          firstTrade = toSeconds(rawTs);
        }
      }

      const statsData = statsOk ? statsResult.value?.data ?? null : null;

      if (statsData === null) {
        if (firstTrade !== null) {
          return {
            wallet: normalized,
            trades: 0,
            firstTrade,
            pnl: null,
            unknown: false,
          };
        }
        return {
          wallet: normalized,
          trades: statsOk ? 0 : null,
          firstTrade: null,
          pnl: null,
          unknown: !statsOk,
        };
      }

      const trades = statsData.trades != null && Number.isFinite(Number(statsData.trades))
        ? Number(statsData.trades)
        : 0;
      const rawPnl = statsData.all_time_pnl?.realized_pnl;
      const pnl = rawPnl != null && Number.isFinite(Number(rawPnl)) ? Number(rawPnl) : null;

      return {
        wallet: normalized,
        trades,
        firstTrade,
        pnl,
        unknown: false,
      };
    },
    (val) => !val.unknown
  );
}

export async function fetchWalletHistories(
  wallets: string[],
  concurrency = 25
): Promise<Map<string, WalletHistory>> {
  const results = new Map<string, WalletHistory>();
  if (wallets.length === 0) return results;

  let idx = 0;
  const workerCount = Math.min(concurrency, wallets.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = idx++;
      if (current >= wallets.length) break;
      const w = wallets[current].toLowerCase();
      try {
        const info = await fetchSingleWalletHistory(w);
        results.set(w, info);
      } catch {
        results.set(w, {
          wallet: w,
          trades: null,
          firstTrade: null,
          pnl: null,
          unknown: true,
        });
      }
    }
  });

  await Promise.all(workers);
  return results;
}

interface RawBookResponse {
  bids?: Array<{ price?: string | number; size?: string | number }>;
  asks?: Array<{ price?: string | number; size?: string | number }>;
}

export async function fetchOrderBook(yesToken: string): Promise<OrderBook | null> {
  try {
    const raw = await fetchJsonWithTimeout<RawBookResponse>(
      `https://clob.polymarket.com/book?token_id=${encodeURIComponent(yesToken)}`
    );
    const parseLevels = (list: RawBookResponse['bids']) =>
      (Array.isArray(list) ? list : [])
        .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
        .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0);

    const bids = parseLevels(raw.bids).sort((a, b) => b.price - a.price);
    const asks = parseLevels(raw.asks).sort((a, b) => a.price - b.price);
    return { bids, asks };
  } catch {
    return null;
  }
}

interface RawPricesResponse {
  history?: Array<{ t?: number | string; p?: number | string }>;
}

export async function fetchPriceHistory(yesToken: string): Promise<PricePoint[]> {
  try {
    const raw = await fetchJsonWithTimeout<RawPricesResponse>(
      `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(
        yesToken
      )}&interval=1w&fidelity=60`
    );
    const list = Array.isArray(raw.history) ? raw.history : [];
    return list
      .map((pt) => ({
        t: toSeconds(Number(pt.t)),
        p: Number(pt.p),
      }))
      .filter((pt) => Number.isFinite(pt.t) && Number.isFinite(pt.p))
      .sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}
