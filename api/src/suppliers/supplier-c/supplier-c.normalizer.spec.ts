import { Logger } from '@nestjs/common';

import { normalizeSupplierC } from './supplier-c.normalizer';
import { SupplierCRawResponse } from './supplier-c.types';

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

describe('normalizeSupplierC', () => {
  it('mapeia price_miles, fee, airline_code (via IATA_TO_CARRIER) e supplier para cada item', () => {
    const raw: SupplierCRawResponse = {
      data: [
        { price_miles: 18500, fee: 75.51, airline_code: 'LA' },
        { price_miles: 22000, fee: 98.36, airline_code: 'G3' },
        { price_miles: 15000, fee: 40, airline_code: 'AD' },
      ],
    };

    const quotes = normalizeSupplierC(raw, silentLogger().logger);

    expect(quotes).toEqual([
      {
        miles: 18500,
        taxesBrl: 75.51,
        carrier: 'LATAM',
        supplier: 'supplier-c',
      },
      { miles: 22000, taxesBrl: 98.36, carrier: 'GOL', supplier: 'supplier-c' },
      { miles: 15000, taxesBrl: 40, carrier: 'AZUL', supplier: 'supplier-c' },
    ]);
  });

  it('retorna [] para data vazio, sem lançar', () => {
    const raw: SupplierCRawResponse = { data: [] };

    expect(normalizeSupplierC(raw, silentLogger().logger)).toEqual([]);
  });

  it('descarta item com fee: null, mantendo os demais itens válidos da mesma resposta', () => {
    const raw: SupplierCRawResponse = {
      data: [
        { price_miles: 18500, fee: null, airline_code: 'LA' },
        { price_miles: 22000, fee: 98.36, airline_code: 'G3' },
      ],
    };
    const { logger, warnSpy } = silentLogger();

    const quotes = normalizeSupplierC(raw, logger);

    expect(quotes).toEqual([
      { miles: 22000, taxesBrl: 98.36, carrier: 'GOL', supplier: 'supplier-c' },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('descarta item com price_miles como string, sem converter para número', () => {
    const raw: SupplierCRawResponse = {
      data: [
        { price_miles: '17500', fee: 75.51, airline_code: 'LA' },
        { price_miles: 22000, fee: 98.36, airline_code: 'G3' },
      ],
    };
    const { logger, warnSpy } = silentLogger();

    const quotes = normalizeSupplierC(raw, logger);

    expect(quotes).toEqual([
      { miles: 22000, taxesBrl: 98.36, carrier: 'GOL', supplier: 'supplier-c' },
    ]);
    expect(quotes.some((quote) => quote.miles === 17500)).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('descarta item com price_miles zero ou negativo', () => {
    const raw: SupplierCRawResponse = {
      data: [
        { price_miles: 0, fee: 50, airline_code: 'LA' },
        { price_miles: -100, fee: 50, airline_code: 'LA' },
      ],
    };

    expect(normalizeSupplierC(raw, silentLogger().logger)).toEqual([]);
  });

  it('descarta item null dentro do array data, sem lançar exceção', () => {
    const raw = {
      data: [null, { price_miles: 22000, fee: 98.36, airline_code: 'G3' }],
    } as unknown as SupplierCRawResponse;
    const { logger, warnSpy } = silentLogger();

    const quotes = normalizeSupplierC(raw, logger);

    expect(quotes).toEqual([
      { miles: 22000, taxesBrl: 98.36, carrier: 'GOL', supplier: 'supplier-c' },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('retorna [] quando todos os itens da resposta são inválidos', () => {
    const raw: SupplierCRawResponse = {
      data: [
        { price_miles: '17500', fee: 75.51, airline_code: 'LA' },
        { price_miles: 22000, fee: null, airline_code: 'G3' },
        { price_miles: 15000, fee: 40, airline_code: '' },
      ],
    };

    expect(normalizeSupplierC(raw, silentLogger().logger)).toEqual([]);
  });

  it('mapeia airline_code fora do catálogo conhecido como passthrough do código cru, sem descartar', () => {
    const raw: SupplierCRawResponse = {
      data: [{ price_miles: 10000, fee: 50, airline_code: 'XX' }],
    };
    const { logger, warnSpy } = silentLogger();

    const quotes = normalizeSupplierC(raw, logger);

    expect(quotes).toEqual([
      { miles: 10000, taxesBrl: 50, carrier: 'XX', supplier: 'supplier-c' },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
