import { describe, expect, it } from 'vitest';
import { formatCurrencyBrl, formatMiles } from './number';

describe('formatMiles', () => {
  it('formata milhares com separador de milhar pt-BR', () => {
    expect(formatMiles(1000)).toBe('1.000');
  });

  it('formata dezenas de milhar com separador de milhar pt-BR', () => {
    expect(formatMiles(18500)).toBe('18.500');
  });

  it('formata zero sem separador', () => {
    expect(formatMiles(0)).toBe('0');
  });
});

describe('formatCurrencyBrl', () => {
  // ICU/Node insere non-breaking space (U+00A0) entre "R$" e o valor, não espaço comum.
  const nbsp = ' ';

  it('formata valor com centavos usando vírgula decimal e símbolo R$', () => {
    expect(formatCurrencyBrl(75.51)).toBe(`R$${nbsp}75,51`);
  });

  it('formata valor inteiro com duas casas decimais', () => {
    expect(formatCurrencyBrl(50)).toBe(`R$${nbsp}50,00`);
  });

  it('formata zero', () => {
    expect(formatCurrencyBrl(0)).toBe(`R$${nbsp}0,00`);
  });
});
