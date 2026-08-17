import { Quote } from '../suppliers/types';
import { sortQuotes } from './sort-quotes';

function quote(overrides: Partial<Quote>): Quote {
  return {
    miles: 10000,
    taxesBrl: 50,
    carrier: 'GOL',
    supplier: 'supplier-a',
    ...overrides,
  };
}

describe('sortQuotes', () => {
  it('ordena por miles ascendente', () => {
    const quotes = [
      quote({ miles: 30000 }),
      quote({ miles: 10000 }),
      quote({ miles: 20000 }),
    ];

    expect(sortQuotes(quotes).map((q) => q.miles)).toEqual([
      10000, 20000, 30000,
    ]);
  });

  it('em empate de miles, desempata por taxesBrl ascendente', () => {
    const quotes = [
      quote({ miles: 15000, taxesBrl: 90 }),
      quote({ miles: 15000, taxesBrl: 40 }),
      quote({ miles: 15000, taxesBrl: 60 }),
    ];

    expect(sortQuotes(quotes).map((q) => q.taxesBrl)).toEqual([40, 60, 90]);
  });

  it('array vazio devolve array vazio', () => {
    expect(sortQuotes([])).toEqual([]);
  });

  it('não muta o array recebido', () => {
    const quotes = [quote({ miles: 30000 }), quote({ miles: 10000 })];
    const original = [...quotes];

    sortQuotes(quotes);

    expect(quotes).toEqual(original);
  });
});
