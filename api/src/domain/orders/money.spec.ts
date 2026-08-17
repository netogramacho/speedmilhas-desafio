import { centsToReais, reaisToCents } from './money';

describe('reaisToCents', () => {
  it('converte 38.50 para 3850', () => {
    expect(reaisToCents(38.5)).toBe(3850);
  });

  it('converte 0 para 0', () => {
    expect(reaisToCents(0)).toBe(0);
  });

  it('converte 75.51 para 7551, protegendo contra imprecisão de ponto flutuante', () => {
    expect(reaisToCents(75.51)).toBe(7551);
  });
});

describe('centsToReais', () => {
  it('converte 3850 para 38.5', () => {
    expect(centsToReais(3850)).toBe(38.5);
  });

  it('converte 0 para 0', () => {
    expect(centsToReais(0)).toBe(0);
  });
});

describe('round-trip', () => {
  it('centsToReais(reaisToCents(38.50)) === 38.5', () => {
    expect(centsToReais(reaisToCents(38.5))).toBe(38.5);
  });
});
