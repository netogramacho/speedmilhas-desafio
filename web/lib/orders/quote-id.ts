import type { SearchResponseQuote } from '@/lib/search/api';

export function buildQuoteId(quote: SearchResponseQuote): string {
  return `${quote.carrier}-${quote.miles}-${quote.taxesBrl}`;
}
