import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { SupplierAClient } from '../suppliers/supplier-a/supplier-a.client';
import { SupplierBClient } from '../suppliers/supplier-b/supplier-b.client';
import { SupplierCClient } from '../suppliers/supplier-c/supplier-c.client';
import { Quote, SupplierQuoteResult } from '../suppliers/types';
import { SearchAggregatorService } from './search-aggregator.service';

const SEARCH_TOTAL_TIMEOUT_MS = 6000;

function quote(overrides: Partial<Quote>): Quote {
  return {
    miles: 10000,
    taxesBrl: 50,
    carrier: 'GOL',
    supplier: 'supplier-a',
    ...overrides,
  };
}

function ok(
  supplier: SupplierQuoteResult['supplier'],
  quotes: Quote[],
): SupplierQuoteResult {
  return { ok: true, supplier, quotes };
}

function failed(
  supplier: SupplierQuoteResult['supplier'],
  reason: 'http_error' | 'unknown_error' | 'rate_limited' | 'timeout',
): SupplierQuoteResult {
  return {
    ok: false,
    supplier,
    failure: { supplier, reason, message: 'boom' },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('SearchAggregatorService', () => {
  let supplierA: { getQuotes: jest.Mock };
  let supplierB: { getQuotes: jest.Mock };
  let supplierC: { getQuotes: jest.Mock };
  let configService: { get: jest.Mock };
  let service: SearchAggregatorService;

  const query = { origin: 'GRU', destination: 'GIG', date: '2026-08-15' };

  beforeEach(async () => {
    supplierA = { getQuotes: jest.fn() };
    supplierB = { getQuotes: jest.fn() };
    supplierC = { getQuotes: jest.fn() };
    configService = {
      get: jest.fn().mockReturnValue(SEARCH_TOTAL_TIMEOUT_MS),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SearchAggregatorService,
        { provide: SupplierAClient, useValue: supplierA },
        { provide: SupplierBClient, useValue: supplierB },
        { provide: SupplierCClient, useValue: supplierC },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(SearchAggregatorService);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('dispara as três chamadas em paralelo, na mesma tick (AC1)', () => {
    supplierA.getQuotes.mockReturnValue(new Promise(() => {}));
    supplierB.getQuotes.mockReturnValue(new Promise(() => {}));
    supplierC.getQuotes.mockReturnValue(new Promise(() => {}));

    void service.search(query);

    expect(supplierA.getQuotes).toHaveBeenCalledTimes(1);
    expect(supplierB.getQuotes).toHaveBeenCalledTimes(1);
    expect(supplierC.getQuotes).toHaveBeenCalledTimes(1);
  });

  it('sucesso nos três: agrega e ordena as cotações, outcomes todos ok', async () => {
    supplierA.getQuotes.mockResolvedValue(
      ok('supplier-a', [quote({ miles: 20000, supplier: 'supplier-a' })]),
    );
    supplierB.getQuotes.mockResolvedValue(
      ok('supplier-b', [quote({ miles: 10000, supplier: 'supplier-b' })]),
    );
    supplierC.getQuotes.mockResolvedValue(
      ok('supplier-c', [quote({ miles: 15000, supplier: 'supplier-c' })]),
    );

    const result = await service.search(query);

    expect(result.quotes.map((q) => q.miles)).toEqual([10000, 15000, 20000]);
    expect(result.outcomes).toEqual([
      { supplier: 'supplier-a', status: 'ok', quotesCount: 1 },
      { supplier: 'supplier-b', status: 'ok', quotesCount: 1 },
      { supplier: 'supplier-c', status: 'ok', quotesCount: 1 },
    ]);
  });

  it('fornecedor com falha classificada (http_error/unknown_error/rate_limited) vira status failed', async () => {
    supplierA.getQuotes.mockResolvedValue(
      ok('supplier-a', [quote({ miles: 20000, supplier: 'supplier-a' })]),
    );
    supplierB.getQuotes.mockResolvedValue(failed('supplier-b', 'http_error'));
    supplierC.getQuotes.mockResolvedValue(
      ok('supplier-c', [quote({ miles: 15000, supplier: 'supplier-c' })]),
    );

    const result = await service.search(query);

    expect(result.outcomes).toEqual([
      { supplier: 'supplier-a', status: 'ok', quotesCount: 1 },
      { supplier: 'supplier-b', status: 'failed', quotesCount: 0 },
      { supplier: 'supplier-c', status: 'ok', quotesCount: 1 },
    ]);
    expect(result.quotes.every((q) => q.supplier !== 'supplier-b')).toBe(true);
  });

  it('fornecedor com reason timeout individual (sem envolver o timer global) vira status timeout', async () => {
    supplierA.getQuotes.mockResolvedValue(
      ok('supplier-a', [quote({ miles: 20000, supplier: 'supplier-a' })]),
    );
    supplierB.getQuotes.mockResolvedValue(failed('supplier-b', 'timeout'));
    supplierC.getQuotes.mockResolvedValue(
      ok('supplier-c', [quote({ miles: 15000, supplier: 'supplier-c' })]),
    );

    const result = await service.search(query);

    expect(result.outcomes[1]).toEqual({
      supplier: 'supplier-b',
      status: 'timeout',
      quotesCount: 0,
    });
  });

  it('corte pelo timer global: marca fornecedor pendente como timeout sem esperar a chamada; resultado tardio é apenas logado (AC2)', async () => {
    const pendingB = deferred<SupplierQuoteResult>();
    supplierA.getQuotes.mockResolvedValue(
      ok('supplier-a', [quote({ miles: 20000, supplier: 'supplier-a' })]),
    );
    supplierB.getQuotes.mockReturnValue(pendingB.promise);
    supplierC.getQuotes.mockResolvedValue(
      ok('supplier-c', [quote({ miles: 15000, supplier: 'supplier-c' })]),
    );

    const loggerWarnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (msg: string) => void } })
        .logger,
      'warn',
    );

    const resultPromise = service.search(query);

    await jest.advanceTimersByTimeAsync(SEARCH_TOTAL_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.outcomes).toEqual([
      { supplier: 'supplier-a', status: 'ok', quotesCount: 1 },
      { supplier: 'supplier-b', status: 'timeout', quotesCount: 0 },
      { supplier: 'supplier-c', status: 'ok', quotesCount: 1 },
    ]);
    expect(result.quotes.every((q) => q.supplier !== 'supplier-b')).toBe(true);

    pendingB.resolve(ok('supplier-b', [quote({ supplier: 'supplier-b' })]));
    await jest.advanceTimersByTimeAsync(0);

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('supplier=supplier-b outcome=late-arrival'),
    );
    // a resposta já devolvida não muda
    expect(result.outcomes[1].status).toBe('timeout');
  });

  it('todos os fornecedores falham/timeout: resolve com quotes vazio, nunca lança (AC4)', async () => {
    supplierA.getQuotes.mockResolvedValue(failed('supplier-a', 'http_error'));
    supplierB.getQuotes.mockResolvedValue(failed('supplier-b', 'timeout'));
    supplierC.getQuotes.mockResolvedValue(
      failed('supplier-c', 'unknown_error'),
    );

    const result = await service.search(query);

    expect(result.quotes).toEqual([]);
    expect(result.outcomes).toEqual([
      { supplier: 'supplier-a', status: 'failed', quotesCount: 0 },
      { supplier: 'supplier-b', status: 'timeout', quotesCount: 0 },
      { supplier: 'supplier-c', status: 'failed', quotesCount: 0 },
    ]);
  });

  it('desempate por taxesBrl quando miles são iguais (AC5)', async () => {
    supplierA.getQuotes.mockResolvedValue(
      ok('supplier-a', [
        quote({ miles: 15000, taxesBrl: 90, supplier: 'supplier-a' }),
      ]),
    );
    supplierB.getQuotes.mockResolvedValue(
      ok('supplier-b', [
        quote({ miles: 15000, taxesBrl: 40, supplier: 'supplier-b' }),
      ]),
    );
    supplierC.getQuotes.mockResolvedValue(ok('supplier-c', []));

    const result = await service.search(query);

    expect(result.quotes.map((q) => q.taxesBrl)).toEqual([40, 90]);
  });

  it('fornecedor com sucesso vazio não é confundido com falha', async () => {
    supplierA.getQuotes.mockResolvedValue(ok('supplier-a', []));
    supplierB.getQuotes.mockResolvedValue(ok('supplier-b', []));
    supplierC.getQuotes.mockResolvedValue(ok('supplier-c', []));

    const result = await service.search(query);

    expect(result.quotes).toEqual([]);
    expect(result.outcomes).toEqual([
      { supplier: 'supplier-a', status: 'ok', quotesCount: 0 },
      { supplier: 'supplier-b', status: 'ok', quotesCount: 0 },
      { supplier: 'supplier-c', status: 'ok', quotesCount: 0 },
    ]);
  });

  it('ordem de outcomes é sempre supplier-a/b/c, independente de quem resolve primeiro', async () => {
    const pendingA = deferred<SupplierQuoteResult>();
    supplierA.getQuotes.mockReturnValue(pendingA.promise);
    supplierB.getQuotes.mockResolvedValue(ok('supplier-b', []));
    supplierC.getQuotes.mockResolvedValue(ok('supplier-c', []));

    const resultPromise = service.search(query);

    await Promise.resolve();
    pendingA.resolve(ok('supplier-a', []));

    const result = await resultPromise;

    expect(result.outcomes.map((o) => o.supplier)).toEqual([
      'supplier-a',
      'supplier-b',
      'supplier-c',
    ]);
  });

  it('todos os cenários resolvem a Promise em vez de rejeitar', async () => {
    supplierA.getQuotes.mockResolvedValue(failed('supplier-a', 'http_error'));
    supplierB.getQuotes.mockResolvedValue(failed('supplier-b', 'http_error'));
    supplierC.getQuotes.mockResolvedValue(failed('supplier-c', 'http_error'));

    await expect(service.search(query)).resolves.toBeDefined();
  });
});
