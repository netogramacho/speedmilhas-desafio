import { describe, expect, it } from 'vitest';
import { deriveSearchUiState } from './derive-ui-state';
import type { SearchResponseBody } from './api';

describe('deriveSearchUiState', () => {
  it('status complete com quotes não vazio → success', () => {
    const response: SearchResponseBody = {
      status: 'complete',
      quotes: [{ miles: 1000, taxesBrl: 50, carrier: 'LATAM' }],
      suppliers: { 'supplier-a': 'ok', 'supplier-b': 'ok', 'supplier-c': 'ok' },
    };

    expect(deriveSearchUiState(response)).toEqual({
      kind: 'success',
      quotes: response.quotes,
    });
  });

  it('status complete com quotes vazio → empty', () => {
    const response: SearchResponseBody = {
      status: 'complete',
      quotes: [],
      suppliers: { 'supplier-a': 'ok', 'supplier-b': 'ok', 'supplier-c': 'ok' },
    };

    expect(deriveSearchUiState(response)).toEqual({ kind: 'empty' });
  });

  it('status partial com quotes não vazio e 1 fornecedor não-ok → partial com missingSuppliers', () => {
    const response: SearchResponseBody = {
      status: 'partial',
      quotes: [{ miles: 1000, taxesBrl: 50, carrier: 'LATAM' }],
      suppliers: { 'supplier-a': 'ok', 'supplier-b': 'timeout', 'supplier-c': 'ok' },
    };

    expect(deriveSearchUiState(response)).toEqual({
      kind: 'partial',
      quotes: response.quotes,
      missingSuppliers: ['supplier-b'],
    });
  });

  it('status partial com quotes vazio e os 3 fornecedores não-ok → error', () => {
    const response: SearchResponseBody = {
      status: 'partial',
      quotes: [],
      suppliers: { 'supplier-a': 'failed', 'supplier-b': 'timeout', 'supplier-c': 'failed' },
    };

    expect(deriveSearchUiState(response)).toEqual({ kind: 'error' });
  });

  it('status partial com quotes vazio e só 1 fornecedor não-ok → partial, não error', () => {
    const response: SearchResponseBody = {
      status: 'partial',
      quotes: [],
      suppliers: { 'supplier-a': 'ok', 'supplier-b': 'timeout', 'supplier-c': 'ok' },
    };

    expect(deriveSearchUiState(response)).toEqual({
      kind: 'partial',
      quotes: [],
      missingSuppliers: ['supplier-b'],
    });
  });

  it('status partial com quotes vazio e 2 fornecedores não-ok → partial, não error', () => {
    const response: SearchResponseBody = {
      status: 'partial',
      quotes: [],
      suppliers: { 'supplier-a': 'ok', 'supplier-b': 'timeout', 'supplier-c': 'failed' },
    };

    expect(deriveSearchUiState(response)).toEqual({
      kind: 'partial',
      quotes: [],
      missingSuppliers: ['supplier-b', 'supplier-c'],
    });
  });
});
