import { Prisma } from '../../generated/prisma/client';

function normalizeFieldName(rawFieldName: string): string {
  return rawFieldName.replace(/^"+|"+$/g, '');
}

function extractConstraintFields(
  error: Prisma.PrismaClientKnownRequestError,
): string[] {
  const meta = error.meta;
  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.target)) {
    return meta.target.map(String);
  }

  const driverAdapterError = meta.driverAdapterError as
    { cause?: { constraint?: { fields?: unknown } } } | undefined;
  const fields = driverAdapterError?.cause?.constraint?.fields;

  if (Array.isArray(fields)) {
    return fields.map((rawFieldName) =>
      normalizeFieldName(String(rawFieldName)),
    );
  }

  return [];
}

/**
 * Confirma que `error` é um conflito de constraint única do Postgres (`P2002`) envolvendo
 * `field`. Genérico — sem conhecimento de `orders` — reaproveitável por qualquer feature futura
 * que também dependa de constraint única no banco.
 */
export function isUniqueConstraintViolation(
  error: unknown,
  field: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  return extractConstraintFields(error).includes(field);
}
