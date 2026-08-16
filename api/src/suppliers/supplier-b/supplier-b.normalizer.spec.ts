import { Logger } from '@nestjs/common';

import { normalizeSupplierB } from './supplier-b.normalizer';
import { SupplierBRawResponse } from './supplier-b.types';

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

describe('normalizeSupplierB', () => {
  it('mapeia pontos, taxa.valor (BRL), cia (passthrough) e supplier para cada item', () => {
    const raw: SupplierBRawResponse = {
      dados: [
        { pontos: 18500, taxa: { valor: 75.51, moeda: 'BRL' }, cia: 'GOL' },
        { pontos: 22000, taxa: { valor: 98.36, moeda: 'BRL' }, cia: 'LATAM' },
      ],
    };

    const quotes = normalizeSupplierB(raw, silentLogger().logger);

    expect(quotes).toEqual([
      { miles: 18500, taxesBrl: 75.51, carrier: 'GOL', supplier: 'supplier-b' },
      {
        miles: 22000,
        taxesBrl: 98.36,
        carrier: 'LATAM',
        supplier: 'supplier-b',
      },
    ]);
  });

  it('retorna [] para dados vazio, sem lançar', () => {
    const raw: SupplierBRawResponse = { dados: [] };

    expect(normalizeSupplierB(raw, silentLogger().logger)).toEqual([]);
  });

  it('descarta item com taxa.moeda !== BRL, mantendo os demais itens válidos', () => {
    const raw: SupplierBRawResponse = {
      dados: [
        { pontos: 18500, taxa: { valor: 75.51, moeda: 'BRL' }, cia: 'GOL' },
        { pontos: 30000, taxa: { valor: 120, moeda: 'USD' }, cia: 'LATAM' },
      ],
    };
    const { logger, warnSpy } = silentLogger();

    const quotes = normalizeSupplierB(raw, logger);

    expect(quotes).toEqual([
      { miles: 18500, taxesBrl: 75.51, carrier: 'GOL', supplier: 'supplier-b' },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('retorna [] quando todos os itens têm taxa.moeda !== BRL', () => {
    const raw: SupplierBRawResponse = {
      dados: [
        { pontos: 18500, taxa: { valor: 75.51, moeda: 'USD' }, cia: 'GOL' },
        { pontos: 22000, taxa: { valor: 98.36, moeda: 'EUR' }, cia: 'LATAM' },
      ],
    };

    expect(normalizeSupplierB(raw, silentLogger().logger)).toEqual([]);
  });

  it('mapeia normalmente uma cia fora do enum conhecido, sem descartar e sem lançar', () => {
    const raw: SupplierBRawResponse = {
      dados: [
        { pontos: 10000, taxa: { valor: 50, moeda: 'BRL' }, cia: 'AVIANCA' },
      ],
    };
    const { logger, warnSpy } = silentLogger();

    const quotes = normalizeSupplierB(raw, logger);

    expect(quotes).toEqual([
      {
        miles: 10000,
        taxesBrl: 50,
        carrier: 'AVIANCA',
        supplier: 'supplier-b',
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
