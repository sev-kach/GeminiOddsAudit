import { runMarketAudit } from './audit.ts';
import { TtlPromiseCache } from './cache.ts';
import { getAuditParams } from './config.ts';
import {
  fetchJsonWithTimeout,
  normalizeGammaMarket,
  resolvePolymarketMarket,
} from './polymarket.ts';
import type { AuditMarket, BoardResponse, BoardRow } from '../src/types.ts';

const BOARD_TTL_MS = 15 * 60 * 1000;
const PINNED_SLUG = 'will-elissa-slotkin-win-the-2028-us-presidential-election';
const SKIP_PATTERN = /up or down|o\/u|spread:|vs\.|exact score|handicap|total (points|goals)/i;

const boardCache = new TtlPromiseCache<BoardResponse>(BOARD_TTL_MS);

interface RawCandidateMarket {
  question?: string;
  slug?: string;
  conditionId?: string;
  clobTokenIds?: unknown;
  outcomes?: unknown;
  image?: string | null;
  icon?: string | null;
  endDate?: string | null;
  closed?: boolean;
  events?: Array<{ slug?: string }>;
}

async function fetchBoardCandidates(): Promise<AuditMarket[]> {
  const [page0, page400, pinned] = await Promise.allSettled([
    fetchJsonWithTimeout<RawCandidateMarket[]>(
      'https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=100&offset=0'
    ),
    fetchJsonWithTimeout<RawCandidateMarket[]>(
      'https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=100&offset=400'
    ),
    resolvePolymarketMarket(PINNED_SLUG),
  ]);

  const selected: AuditMarket[] = [];
  const seen = new Set<string>();

  const addCandidate = (market: AuditMarket) => {
    if (seen.has(market.conditionId) || seen.has(market.slug)) return;
    seen.add(market.conditionId);
    seen.add(market.slug);
    selected.push(market);
  };

  if (page0.status === 'fulfilled' && Array.isArray(page0.value)) {
    let count0 = 0;
    for (const raw of page0.value) {
      if (count0 >= 12) break;
      const q = String(raw.question || '');
      if (!q || SKIP_PATTERN.test(q)) continue;
      try {
        const m = normalizeGammaMarket(raw);
        addCandidate(m);
        count0++;
      } catch {
        // skip invalid candidate
      }
    }
  }

  if (page400.status === 'fulfilled' && Array.isArray(page400.value)) {
    const filtered400 = page400.value.filter((raw) => {
      const q = String(raw.question || '');
      return Boolean(q) && !SKIP_PATTERN.test(q);
    });
    let taken400 = 0;
    for (let i = 0; i < filtered400.length && taken400 < 6; i += 5) {
      try {
        const m = normalizeGammaMarket(filtered400[i]);
        addCandidate(m);
        taken400++;
      } catch {
        // skip invalid candidate
      }
    }
  }

  if (pinned.status === 'fulfilled') {
    addCandidate(pinned.value);
  }

  return selected;
}

async function buildBoard(): Promise<BoardResponse> {
  // Validate configuration upfront
  getAuditParams();

  const candidates = await fetchBoardCandidates();
  const rows: BoardRow[] = [];
  let totalFills = 0;
  let totalWallets = 0;

  let idx = 0;
  const concurrency = 4;

  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (true) {
      const current = idx++;
      if (current >= candidates.length) break;
      const market = candidates[current];
      try {
        const audit = await runMarketAudit(market, 60);
        if (audit.stats.fills === 0) continue;

        totalFills += audit.stats.fills;
        totalWallets += audit.stats.lookedUp;

        const failing = audit.checks
          .filter((c) => c.status === 'fail')
          .sort((a, b) => b.weight - a.weight);

        rows.push({
          url: audit.market.url,
          question: audit.market.question,
          image: audit.market.image,
          score: audit.score,
          grade: audit.grade,
          letter: audit.letter,
          volumeUsd: audit.stats.volumeUsd,
          wallets: audit.stats.wallets,
          concern: failing.length > 0 ? failing[0].headline : null,
          composition: audit.composition,
        });
      } catch {
        // Skip failed candidate audits per spec
      }
    }
  });

  await Promise.all(workers);

  rows.sort((a, b) => b.volumeUsd - a.volumeUsd);

  return {
    rows,
    totalFills,
    totalWallets,
    updatedAt: Date.now(),
  };
}

export function getCachedBoard(): Promise<BoardResponse> {
  return boardCache.getOrSet('board', () => buildBoard());
}
