import type { SearchFormValues, SupplierId, SupplierOutcomeStatus } from './types';

export interface SearchResponseQuote {
  miles: number;
  taxesBrl: number;
  carrier: string;
}

export interface SearchResponseBody {
  status: 'complete' | 'partial';
  quotes: SearchResponseQuote[];
  suppliers: Record<SupplierId, SupplierOutcomeStatus>;
}

export class SearchRequestError extends Error {}

export async function searchQuotes(values: SearchFormValues): Promise<SearchResponseBody> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    throw new SearchRequestError(`POST /search respondeu ${response.status}`);
  }

  return response.json() as Promise<SearchResponseBody>;
}
