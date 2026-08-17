import type { SearchResponseQuote } from './api';

export type SupplierId = 'supplier-a' | 'supplier-b' | 'supplier-c';
export type SupplierOutcomeStatus = 'ok' | 'timeout' | 'failed';

export interface SearchFormValues {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD, produzido por <input type="date">
}

export type SearchUiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; quotes: SearchResponseQuote[] }
  | { kind: 'partial'; quotes: SearchResponseQuote[]; missingSuppliers: SupplierId[] }
  | { kind: 'empty' }
  | { kind: 'error' };
