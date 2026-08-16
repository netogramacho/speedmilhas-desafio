import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';

import { SupplierAClient } from './supplier-a.client';

function axiosErrorWithResponse(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: undefined,
    },
  );
}

function axiosTimeoutError(): AxiosError {
  const error = new AxiosError(
    'timeout of 5000ms exceeded',
    'ECONNABORTED',
    undefined,
    undefined,
    undefined,
  );
  return error;
}

describe('SupplierAClient', () => {
  let httpService: { get: jest.Mock };
  let client: SupplierAClient;

  const query = { origin: 'GRU', destination: 'GIG', date: '2026-08-15' };

  beforeEach(async () => {
    httpService = { get: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SupplierAClient,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    client = moduleRef.get(SupplierAClient);
  });

  it('chama GET /supplier-a/quotes com os params origin/destination/date', async () => {
    httpService.get.mockReturnValue(of({ data: { results: [] } }));

    await client.getQuotes(query);

    expect(httpService.get).toHaveBeenCalledWith('/supplier-a/quotes', {
      params: { origin: 'GRU', destination: 'GIG', date: '2026-08-15' },
    });
  });

  it('sucesso 200: devolve ok:true com as cotações normalizadas', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [
            { miles: 18500, taxes_brl: 75.51, carrier: 'GOL' },
            { miles: 22000, taxes_brl: 98.36, carrier: 'LATAM' },
          ],
        },
      }),
    );

    const result = await client.getQuotes(query);

    expect(result).toEqual({
      ok: true,
      supplier: 'supplier-a',
      quotes: [
        {
          miles: 18500,
          taxesBrl: 75.51,
          carrier: 'GOL',
          supplier: 'supplier-a',
        },
        {
          miles: 22000,
          taxesBrl: 98.36,
          carrier: 'LATAM',
          supplier: 'supplier-a',
        },
      ],
    });
  });

  it('erro 500: devolve ok:false com reason http_error e httpStatus 500, sem lançar', async () => {
    httpService.get.mockReturnValue(
      throwError(() => axiosErrorWithResponse(500)),
    );

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.supplier).toBe('supplier-a');
      expect(result.failure.reason).toBe('http_error');
      expect(result.failure.httpStatus).toBe(500);
      expect(typeof result.failure.message).toBe('string');
      expect(result.failure.message.length).toBeGreaterThan(0);
    }
  });

  it('timeout: devolve ok:false com reason timeout, sem lançar', async () => {
    httpService.get.mockReturnValue(throwError(() => axiosTimeoutError()));

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('timeout');
      expect(result.failure.httpStatus).toBeUndefined();
    }
  });

  it('erro desconhecido/rede (sem response, sem ECONNABORTED): devolve reason unknown_error', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('network down')),
    );

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('unknown_error');
      expect(result.failure.message).toBe('network down');
    }
  });

  it('todos os cenários de falha resolvem a Promise em vez de rejeitar', async () => {
    httpService.get.mockReturnValue(
      throwError(() => axiosErrorWithResponse(500)),
    );

    await expect(client.getQuotes(query)).resolves.toBeDefined();
  });
});
