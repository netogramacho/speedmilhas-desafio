'use client';

import { useSearch } from '@/hooks/use-search';
import { SearchForm } from './SearchForm';
import { SearchResultsPanel } from './SearchResultsPanel';

export function SearchPage() {
  const { uiState, submit, retry } = useSearch();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="max-w-sm">
        <SearchForm onSubmit={submit} disabled={uiState.kind === 'loading'} />
      </div>
      <SearchResultsPanel state={uiState} onRetry={retry} />
    </main>
  );
}
