export interface AuditParams {
  estMinTrades: number;
  estMinAgeDays: number;
  estMinUsd: number;
  estWalletCapUsd: number;
  freshDays: number;
  smartPnlUsd: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function getAuditParams(): AuditParams {
  const raw = process.env.AUDIT_PARAMS;
  if (!raw || !raw.trim()) {
    throw new ConfigError('Server is missing its rating configuration');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('Server is missing its rating configuration');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ConfigError('Server is missing its rating configuration');
  }

  const obj = parsed as Record<string, unknown>;
  const keys: (keyof AuditParams)[] = [
    'estMinTrades',
    'estMinAgeDays',
    'estMinUsd',
    'estWalletCapUsd',
    'freshDays',
    'smartPnlUsd',
  ];

  for (const k of keys) {
    const val = obj[k];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new ConfigError('Server is missing its rating configuration');
    }
  }

  return {
    estMinTrades: obj.estMinTrades as number,
    estMinAgeDays: obj.estMinAgeDays as number,
    estMinUsd: obj.estMinUsd as number,
    estWalletCapUsd: obj.estWalletCapUsd as number,
    freshDays: obj.freshDays as number,
    smartPnlUsd: obj.smartPnlUsd as number,
  };
}
