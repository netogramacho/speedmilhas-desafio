'use client';

import { useTranslations } from 'next-intl';
import type { SearchUiState } from '@/lib/search/types';
import { LoadingSkeleton } from './LoadingSkeleton';
import { PartialWarningBanner } from './PartialWarningBanner';
import { QuoteList } from './QuoteList';

export interface SearchResultsPanelProps {
  state: SearchUiState;
  onRetry: () => void;
}

export function SearchResultsPanel({ state, onRetry }: SearchResultsPanelProps) {
  const t = useTranslations('search.states');

  switch (state.kind) {
    case 'idle':
      return null;

    case 'loading':
      return <LoadingSkeleton />;

    case 'success':
      return <QuoteList quotes={state.quotes} />;

    case 'partial':
      return (
        <div>
          <PartialWarningBanner missingSuppliers={state.missingSuppliers} />
          {state.quotes.length === 0 ? (
            <p className="mt-4 text-slate-600">{t('partialEmpty')}</p>
          ) : (
            <QuoteList quotes={state.quotes} />
          )}
        </div>
      );

    case 'empty':
      return <p className="mt-6 text-slate-600">{t('empty')}</p>;

    case 'error':
      return (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-900">
          <p>{t('error')}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-md bg-red-700 px-4 py-2 text-white"
          >
            {t('retry')}
          </button>
        </div>
      );
  }
}
