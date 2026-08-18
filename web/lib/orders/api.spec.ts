import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrder, CreateOrderError } from './api';
import type { CreateOrderInput } from './types';

const input: CreateOrderInput = {
  quoteId: 'GOL-18500-38.5',
  idempotencyKey: '3f7e9b1a-2c4d-4e5f-8a6b-1d2e3f4a5b6c',
  passenger: { name: 'Maria da Silva', document: '52998224725' },
  quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' },
};

describe('createOrder', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resposta 201 → resolve com o corpo parseado', async () => {
    const body = {
      id: 'order-1',
      status: 'PENDING',
      quoteId: input.quoteId,
      quote: input.quote,
      passenger: input.passenger,
      createdAt: '2026-08-17T00:00:00.000Z',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(body),
    } as Response);

    await expect(createOrder(input)).resolves.toEqual(body);
  });

  it('resposta 400 com envelope de erro → rejeita com CreateOrderError com code/fields do corpo', async () => {
    const errorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Requisição inválida.',
        fields: [{ field: 'passenger.document', code: 'INVALID_CPF', message: 'CPF inválido' }],
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve(errorBody),
    } as Response);

    await expect(createOrder(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Requisição inválida.',
      fields: errorBody.error.fields,
    });
  });

  it('resposta 400 com envelope de erro → rejeita com uma instância de CreateOrderError', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { code: 'VALIDATION_ERROR', message: 'Requisição inválida.' } }),
    } as Response);

    await expect(createOrder(input)).rejects.toBeInstanceOf(CreateOrderError);
  });

  it('resposta não-2xx com corpo não-JSON → rejeita com CreateOrderError(UNKNOWN_ERROR, ...)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('corpo não é JSON')),
    } as unknown as Response);

    await expect(createOrder(input)).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
      message: 'POST /orders respondeu 502',
    });
  });

  it('fetch rejeita (erro de rede) → createOrder rejeita com o mesmo erro original', async () => {
    const networkError = new Error('falha de rede');
    vi.mocked(fetch).mockRejectedValueOnce(networkError);

    await expect(createOrder(input)).rejects.toBe(networkError);
  });
});
