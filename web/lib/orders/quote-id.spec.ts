import { describe, expect, it } from 'vitest';
import { buildQuoteId } from './quote-id';
import type { SearchResponseQuote } from '@/lib/search/api';

describe('buildQuoteId', () => {
  it('mesma cotação em duas chamadas → mesmo quoteId', () => {
    const quote: SearchResponseQuote = { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' };

    expect(buildQuoteId(quote)).toBe(buildQuoteId({ ...quote }));
  });

  it('cotações com carrier/miles/taxesBrl diferentes → quoteId diferentes', () => {
    const base: SearchResponseQuote = { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' };

    expect(buildQuoteId(base)).not.toBe(buildQuoteId({ ...base, carrier: 'LATAM' }));
    expect(buildQuoteId(base)).not.toBe(buildQuoteId({ ...base, miles: 20000 }));
    expect(buildQuoteId(base)).not.toBe(buildQuoteId({ ...base, taxesBrl: 50 }));
  });
});
