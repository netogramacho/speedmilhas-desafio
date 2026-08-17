import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { validateEnv } from '../../common/config/validate-env';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Order/Passenger schema (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        PrismaModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    // Order → Passenger (onDelete: Restrict): precisa apagar os Order de teste primeiro, senão o
    // Passenger ainda referenciado rejeita a exclusão por violação de FK.
    await prisma.order.deleteMany({
      where: { idempotencyKey: { startsWith: 'e2e-' } },
    });
    await prisma.passenger.deleteMany({
      where: { document: { startsWith: 'e2e-' } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC1: idempotencyKey duplicada rejeita com erro de constraint do banco (P2002), não validação de aplicação', async () => {
    await prisma.order.create({
      data: {
        quoteId: 'quote-1',
        idempotencyKey: 'e2e-key-1',
        passenger: { create: { name: 'Fulano de Tal', document: 'e2e-doc-1' } },
      },
    });

    await expect(
      prisma.order.create({
        data: {
          quoteId: 'quote-2',
          idempotencyKey: 'e2e-key-1',
          passenger: { create: { name: 'Outro Nome', document: 'e2e-doc-1b' } },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('concorrência real: duas criações simultâneas com a mesma idempotencyKey — exatamente uma resolve, a outra rejeita com P2002; nenhum Order/Passenger duplicado ou órfão', async () => {
    const idempotencyKey = 'e2e-key-2';

    const results = await Promise.allSettled([
      prisma.order.create({
        data: {
          quoteId: 'quote-a',
          idempotencyKey,
          passenger: {
            create: { name: 'Passageiro A', document: 'e2e-doc-2' },
          },
        },
      }),
      prisma.order.create({
        data: {
          quoteId: 'quote-b',
          idempotencyKey,
          passenger: {
            create: { name: 'Passageiro B', document: 'e2e-doc-2' },
          },
        },
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      code: 'P2002',
    });

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(1);

    const passengerCount = await prisma.passenger.count({
      where: { document: 'e2e-doc-2' },
    });
    expect(passengerCount).toBe(1);
  });

  it('AC2: quoteId e dados do passageiro persistidos batem exatamente com o que foi inserido', async () => {
    const created = await prisma.order.create({
      data: {
        quoteId: 'quote-ac2',
        idempotencyKey: 'e2e-key-ac2',
        passenger: {
          create: { name: 'Maria da Silva', document: 'e2e-doc-ac2' },
        },
      },
    });

    const found = await prisma.order.findUnique({
      where: { id: created.id },
      include: { passenger: true },
    });

    expect(found?.quoteId).toBe('quote-ac2');
    expect(found?.passenger?.name).toBe('Maria da Silva');
    expect(found?.passenger?.document).toBe('e2e-doc-ac2');
  });

  it('1:1 garantida no banco: segundo Order com o mesmo passengerId rejeita com P2002', async () => {
    const passenger = await prisma.passenger.create({
      data: { name: 'Passageiro Único', document: 'e2e-doc-1to1' },
    });

    await prisma.order.create({
      data: {
        quoteId: 'quote-1to1-a',
        idempotencyKey: 'e2e-key-1to1-a',
        passengerId: passenger.id,
      },
    });

    await expect(
      prisma.order.create({
        data: {
          quoteId: 'quote-1to1-b',
          idempotencyKey: 'e2e-key-1to1-b',
          passengerId: passenger.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('onDelete: Restrict impede apagar um Passenger enquanto algum Order o referencia', async () => {
    const created = await prisma.order.create({
      data: {
        quoteId: 'quote-restrict',
        idempotencyKey: 'e2e-key-restrict',
        passenger: {
          create: { name: 'Passageiro Restrict', document: 'e2e-doc-restrict' },
        },
      },
      include: { passenger: true },
    });

    // Com relationMode "foreignKeys" (default) e o driver adapter pg, a violação de RESTRICT vem
    // do próprio Postgres (SQLSTATE 23001) e o Prisma 7 a mapeia para P2039, não para o P2003
    // "clássico" (esse é emitido quando o Prisma emula a referential action em código).
    await expect(
      prisma.passenger.delete({ where: { id: created.passengerId } }),
    ).rejects.toMatchObject({ code: 'P2039' });

    const passenger = await prisma.passenger.findUnique({
      where: { id: created.passengerId },
    });
    expect(passenger).not.toBeNull();
  });

  it('ordem correta de limpeza: apagar o Order primeiro, depois o Passenger (agora órfão), sem violar FK', async () => {
    const created = await prisma.order.create({
      data: {
        quoteId: 'quote-order',
        idempotencyKey: 'e2e-key-order',
        passenger: {
          create: { name: 'Passageiro Ordem', document: 'e2e-doc-order' },
        },
      },
    });

    await prisma.order.delete({ where: { id: created.id } });
    await prisma.passenger.delete({ where: { id: created.passengerId } });

    const passenger = await prisma.passenger.findUnique({
      where: { id: created.passengerId },
    });
    expect(passenger).toBeNull();
  });

  it('AC3: Order criado sem status explícito nasce PENDING; update para CONFIRMED persiste e é lido de volta', async () => {
    const created = await prisma.order.create({
      data: {
        quoteId: 'quote-ac3',
        idempotencyKey: 'e2e-key-ac3',
        passenger: {
          create: { name: 'Passageiro AC3', document: 'e2e-doc-ac3' },
        },
      },
    });

    expect(created.status).toBe('PENDING');

    const updated = await prisma.order.update({
      where: { id: created.id },
      data: { status: 'CONFIRMED' },
    });

    expect(updated.status).toBe('CONFIRMED');

    const found = await prisma.order.findUnique({ where: { id: created.id } });
    expect(found?.status).toBe('CONFIRMED');
  });

  it('id é uuid gerado pelo banco (gen_random_uuid())', async () => {
    const created = await prisma.order.create({
      data: {
        quoteId: 'quote-uuid',
        idempotencyKey: 'e2e-key-uuid',
        passenger: {
          create: { name: 'Passageiro Uuid', document: 'e2e-doc-uuid' },
        },
      },
      include: { passenger: true },
    });

    expect(created.id).toMatch(UUID_REGEX);
    expect(created.passenger.id).toMatch(UUID_REGEX);
  });
});
