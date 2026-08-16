const DEFAULT_SUPPLIER_TIMEOUT_MS = 5000;

export interface ValidatedEnv extends Record<string, unknown> {
  SUPPLIERS_BASE_URL: string;
  SUPPLIER_TIMEOUT_MS: number;
}

/**
 * Usada por `ConfigModule.forRoot({ validate: validateEnv })`.
 *
 * Falha rápido (erro no boot da aplicação) se `SUPPLIERS_BASE_URL` estiver ausente, em vez de
 * deixar `undefined` chegar silenciosamente até o axios. Normaliza `SUPPLIER_TIMEOUT_MS` para um
 * número positivo, com default de 5000ms.
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

  return {
    ...config,
    SUPPLIERS_BASE_URL: suppliersBaseUrl,
    SUPPLIER_TIMEOUT_MS: supplierTimeoutMs,
  };
}
