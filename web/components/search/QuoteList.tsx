'use client';

import { useTranslations } from 'next-intl';
import type { SearchResponseQuote } from '@/lib/search/api';

export interface QuoteListProps {
  quotes: SearchResponseQuote[];
}

export function QuoteList({ quotes }: QuoteListProps) {
  const t = useTranslations('search.quote');

  return (
    <ul className="mt-4 space-y-3">
      {quotes.map((quote, index) => (
        <li
          key={`${quote.carrier}-${quote.miles}-${quote.taxesBrl}-${index}`}
          className="rounded-md border border-slate-200 p-4"
        >
          <p className="font-semibold">{t('miles', { miles: quote.miles })}</p>
          <p className="text-slate-600">{t('taxes', { taxes: quote.taxesBrl })}</p>
          <p className="text-slate-600">{t('carrier', { carrier: quote.carrier })}</p>
        </li>
      ))}
    </ul>
  );
}
