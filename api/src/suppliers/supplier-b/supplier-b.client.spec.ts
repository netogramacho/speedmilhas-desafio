import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';

import { SupplierBClient } from './supplier-b.client';

const SUPPLIER_TIMEOUT_MS = 5000;

function axiosErrorWithResponse(
  status: number,
  headers: Record<string, string> = {},
): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      headers,
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

describe('SupplierBClient', () => {
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };
  let client: SupplierBClient;

  const query = { origin: 'GRU', destination: 'GIG', date: '2026-08-15' };

  beforeEach(async () => {
    httpService = { get: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(SUPPLIER_TIMEOUT_MS) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SupplierBClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = moduleRef.get(SupplierBClient);
    // Sleep real deixaria os testes lentos e dependentes de timing; mockamos o método interno
    // para resolver de imediato, mantendo o cálculo de orçamento (que depende de Date.now, não
    // do sleep em si) sob controle explícito de cada teste.
    jest
      .spyOn(
        client as unknown as { sleep: (ms: number) => Promise<void> },
        'sleep',
      )
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chama GET /supplier-b/search com os params from/to/day', async () => {
    httpService.get.mockReturnValue(of({ data: { dados: [] } }));

    await client.getQuotes(query);

    expect(httpService.get).toHaveBeenCalledWith('/supplier-b/search', {
      params: { from: 'GRU', to: 'GIG', day: '2026-08-15' },
    });
  });

  it('sucesso 200 (sem 429): devolve ok:true com as cotações normalizadas, 1 chamada só', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          dados: [
            { pontos: 18500, taxa: { valor: 75.51, moeda: 'BRL' }, cia: 'GOL' },
          ],
        },
      }),
    );

    const result = await client.getQuotes(query);

    expect(result).toEqual({
      ok: true,
      supplier: 'supplier-b',
      quotes: [
        {
          miles: 18500,
          taxesBrl: 75.51,
          carrier: 'GOL',
          supplier: 'supplier-b',
        },
      ],
    });
    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('erro 500, sem retry: devolve ok:false com reason http_error e httpStatus 500, 1 chamada só', async () => {
    httpService.get.mockReturnValue(
      throwError(() => axiosErrorWithResponse(500)),
    );

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.supplier).toBe('supplier-b');
      expect(result.failure.reason).toBe('http_error');
      expect(result.failure.httpStatus).toBe(500);
      expect(typeof result.failure.message).toBe('string');
      expect(result.failure.message.length).toBeGreaterThan(0);
    }
    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('timeout, sem retry: devolve ok:false com reason timeout, 1 chamada só', async () => {
    httpService.get.mockReturnValue(throwError(() => axiosTimeoutError()));

    const result = await client.getQuotes(query);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('timeout');
      expect(result.failure.httpStatus).toBeUndefined();
    }
    expect(httpService.get).toHaveBeenCalledTimes(1);
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
    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  describe('retry único do 429', () => {
    it('orçamento suficiente, retry bem-sucedido: devolve ok:true com timeout clampado na 2ª chamada', async () => {
      // startedAt=1000, checagem do orçamento em 1100 -> elapsedMs=100, remainingBudgetMs=4900.
      // Retry-After: '1' -> retryAfterMs=1000 -> waitMs=1000 -> retryTimeoutMs=3900.
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100)
        .mockReturnValue(1200);

      httpService.get
        .mockReturnValueOnce(
          throwError(() => axiosErrorWithResponse(429, { 'retry-after': '1' })),
        )
        .mockReturnValueOnce(
          of({
            data: {
              dados: [
                {
                  pontos: 22000,
                  taxa: { valor: 98.36, moeda: 'BRL' },
                  cia: 'LATAM',
                },
              ],
            },
          }),
        );

      const result = await client.getQuotes(query);

      expect(result).toEqual({
        ok: true,
        supplier: 'supplier-b',
        quotes: [
          {
            miles: 22000,
            taxesBrl: 98.36,
            carrier: 'LATAM',
            supplier: 'supplier-b',
          },
        ],
      });
      expect(httpService.get).toHaveBeenCalledTimes(2);
      expect(httpService.get).toHaveBeenNthCalledWith(2, '/supplier-b/search', {
        params: { from: 'GRU', to: 'GIG', day: '2026-08-15' },
        timeout: 3900,
      });
    });

    it('orçamento suficiente, retry falha com 500: resultado final reflete a última tentativa (não rate_limited)', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100)
        .mockReturnValue(1200);

      httpService.get
        .mockReturnValueOnce(
          throwError(() => axiosErrorWithResponse(429, { 'retry-after': '1' })),
        )
        .mockReturnValueOnce(throwError(() => axiosErrorWithResponse(500)));

      const result = await client.getQuotes(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason).toBe('http_error');
        expect(result.failure.httpStatus).toBe(500);
      }
      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('orçamento suficiente, retry falha com timeout: resultado final reflete a última tentativa (não rate_limited)', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100)
        .mockReturnValue(1200);

      httpService.get
        .mockReturnValueOnce(
          throwError(() => axiosErrorWithResponse(429, { 'retry-after': '1' })),
        )
        .mockReturnValueOnce(throwError(() => axiosTimeoutError()));

      const result = await client.getQuotes(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason).toBe('timeout');
        expect(result.failure.httpStatus).toBeUndefined();
      }
      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('orçamento suficiente, retry também 429: resultado final rate_limited, nunca uma 3ª chamada', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100)
        .mockReturnValue(1200);

      httpService.get
        .mockReturnValueOnce(
          throwError(() => axiosErrorWithResponse(429, { 'retry-after': '1' })),
        )
        .mockReturnValueOnce(
          throwError(() => axiosErrorWithResponse(429, { 'retry-after': '1' })),
        );

      const result = await client.getQuotes(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason).toBe('rate_limited');
        expect(result.failure.httpStatus).toBe(429);
      }
      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('sem orçamento (elapsed já consumiu tudo): falha direta rate_limited, sem 2ª chamada', async () => {
      // elapsedMs = 5000 (== timeout) -> remainingBudgetMs = 0 <= 0.
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(6000)
        .mockReturnValue(6100);

      httpService.get.mockReturnValueOnce(
        throwError(() => axiosErrorWithResponse(429, { 'retry-after': '1' })),
      );

      const result = await client.getQuotes(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason).toBe('rate_limited');
        expect(result.failure.httpStatus).toBe(429);
      }
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('espera do Retry-After consome o orçamento inteiro: falha direta rate_limited, sem 2ª chamada', async () => {
      // elapsedMs=4500 -> remainingBudgetMs=500; retryAfterMs=1000 -> waitMs=min(1000,500)=500;
      // retryTimeoutMs=500-500=0 <= 0.
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(5500)
        .mockReturnValue(5600);

      httpService.get.mockReturnValueOnce(
        throwError(() => axiosErrorWithResponse(429, { 'retry-after': '1' })),
      );

      const result = await client.getQuotes(query);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.reason).toBe('rate_limited');
        expect(result.failure.httpStatus).toBe(429);
      }
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('Retry-After ausente/inválido: aplica fallback de 1000ms e segue o fluxo normal', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100)
        .mockReturnValue(1200);

      httpService.get
        .mockReturnValueOnce(throwError(() => axiosErrorWithResponse(429, {})))
        .mockReturnValueOnce(of({ data: { dados: [] } }));

      const result = await client.getQuotes(query);

      expect(result.ok).toBe(true);
      // remainingBudgetMs=4900; fallback retryAfterMs=1000 -> waitMs=1000 -> retryTimeoutMs=3900.
      expect(httpService.get).toHaveBeenNthCalledWith(2, '/supplier-b/search', {
        params: { from: 'GRU', to: 'GIG', day: '2026-08-15' },
        timeout: 3900,
      });
    });
  });

  it('todos os cenários de falha resolvem a Promise em vez de rejeitar', async () => {
    httpService.get.mockReturnValue(
      throwError(() => axiosErrorWithResponse(500)),
    );

    await expect(client.getQuotes(query)).resolves.toBeDefined();
  });
});
