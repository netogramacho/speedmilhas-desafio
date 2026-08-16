import { Logger } from '@nestjs/common';

import { CarrierName, Quote, SupplierId } from '../types';
import { SupplierARawResponse } from './supplier-a.types';

const SUPPLIER_ID: SupplierId = 'supplier-a';

const KNOWN_CARRIERS: readonly CarrierName[] = ['LATAM', 'GOL', 'AZUL'];

function isKnownCarrier(carrier: string): carrier is CarrierName {
  return (KNOWN_CARRIERS as readonly string[]).includes(carrier);
}

/**
 * Mapeia o payload cru do Fornecedor A (`miles`, `taxes_brl`, `carrier`) para o formato interno
 * único de cotação. Função pura: não faz chamada de rede.
 *
 * `carrier` fora do enum conhecido (`LATAM`/`GOL`/`AZUL`) não é descartado — passa como veio,
 * apenas com um log de warning, para não perder uma cotação válida por causa de um nome de
 * companhia novo.
 */
export function normalizeSupplierA(
  raw: SupplierARawResponse,
  logger: Logger = new Logger('SupplierANormalizer'),
): Quote[] {
  return raw.results.map((item) => {
    if (!isKnownCarrier(item.carrier)) {
      logger.warn(`unknown carrier from ${SUPPLIER_ID}: "${item.carrier}"`);
    }

    return {
      miles: item.miles,
      taxesBrl: item.taxes_brl,
      carrier: item.carrier,
      supplier: SUPPLIER_ID,
    };
  });
}
