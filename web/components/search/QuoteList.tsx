'use client';

import type { SearchResponseQuote } from '@/lib/search/api';
import { QuoteCard } from './QuoteCard';

export interface QuoteListProps {
  quotes: SearchResponseQuote[];
}

export function QuoteList({ quotes }: QuoteListProps) {
  return (
    <ul className="mt-4 space-y-3">
      {quotes.map((quote, index) => (
        <QuoteCard
          key={`${quote.carrier}-${quote.miles}-${quote.taxesBrl}-${index}`}
          quote={quote}
          isBestOffer={index === 0}
        />
      ))}
    </ul>
  );
}
