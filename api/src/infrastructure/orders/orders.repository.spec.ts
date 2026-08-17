import { Test } from '@nestjs/testing';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderInput, OrdersRepository } from './orders.repository';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.9.1',
    meta: { target },
  });
}

describe('OrdersRepository', () => {
  let prisma: {
    order: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let repository: OrdersRepository;

  const input: CreateOrderInput = {
    quoteId: 'quote-abc123',
    idempotencyKey: 'e2e-key-1',
    passenger: { name: 'Maria da Silva', document: '52998224725' },
    quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' },
  };

  beforeEach(async () => {
    prisma = {
      order: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = moduleRef.get(OrdersRepository);
  });

  it('caminho feliz: create resolve, update é chamado com status CONFIRMED e o id de create, devolve o resultado de update', async () => {
    const created = { id: 'order-1', status: 'PENDING' };
    const updated = { id: 'order-1', status: 'CONFIRMED' };
    prisma.order.create.mockResolvedValue(created);
    prisma.order.update.mockResolvedValue(updated);

    const result = await repository.createOrGetExisting(input);

    expect(prisma.order.create).toHaveBeenCalledWith({
      data: {
        quoteId: input.quoteId,
        idempotencyKey: input.idempotencyKey,
        passenger: { create: input.passenger },
        quoteSnapshot: {
          create: { miles: 18500, taxesBrlCents: 3850, carrier: 'GOL' },
        },
      },
      include: { passenger: true, quoteSnapshot: true },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'CONFIRMED' },
      include: { passenger: true, quoteSnapshot: true },
    });
    expect(result).toBe(updated);
  });

  it('conflito de idempotencyKey: create rejeita com P2002, update não é chamado, findUnique é chamado com idempotencyKey e devolve o existente', async () => {
    const error = p2002(['idempotencyKey']);
    prisma.order.create.mockRejectedValue(error);
    const existing = { id: 'order-existing', status: 'CONFIRMED' };
    prisma.order.findUnique.mockResolvedValue(existing);

    const result = await repository.createOrGetExisting(input);

    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: input.idempotencyKey },
      include: { passenger: true, quoteSnapshot: true },
    });
    expect(result).toBe(existing);
  });

  it('conflito sem registro encontrado (findUnique null): relança o erro original de create', async () => {
    const error = p2002(['idempotencyKey']);
    prisma.order.create.mockRejectedValue(error);
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(repository.createOrGetExisting(input)).rejects.toBe(error);
  });

  it('erro não relacionado a P2002 em create: relançado sem tentar findUnique', async () => {
    const error = new Error('connection lost');
    prisma.order.create.mockRejectedValue(error);

    await expect(repository.createOrGetExisting(input)).rejects.toBe(error);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('P2002 em campo diferente de idempotencyKey (ex. passengerId): relançado sem tentar findUnique', async () => {
    const error = p2002(['passengerId']);
    prisma.order.create.mockRejectedValue(error);

    await expect(repository.createOrGetExisting(input)).rejects.toBe(error);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
