import { useCallback, useRef, useState } from 'react';
import { searchQuotes } from '@/lib/search/api';
import { deriveSearchUiState } from '@/lib/search/derive-ui-state';
import type { SearchFormValues, SearchUiState } from '@/lib/search/types';

export interface UseSearchResult {
  uiState: SearchUiState;
  submit: (values: SearchFormValues) => void;
  retry: () => void;
}

export function useSearch(): UseSearchResult {
  const [uiState, setUiState] = useState<SearchUiState>({ kind: 'idle' });
  const lastParamsRef = useRef<SearchFormValues | null>(null);

  const runSearch = useCallback((values: SearchFormValues) => {
    lastParamsRef.current = values;
    setUiState({ kind: 'loading' });

    searchQuotes(values)
      .then((response) => setUiState(deriveSearchUiState(response)))
      .catch(() => setUiState({ kind: 'error' }));
  }, []);

  const submit = useCallback(
    (values: SearchFormValues) => {
      runSearch(values);
    },
    [runSearch],
  );

  const retry = useCallback(() => {
    if (!lastParamsRef.current) {
      return;
    }
    runSearch(lastParamsRef.current);
  }, [runSearch]);

  return { uiState, submit, retry };
}
