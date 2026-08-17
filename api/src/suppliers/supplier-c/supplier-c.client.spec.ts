import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';

import { SupplierCClient } from './supplier-c.client';

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
  return new AxiosError(
    'timeout of 5000ms exceeded',
    'ECONNABORTED',
    undefined,
    undefined,
    undefined,
  );
}

function axiosNetworkErrorWithoutResponse(): AxiosError {
  return new AxiosError(
    'Network Error',
    'ERR_NETWORK',
    undefined,
    undefined,
    undefined,
  );
}

describe('SupplierCClient', () => {
  let httpService: { post: jest.Mock };
  let client: SupplierCClient;

  const query = { origin: 'GRU', destination: 'GIG', date: '2026-08-15' };

  beforeEach(async () => {
    httpService = { post: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SupplierCClient,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    client = moduleRef.get(SupplierCClient);
  });

  it('chama POST /supplier-c/v2/quotes com body { origin, destination, date }', async () => {
    httpService.post.mockReturnValue(of({ data: { data: [] } }));

    await client.getQuotes(query);

    expect(httpService.post).toHaveBeenCalledWith('/supplier-c/v2/quotes', {
      origin: 'GRU',
      destination: 'GIG',
      date: '2026-08-15',
    });
  });

  it('sucesso 200, payload limpo: devolve ok:true com as cotações normalizadas', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          data: [
            { price_miles: 18500, fee: 75.51, airline_code: 'LA' },
            { price_miles: 22000, fee: 98.36, airline_code: 'G3' },
          ],
        },
      }),
    );

    const result = await client.getQuotes(query);

    expect(result).toEqual({
      ok: true,
      supplier: 'supplier-c',
      quotes: [
        {
          miles: 18500,
          taxesBrl: 75.51,
          carrier: 'LATAM',
          supplier: 'supplier-c',
        },
        {
          miles: 22000,
          taxesBrl: 98.36,
          carrier: 'GOL',
          supplier: 'supplier-c',
        },
      ],
    });
  });

  it('sucesso 200, data: []: devolve ok:true com quotes vazio', async () => {
    httpService.post.mockReturnValue(of({ data: { data: [] } }));

    const result = await client.getQuotes(query);

    expect(result).toEqual({ ok: true, supplier: 'supplier-c', quotes: [] });
  });

  it('sucesso 200, item sujo (fee: null) misturado com item válido: devolve só o item válido', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          data: [
            { price_miles: 18500, fee: null, airline_code: 'LA' },
            { price_miles: 22000, fee: 98.36, airline_code: 'G3' },
          ],
        },
      }),
    );

    const result = await client.getQuotes(query);

    expect(result).toEqual({
      ok: true,
      supplier: 'supplier-c',
      quotes: [
        {
          miles: 22000,
          taxesBrl: 98.36,
          carrier: 'GOL',
          supplier: 'supplier-c',
        },
      ],
    });
  });

  it('sucesso 200, todos os itens sujos: devolve ok:true com quotes vazio (não ok:false)', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          data: [
            { price_miles: '17500', fee: 75.51, airline_code: 'LA' },
            { price_miles: 22000, fee: null, airline_code: 'G3' },
          ],
        },
      }),
    );

    const result = await client.getQuotes(query);

    expect(result).toEqual({ ok: true, supplier: 'supplier-c', quotes: [] });
  });

  it('erro 500: devolve ok:false com reason http_error e httpStatus 500, sem lançar', async () => {
    httpService.post.mockReturnValue(
      throwError(() => axiosErrorWithResponse(500)),
    );

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.supplier).toBe('supplier-c');
      expect(result.failure.reason).toBe('http_error');
      expect(result.failure.httpStatus).toBe(500);
      expect(typeof result.failure.message).toBe('string');
      expect(result.failure.message.length).toBeGreaterThan(0);
    }
  });

  it('timeout: devolve ok:false com reason timeout, sem lançar', async () => {
    httpService.post.mockReturnValue(throwError(() => axiosTimeoutError()));

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('timeout');
      expect(result.failure.httpStatus).toBeUndefined();
    }
  });

  it('erro desconhecido/rede (sem response, sem ECONNABORTED): devolve reason unknown_error', async () => {
    httpService.post.mockReturnValue(
      throwError(() => new Error('network down')),
    );

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('unknown_error');
      expect(result.failure.message).toBe('network down');
    }
  });

  it('erro de rede do axios (AxiosError sem response e sem ECONNABORTED): devolve reason unknown_error', async () => {
    httpService.post.mockReturnValue(
      throwError(() => axiosNetworkErrorWithoutResponse()),
    );

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('unknown_error');
      expect(result.failure.httpStatus).toBeUndefined();
      expect(result.failure.message).toBe('Network Error');
    }
  });

  it('erro não-Error lançado (valor cru, ex. string): devolve reason unknown_error com message convertida via String()', async () => {
    httpService.post.mockReturnValue(throwError(() => 'boom'));

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('unknown_error');
      expect(result.failure.message).toBe('boom');
    }
  });

  it('todos os cenários de falha resolvem a Promise em vez de rejeitar', async () => {
    httpService.post.mockReturnValue(
      throwError(() => axiosErrorWithResponse(500)),
    );

    await expect(client.getQuotes(query)).resolves.toBeDefined();
  });
});
