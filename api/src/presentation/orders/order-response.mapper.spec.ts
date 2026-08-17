import { OrderWithRelations } from '../../infrastructure/orders/orders.repository';
import { mapOrderToResponse } from './order-response.mapper';

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

describe('mapOrderToResponse', () => {
  it('mapeia OrderWithRelations para OrderResponseDto exato, com createdAt serializado como ISO string', () => {
    expect(mapOrderToResponse(order)).toEqual({
      id: '8f14e45f-ceea-4e07-9f5a-1c3b2c7a9b11',
      status: 'CONFIRMED',
      quoteId: 'quote-abc123',
      quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' },
      passenger: { name: 'Maria da Silva', document: '52998224725' },
      createdAt: '2026-08-17T18:00:00.000Z',
    });
  });

  it('converte quoteSnapshot.taxesBrlCents (centavos) para quote.taxesBrl (reais) na resposta', () => {
    expect(mapOrderToResponse(order).quote).toEqual({
      miles: 18500,
      taxesBrl: 38.5,
      carrier: 'GOL',
    });
  });

  it('não inclui campos fora do contrato (ex. idempotencyKey, passengerId, quoteSnapshotId, updatedAt)', () => {
    const response = mapOrderToResponse(order) as unknown as Record<
      string,
      unknown
    >;

    expect(response.idempotencyKey).toBeUndefined();
    expect(response.passengerId).toBeUndefined();
    expect(response.quoteSnapshotId).toBeUndefined();
    expect(response.updatedAt).toBeUndefined();
  });

  it('mapeia status PENDING corretamente', () => {
    const pendingOrder: OrderWithRelations = { ...order, status: 'PENDING' };

    expect(mapOrderToResponse(pendingOrder).status).toBe('PENDING');
  });
});
