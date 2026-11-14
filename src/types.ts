export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export type LetterRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';

export type GradeLabel = 'Trustworthy' | 'Caution' | 'Unreliable';

export type WalletClass = 'established' | 'other' | 'fresh' | 'wash';

export interface CheckMetric {
  label: string;
  value: string;
}

export interface AuditCheck {
  id: string;
  title: string;
  status: CheckStatus;
  score: number | null;
  weight: number;
  headline: string;
  metrics: CheckMetric[];
  method: string;
}

export interface CompositionData {
  established: number;
  other: number;
  fresh: number;
  wash: number;
  freshInWash: number;
  totalUsd: number;
}

export interface GraphNode {
  id: string;
  label: string;
  usd: number;
  cls: WalletClass;
}

export interface GraphLink {
  a: string;
  b: string;
  usd: number;
  n: number;
}

export interface PricePoint {
  t: number;
  p: number;
}

export interface BiggestMove {
  from: number;
  to: number;
  at: number;
  startAt: number;
  deltaPts: number;
}

export interface AuditStats {
  volumeUsd: number;
  fills: number;
  wallets: number;
  windowHours: number;
  truncated: boolean;
  lookedUp: number;
  coverage: number;
}

export interface AuditMarket {
  question: string;
  slug: string;
  eventSlug: string | null;
  url: string;
  conditionId: string;
  yesToken: string;
  outcomes: string[];
  image: string | null;
  endDate: string | null;
  closed: boolean;
}

export interface AuditReport {
  market: AuditMarket;
  score: number;
  grade: GradeLabel;
  letter: LetterRating;
  checks: AuditCheck[];
  composition: CompositionData;
  nodes: GraphNode[];
  links: GraphLink[];
  prices: PricePoint[];
  biggestMove: BiggestMove | null;
  stats: AuditStats;
}

export interface VerdictSource {
  title: string;
  uri: string;
}

export interface AnalystVerdict {
  risk: 'low' | 'medium' | 'high';
  news: string;
  summary: string;
  sources: VerdictSource[];
}

export interface BoardRow {
  url: string;
  question: string;
  image: string | null;
  score: number;
  grade: GradeLabel;
  letter: LetterRating;
  volumeUsd: number;
  wallets: number;
  concern: string | null;
  composition: CompositionData;
}

export interface BoardResponse {
  rows: BoardRow[];
  totalFills: number;
  totalWallets: number;
  updatedAt: number;
}
