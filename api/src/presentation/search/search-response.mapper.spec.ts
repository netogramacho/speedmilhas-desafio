import { Quote } from '../../domain/suppliers/types';
import {
  AggregatedSearchResult,
  SupplierOutcome,
} from '../../domain/search/types';
import { mapAggregatedResultToResponse } from './search-response.mapper';

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    miles: 10000,
    taxesBrl: 50,
    carrier: 'GOL',
    supplier: 'supplier-a',
    ...overrides,
  };
}

function outcome(overrides: Partial<SupplierOutcome>): SupplierOutcome {
  return {
    supplier: 'supplier-a',
    status: 'ok',
    quotesCount: 1,
    ...overrides,
  };
}

describe('mapAggregatedResultToResponse', () => {
  it('3 outcomes ok: status complete', () => {
    const result: AggregatedSearchResult = {
      quotes: [quote()],
      outcomes: [
        outcome({ supplier: 'supplier-a', status: 'ok' }),
        outcome({ supplier: 'supplier-b', status: 'ok' }),
        outcome({ supplier: 'supplier-c', status: 'ok' }),
      ],
    };

    const response = mapAggregatedResultToResponse(result);

    expect(response.status).toBe('complete');
  });

  it('1 outcome não-ok (timeout ou failed), outros ok: status partial', () => {
    const result: AggregatedSearchResult = {
      quotes: [
        quote({ supplier: 'supplier-a' }),
        quote({ supplier: 'supplier-c' }),
      ],
      outcomes: [
        outcome({ supplier: 'supplier-a', status: 'ok' }),
        outcome({ supplier: 'supplier-b', status: 'timeout', quotesCount: 0 }),
        outcome({ supplier: 'supplier-c', status: 'ok' }),
      ],
    };

    const response = mapAggregatedResultToResponse(result);

    expect(response.status).toBe('partial');
  });

  it('3 outcomes não-ok: status partial, quotes vazio', () => {
    const result: AggregatedSearchResult = {
      quotes: [],
      outcomes: [
        outcome({ supplier: 'supplier-a', status: 'failed', quotesCount: 0 }),
        outcome({ supplier: 'supplier-b', status: 'timeout', quotesCount: 0 }),
        outcome({ supplier: 'supplier-c', status: 'failed', quotesCount: 0 }),
      ],
    };

    const response = mapAggregatedResultToResponse(result);

    expect(response.status).toBe('partial');
    expect(response.quotes).toEqual([]);
  });

  it('quotes mapeadas só com { miles, taxesBrl, carrier }, sem supplier', () => {
    const result: AggregatedSearchResult = {
      quotes: [
        quote({
          miles: 18500,
          taxesBrl: 75.51,
          carrier: 'GOL',
          supplier: 'supplier-a',
        }),
      ],
      outcomes: [
        outcome({ supplier: 'supplier-a', status: 'ok' }),
        outcome({ supplier: 'supplier-b', status: 'ok' }),
        outcome({ supplier: 'supplier-c', status: 'ok' }),
      ],
    };

    const response = mapAggregatedResultToResponse(result);

    expect(response.quotes).toEqual([
      { miles: 18500, taxesBrl: 75.51, carrier: 'GOL' },
    ]);
    expect(response.quotes[0]).not.toHaveProperty('supplier');
  });

  it('suppliers tem as 3 chaves SupplierId com o status do outcome correspondente', () => {
    const result: AggregatedSearchResult = {
      quotes: [],
      outcomes: [
        outcome({ supplier: 'supplier-a', status: 'ok' }),
        outcome({ supplier: 'supplier-b', status: 'timeout', quotesCount: 0 }),
        outcome({ supplier: 'supplier-c', status: 'failed', quotesCount: 0 }),
      ],
    };

    const response = mapAggregatedResultToResponse(result);

    expect(response.suppliers).toEqual({
      'supplier-a': 'ok',
      'supplier-b': 'timeout',
      'supplier-c': 'failed',
    });
  });
});
