import { GoogleGenAI } from '@google/genai';
import { getCachedAudit } from './audit.ts';
import { TtlPromiseCache } from './cache.ts';
import type { AnalystVerdict, AuditReport, VerdictSource } from '../src/types.ts';

const VERDICT_TTL_MS = 10 * 60 * 1000;
const verdictCache = new TtlPromiseCache<AnalystVerdict>(VERDICT_TTL_MS);

function formatUsdPlain(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function parseVerdictText(text: string): { risk: 'low' | 'medium' | 'high'; news: string; summary: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\*+|\*+$/g, '').trim())
    .filter(Boolean);

  let risk: 'low' | 'medium' | 'high' = 'medium';
  let news = '';
  let verdict = '';

  for (const line of lines) {
    const clean = line.replace(/\*\*/g, '').trim();
    if (/^RISK\s*:/i.test(clean)) {
      const val = clean.replace(/^RISK\s*:/i, '').trim().toLowerCase();
      if (val.includes('low')) risk = 'low';
      else if (val.includes('high')) risk = 'high';
      else risk = 'medium';
    } else if (/^NEWS\s*:/i.test(clean)) {
      news = clean.replace(/^NEWS\s*:/i, '').trim();
    } else if (/^VERDICT\s*:/i.test(clean)) {
      verdict = clean.replace(/^VERDICT\s*:/i, '').trim();
    }
  }

  if (!news && lines.length >= 2) {
    news = lines[1].replace(/^NEWS\s*:/i, '').trim();
  }
  if (!verdict && lines.length >= 3) {
    verdict = lines.slice(2).join(' ').replace(/^VERDICT\s*:/i, '').trim();
  }

  return {
    risk,
    news: news || 'No clear news catalyst could be confirmed from the past week.',
    summary: verdict || 'Review the seven checks above before sizing a position or accepting this price as collateral.',
  };
}

async function generateVerdict(audit: AuditReport): Promise<AnalystVerdict> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Server is missing its Gemini API key');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const moveDesc = audit.biggestMove
    ? `${(audit.biggestMove.from * 100).toFixed(0)}¢ to ${(audit.biggestMove.to * 100).toFixed(
        0
      )}¢ (${audit.biggestMove.deltaPts >= 0 ? '+' : ''}${audit.biggestMove.deltaPts} pts over 24h)`
    : 'No 24-hour move recorded';

  const checkSummary = audit.checks
    .map((c) => `- ${c.title} [${c.status}]: ${c.headline}`)
    .join('\n');

  const prompt = [
    `Market question: ${audit.market.question}`,
    `Rating: ${audit.letter} (${audit.score}/100, ${audit.grade})`,
    `7-day volume: ${formatUsdPlain(audit.stats.volumeUsd)} across ${audit.stats.wallets} wallets`,
    `Biggest 24h move: ${moveDesc}`,
    `Audit checks:`,
    checkSummary,
    '',
    'Search the past 7 days of news about the market\'s subject. Decide whether real news explains the trading (informed traders) or nothing does (manipulation). Do not recompute or dispute the numbers.',
    'Reply in exactly three lines:',
    'RISK: low|medium|high',
    'NEWS: <one sentence>',
    'VERDICT: <two sentences for a trader or lender>',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
    },
  });

  const text = response.text ?? '';
  const parsed = parseVerdictText(text);

  const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seenUris = new Set<string>();
  const sources: VerdictSource[] = [];

  for (const chunk of rawChunks) {
    const uri = chunk?.web?.uri;
    if (!uri || seenUris.has(uri)) continue;
    seenUris.add(uri);
    sources.push({
      title: chunk.web?.title || uri,
      uri,
    });
    if (sources.length >= 5) break;
  }

  return {
    risk: parsed.risk,
    news: parsed.news,
    summary: parsed.summary,
    sources,
  };
}

export function getCachedVerdict(input: string): Promise<AnalystVerdict> {
  const key = input.trim().toLowerCase();
  return verdictCache.getOrSet(key, async () => {
    const audit = await getCachedAudit(input);
    return generateVerdict(audit);
  });
}
