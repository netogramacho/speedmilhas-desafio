import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../test/render-with-intl';
import { QuoteList } from './QuoteList';
import type { SearchResponseQuote } from '@/lib/search/api';

describe('QuoteList', () => {
  it('2+ cotações → só o primeiro item tem o badge "Melhor oferta"', () => {
    const quotes: SearchResponseQuote[] = [
      { miles: 1000, taxesBrl: 50, carrier: 'LATAM' },
      { miles: 2000, taxesBrl: 30, carrier: 'GOL' },
    ];

    renderWithIntl(<QuoteList quotes={quotes} />);

    expect(screen.getAllByText('Melhor oferta')).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('1 cotação → o único item tem o badge "Melhor oferta"', () => {
    const quotes: SearchResponseQuote[] = [{ miles: 1000, taxesBrl: 50, carrier: 'LATAM' }];

    renderWithIntl(<QuoteList quotes={quotes} />);

    expect(screen.getByText('Melhor oferta')).toBeInTheDocument();
  });

  it('lista vazia → nenhum item renderizado', () => {
    renderWithIntl(<QuoteList quotes={[]} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
