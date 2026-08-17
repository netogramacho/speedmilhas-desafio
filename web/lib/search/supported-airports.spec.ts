import { describe, expect, it } from 'vitest';
import { SUPPORTED_AIRPORTS } from './supported-airports';

describe('SUPPORTED_AIRPORTS', () => {
  it('tem exatamente os 8 códigos do README, sem duplicata', () => {
    expect(SUPPORTED_AIRPORTS).toHaveLength(8);
    expect(new Set(SUPPORTED_AIRPORTS).size).toBe(8);
    expect([...SUPPORTED_AIRPORTS].sort()).toEqual(
      ['BSB', 'CNF', 'FOR', 'GIG', 'GRU', 'POA', 'REC', 'SSA'].sort(),
    );
  });
});
