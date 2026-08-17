import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearch } from './use-search';
import { searchQuotes } from '@/lib/search/api';
import type { SearchFormValues } from '@/lib/search/types';

vi.mock('@/lib/search/api', () => ({
  searchQuotes: vi.fn(),
}));

const searchQuotesMock = vi.mocked(searchQuotes);

const values: SearchFormValues = { origin: 'GRU', destination: 'GIG', date: '2026-09-01' };

describe('useSearch', () => {
  beforeEach(() => {
    searchQuotesMock.mockReset();
  });


  it('estado inicial é idle', () => {
    const { result } = renderHook(() => useSearch());
    expect(result.current.uiState).toEqual({ kind: 'idle' });
  });

  it('submit passa por loading e resolve para o estado derivado da resposta', async () => {
    searchQuotesMock.mockResolvedValueOnce({
      status: 'complete',
      quotes: [{ miles: 1000, taxesBrl: 50, carrier: 'LATAM' }],
      suppliers: { 'supplier-a': 'ok', 'supplier-b': 'ok', 'supplier-c': 'ok' },
    });

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.submit(values);
    });

    expect(result.current.uiState).toEqual({ kind: 'loading' });

    await waitFor(() => {
      expect(result.current.uiState.kind).toBe('success');
    });
  });

  it('submit cujo searchQuotes rejeita → estado final error', async () => {
    searchQuotesMock.mockRejectedValueOnce(new Error('falha de rede'));

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.submit(values);
    });

    await waitFor(() => {
      expect(result.current.uiState).toEqual({ kind: 'error' });
    });
  });

  it('retry sem busca anterior não chama searchQuotes', () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.retry();
    });

    expect(searchQuotesMock).not.toHaveBeenCalled();
  });

  it('submit seguido de retry chama searchQuotes duas vezes com o mesmo values', async () => {
    searchQuotesMock.mockResolvedValue({
      status: 'complete',
      quotes: [],
      suppliers: { 'supplier-a': 'ok', 'supplier-b': 'ok', 'supplier-c': 'ok' },
    });

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.submit(values);
    });

    await waitFor(() => {
      expect(result.current.uiState.kind).toBe('empty');
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(searchQuotesMock).toHaveBeenCalledTimes(2);
    });

    expect(searchQuotesMock).toHaveBeenNthCalledWith(1, values);
    expect(searchQuotesMock).toHaveBeenNthCalledWith(2, values);
  });
});
