import { Prisma } from '../../generated/prisma/client';
import { isUniqueConstraintViolation } from './prisma-error.util';

function p2002ClassicTarget(
  target: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.9.1',
    meta: { target },
  });
}

/** Forma real observada com o driver adapter `@prisma/adapter-pg` (Prisma 7) — ver
 * `prisma-error.util.ts`. */
function p2002DriverAdapter(
  quotedFields: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.9.1',
    meta: {
      modelName: 'Order',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          originalMessage: 'duplicate key value violates unique constraint',
          kind: 'UniqueConstraintViolation',
          constraint: { fields: quotedFields },
        },
      },
    },
  });
}

describe('isUniqueConstraintViolation', () => {
  it('P2002 (driver adapter pg, forma real): campo em meta.driverAdapterError.cause.constraint.fields → true', () => {
    const error = p2002DriverAdapter(['"idempotencyKey"']);

    expect(isUniqueConstraintViolation(error, 'idempotencyKey')).toBe(true);
  });

  it('P2002 (driver adapter pg) com campo errado: false', () => {
    const error = p2002DriverAdapter(['"idempotencyKey"']);

    expect(isUniqueConstraintViolation(error, 'passengerId')).toBe(false);
  });

  it('P2002 (forma clássica meta.target) com o campo: true', () => {
    const error = p2002ClassicTarget(['idempotencyKey']);

    expect(isUniqueConstraintViolation(error, 'idempotencyKey')).toBe(true);
  });

  it('P2002 (forma clássica meta.target) com o campo errado: false', () => {
    const error = p2002ClassicTarget(['idempotencyKey']);

    expect(isUniqueConstraintViolation(error, 'passengerId')).toBe(false);
  });

  it('code diferente de P2002: false', () => {
    const error = new Prisma.PrismaClientKnownRequestError('boom', {
      code: 'P2003',
      clientVersion: '7.9.1',
      meta: { target: ['idempotencyKey'] },
    });

    expect(isUniqueConstraintViolation(error, 'idempotencyKey')).toBe(false);
  });

  it('erro que não é PrismaClientKnownRequestError: false', () => {
    expect(
      isUniqueConstraintViolation(new Error('boom'), 'idempotencyKey'),
    ).toBe(false);
  });

  it('P2002 sem meta: false', () => {
    const error = new Prisma.PrismaClientKnownRequestError('boom', {
      code: 'P2002',
      clientVersion: '7.9.1',
    });

    expect(isUniqueConstraintViolation(error, 'idempotencyKey')).toBe(false);
  });
});
