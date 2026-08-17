import { Logger } from '@nestjs/common';

import { CarrierName, Quote, SupplierId } from '../types';
import { SupplierBRawResponse } from './supplier-b.types';

const SUPPLIER_ID: SupplierId = 'supplier-b';

const KNOWN_CARRIERS: readonly CarrierName[] = ['LATAM', 'GOL', 'AZUL'];

function isKnownCarrier(carrier: string): carrier is CarrierName {
  return (KNOWN_CARRIERS as readonly string[]).includes(carrier);
}

/**
 * Mapeia o payload cru do Fornecedor B (`pontos`, `taxa: { valor, moeda }`, `cia`) para o formato
 * interno único de cotação. Função pura: não faz chamada de rede.
 *
 * Decisão sobre `taxa.moeda !== 'BRL'`: o item é descartado (não entra no array de saída), nunca
 * somado como se fosse BRL. Não convertemos porque não há fonte de câmbio disponível no projeto —
 * descartar com log é mais seguro do que inventar uma taxa de conversão. O mock real não gera esse
 * caso hoje (`moeda: 'BRL'` hardcoded em `mock-suppliers/src/index.js:321`); é tratamento
 * defensivo.
 *
 * `cia` fora do enum conhecido (`LATAM`/`GOL`/`AZUL`) não é descartado — passa como veio, apenas
 * com um log de warning, mesmo padrão do `supplier-a.normalizer.ts`.
 */
export function normalizeSupplierB(
  raw: SupplierBRawResponse,
  logger: Logger = new Logger('SupplierBNormalizer'),
): Quote[] {
  const quotes: Quote[] = [];

  for (const item of raw.dados) {
    if (item.taxa.moeda !== 'BRL') {
      logger.warn(
        `discarding item from ${SUPPLIER_ID}: unsupported currency "${item.taxa.moeda}" (expected BRL)`,
      );
      continue;
    }

    if (!isKnownCarrier(item.cia)) {
      logger.warn(`unknown carrier from ${SUPPLIER_ID}: "${item.cia}"`);
    }

    quotes.push({
      miles: item.pontos,
      taxesBrl: item.taxa.valor,
      carrier: item.cia,
      supplier: SUPPLIER_ID,
    });
  }

  return quotes;
}
