const DEFAULT_SUPPLIER_TIMEOUT_MS = 5000;
const DEFAULT_SEARCH_TOTAL_TIMEOUT_MS = 6000;

export interface ValidatedEnv extends Record<string, unknown> {
  SUPPLIERS_BASE_URL: string;
  SUPPLIER_TIMEOUT_MS: number;
  SEARCH_TOTAL_TIMEOUT_MS: number;
}

/**
 * Usada por `ConfigModule.forRoot({ validate: validateEnv })`.
 *
 * Falha rápido (erro no boot da aplicação) se `SUPPLIERS_BASE_URL` estiver ausente, em vez de
 * deixar `undefined` chegar silenciosamente até o axios. Normaliza `SUPPLIER_TIMEOUT_MS` e
 * `SEARCH_TOTAL_TIMEOUT_MS` para números positivos, com default de 5000ms e 6000ms
 * respectivamente.
 *
 * `DATABASE_URL` não entra nesta validação (fica para quando o Prisma for tocado, DSM-6+).
 */
export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const suppliersBaseUrl = config.SUPPLIERS_BASE_URL;
  if (typeof suppliersBaseUrl !== 'string' || suppliersBaseUrl.trim() === '') {
    throw new Error(
      'Missing required env var SUPPLIERS_BASE_URL (see api/.env.example)',
    );
  }

  let supplierTimeoutMs = DEFAULT_SUPPLIER_TIMEOUT_MS;
  const rawTimeout = config.SUPPLIER_TIMEOUT_MS;
  if (rawTimeout !== undefined && rawTimeout !== '') {
    const parsed = Number(rawTimeout);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        'Invalid env var SUPPLIER_TIMEOUT_MS: must be a positive number (see api/.env.example)',
      );
    }
    supplierTimeoutMs = parsed;
  }

  let searchTotalTimeoutMs = DEFAULT_SEARCH_TOTAL_TIMEOUT_MS;
  const rawSearchTimeout = config.SEARCH_TOTAL_TIMEOUT_MS;
  if (rawSearchTimeout !== undefined && rawSearchTimeout !== '') {
    const parsed = Number(rawSearchTimeout);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        'Invalid env var SEARCH_TOTAL_TIMEOUT_MS: must be a positive number (see api/.env.example)',
      );
    }
    searchTotalTimeoutMs = parsed;
  }

  return {
    ...config,
    SUPPLIERS_BASE_URL: suppliersBaseUrl,
    SUPPLIER_TIMEOUT_MS: supplierTimeoutMs,
    SEARCH_TOTAL_TIMEOUT_MS: searchTotalTimeoutMs,
  };
}
