import 'dotenv/config';
import { ChildProcess, spawn } from 'child_process';
import path from 'path';

import axios from 'axios';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client';
import { OrderResponseDto } from './dto/order-response.dto';

const VALID_TEST_CPF = '52998224725';

const PORT_A = 3100;
const PORT_B = 3101;
const API_ROOT = path.resolve(__dirname, '../../..');
const KEY_PREFIX = 'orders-two-instances-e2e-';
const HEALTH_CHECK_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 250;
const KILL_GRACE_PERIOD_MS = 5_000;

jest.setTimeout(120_000);

function validBody(idempotencyKey: string): Record<string, unknown> {
  return {
    quoteId: 'quote-abc123',
    idempotencyKey,
    passenger: { name: 'Maria da Silva', document: VALID_TEST_CPF },
    quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' },
  };
}

function spawnInstance(port: number): ChildProcess {
  return spawn('npm', ['run', 'start'], {
    cwd: API_ROOT,
    env: { ...process.env, PORT: String(port) },
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

async function waitUntilReady(port: number): Promise<void> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;

  for (;;) {
    try {
      await axios.post(
        `http://localhost:${port}/orders`,
        {},
        { validateStatus: () => true, timeout: 2000 },
      );
      return;
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(
          `instância na porta ${port} não ficou pronta em ${HEALTH_CHECK_TIMEOUT_MS}ms`,
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS),
      );
    }
  }
}

async function killInstance(child: ChildProcess | undefined): Promise<void> {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const pid = child.pid;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    child.once('exit', finish);

    const timer = setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // grupo já pode ter saído
      }
      finish();
    }, KILL_GRACE_PERIOD_MS);
    timer.unref();

    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

describe('POST /orders (e2e — duas instâncias reais)', () => {
  let prisma: PrismaClient;
  let childA: ChildProcess | undefined;
  let childB: ChildProcess | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await prisma.$connect();

    childA = spawnInstance(PORT_A);
    childB = spawnInstance(PORT_B);

    await Promise.all([waitUntilReady(PORT_A), waitUntilReady(PORT_B)]);
  });

  afterEach(async () => {
    const orders = await prisma.order.findMany({
      where: { idempotencyKey: { startsWith: KEY_PREFIX } },
      select: { passengerId: true, quoteSnapshotId: true },
    });
    const passengerIds = orders.map((order) => order.passengerId);
    const quoteSnapshotIds = orders.map((order) => order.quoteSnapshotId);

    await prisma.order.deleteMany({
      where: { idempotencyKey: { startsWith: KEY_PREFIX } },
    });
    await prisma.passenger.deleteMany({
      where: { id: { in: passengerIds } },
    });
    await prisma.quoteSnapshot.deleteMany({
      where: { id: { in: quoteSnapshotIds } },
    });
  });

  afterAll(async () => {
    try {
      await killInstance(childA);
    } finally {
      await killInstance(childB);
    }

    const orders = await prisma.order.findMany({
      where: { idempotencyKey: { startsWith: KEY_PREFIX } },
      select: { passengerId: true, quoteSnapshotId: true },
    });
    const passengerIds = orders.map((order) => order.passengerId);
    const quoteSnapshotIds = orders.map((order) => order.quoteSnapshotId);

    await prisma.order.deleteMany({
      where: { idempotencyKey: { startsWith: KEY_PREFIX } },
    });
    await prisma.passenger.deleteMany({
      where: { id: { in: passengerIds } },
    });
    await prisma.quoteSnapshot.deleteMany({
      where: { id: { in: quoteSnapshotIds } },
    });

    await prisma.$disconnect();
  });

  for (let round = 1; round <= 5; round++) {
    it(`rodada ${round}/5: duas instâncias reais concorrentes com a mesma idempotencyKey devolvem 201 com o mesmo id; apenas um Order persistido`, async () => {
      const idempotencyKey = `${KEY_PREFIX}round-${round}`;
      const body = validBody(idempotencyKey);

      const [resA, resB] = await Promise.all([
        axios.post<OrderResponseDto>(
          `http://localhost:${PORT_A}/orders`,
          body,
          {
            validateStatus: () => true,
          },
        ),
        axios.post<OrderResponseDto>(
          `http://localhost:${PORT_B}/orders`,
          body,
          {
            validateStatus: () => true,
          },
        ),
      ]);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
      expect(resB.data.id).toBe(resA.data.id);
      expect(resB.data.quote).toEqual(resA.data.quote);

      const orderCount = await prisma.order.count({
        where: { idempotencyKey },
      });
      expect(orderCount).toBe(1);
    });
  }
});
