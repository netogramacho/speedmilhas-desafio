import { Logger } from '@nestjs/common';

import { normalizeSupplierA } from './supplier-a.normalizer';
import { SupplierARawResponse } from './supplier-a.types';

function silentLogger(): {
  logger: Logger;
  warnSpy: jest.SpiedFunction<Logger['warn']>;
} {
  const logger = new Logger('test');
  const warnSpy = jest
    .spyOn(logger, 'warn')
    .mockImplementation(() => undefined);
  return { logger, warnSpy };
}

describe('normalizeSupplierA', () => {
  it('mapeia miles, taxesBrl, carrier (passthrough) e supplier para cada item', () => {
    const raw: SupplierARawResponse = {
      results: [
        { miles: 18500, taxes_brl: 75.51, carrier: 'GOL' },
        { miles: 22000, taxes_brl: 98.36, carrier: 'LATAM' },
      ],
    };

    const quotes = normalizeSupplierA(raw, silentLogger().logger);

    expect(quotes).toEqual([
      { miles: 18500, taxesBrl: 75.51, carrier: 'GOL', supplier: 'supplier-a' },
      {
        miles: 22000,
        taxesBrl: 98.36,
        carrier: 'LATAM',
        supplier: 'supplier-a',
      },
    ]);
  });

  it('retorna [] para results vazio, sem lançar', () => {
    const raw: SupplierARawResponse = { results: [] };

    expect(normalizeSupplierA(raw, silentLogger().logger)).toEqual([]);
  });

  it('mapeia normalmente um carrier fora do enum conhecido, sem descartar e sem lançar', () => {
    const raw: SupplierARawResponse = {
      results: [{ miles: 10000, taxes_brl: 50, carrier: 'AVIANCA' }],
    };
    const { logger, warnSpy } = silentLogger();

    const quotes = normalizeSupplierA(raw, logger);

    expect(quotes).toEqual([
      {
        miles: 10000,
        taxesBrl: 50,
        carrier: 'AVIANCA',
        supplier: 'supplier-a',
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
