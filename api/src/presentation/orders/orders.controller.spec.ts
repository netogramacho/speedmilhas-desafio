import { Test } from '@nestjs/testing';

import {
  OrdersRepository,
  OrderWithRelations,
} from '../../infrastructure/orders/orders.repository';
import { CreateOrderRequestDto } from './dto/create-order-request.dto';
import { PassengerDto } from './dto/passenger.dto';
import { QuoteDto } from './dto/quote.dto';
import { mapOrderToResponse } from './order-response.mapper';
import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  let ordersRepository: { createOrGetExisting: jest.Mock };
  let controller: OrdersController;

  const passenger: PassengerDto = Object.assign(new PassengerDto(), {
    name: 'Maria da Silva',
    document: '52998224725',
  });

  const quote: QuoteDto = Object.assign(new QuoteDto(), {
    miles: 18500,
    taxesBrl: 38.5,
    carrier: 'GOL',
  });

  const dto: CreateOrderRequestDto = Object.assign(
    new CreateOrderRequestDto(),
    {
      quoteId: 'quote-abc123',
      idempotencyKey: 'e2e-key-1',
      passenger,
      quote,
    },
  );

  const order: OrderWithRelations = {
    id: '8f14e45f-ceea-4e07-9f5a-1c3b2c7a9b11',
    quoteId: 'quote-abc123',
    idempotencyKey: 'e2e-key-1',
    status: 'CONFIRMED',
    passengerId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    quoteSnapshotId: '5b1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f',
    createdAt: new Date('2026-08-17T18:00:00.000Z'),
    updatedAt: new Date('2026-08-17T18:00:00.000Z'),
    passenger: {
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      name: 'Maria da Silva',
      document: '52998224725',
      createdAt: new Date('2026-08-17T18:00:00.000Z'),
    },
    quoteSnapshot: {
      id: '5b1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f',
      miles: 18500,
      taxesBrlCents: 3850,
      carrier: 'GOL',
      createdAt: new Date('2026-08-17T18:00:00.000Z'),
    },
  };

  beforeEach(async () => {
    ordersRepository = {
      createOrGetExisting: jest.fn().mockResolvedValue(order),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersRepository, useValue: ordersRepository }],
    }).compile();

    controller = moduleRef.get(OrdersController);
  });

  it('chama ordersRepository.createOrGetExisting com { quoteId, idempotencyKey, passenger, quote } extraídos do dto', async () => {
    await controller.create(dto);

    expect(ordersRepository.createOrGetExisting).toHaveBeenCalledWith({
      quoteId: 'quote-abc123',
      idempotencyKey: 'e2e-key-1',
      passenger: { name: 'Maria da Silva', document: '52998224725' },
      quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' },
    });
  });

  it('resposta do controller é exatamente mapOrderToResponse(ordem mockada)', async () => {
    const response = await controller.create(dto);

    expect(response).toEqual(mapOrderToResponse(order));
  });
});
