import { Logger } from '@nestjs/common';

import { CarrierName, Quote, SupplierId } from '../types';
import { SupplierCRawItem, SupplierCRawResponse } from './supplier-c.types';

const SUPPLIER_ID: SupplierId = 'supplier-c';

/**
 * Shape de um item já validado por `isValidRawItem` — os 3 campos de `SupplierCRawItem`
 * (declarados como `unknown` no payload cru) narrowed para o tipo real, sem `as` no restante do
 * normalizador.
 */
interface ValidSupplierCItem {
  price_miles: number;
  fee: number;
  airline_code: string;
}

/**
 * Tradução do código IATA cru do Fornecedor C para o nome de companhia por extenso, local a este
 * normalizador (nenhum outro fornecedor usa código IATA hoje — extrair para `suppliers/types.ts`
 * seria antecipar reuso que não existe).
 */
const IATA_TO_CARRIER: Readonly<Record<string, CarrierName>> = {
  LA: 'LATAM',
  G3: 'GOL',
  AD: 'AZUL',
};

/**
 * Type guard local (não exportado) que valida item a item o payload cru do Fornecedor C, que
 * pode vir malformado com status 200 (README: "10% das respostas vêm sujas" — `data: []`, campo
 * `null` num item, ou `price_miles` como string).
 *
 * Guarda contra elemento `null`/não-objeto dentro do array: além dos 3 modos de sujeira
 * documentados, um item `null` faria `item.price_miles` lançar `TypeError` dentro do loop do
 * normalizador, o que quebraria a resposta inteira em vez de descartar só aquele item.
 */
function isValidRawItem(
  item: unknown,
  logger: Logger,
): item is ValidSupplierCItem {
  if (item == null || typeof item !== 'object') {
    logger.warn(
      `discarding item from ${SUPPLIER_ID}: item is null/not an object`,
    );
    return false;
  }

  const { price_miles, fee, airline_code } = item as SupplierCRawItem;

  if (
    typeof price_miles !== 'number' ||
    !Number.isFinite(price_miles) ||
    price_miles <= 0
  ) {
    logger.warn(
      `discarding item from ${SUPPLIER_ID}: invalid price_miles (${JSON.stringify(price_miles)})`,
    );
    return false;
  }

  if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) {
    logger.warn(
      `discarding item from ${SUPPLIER_ID}: invalid fee (${JSON.stringify(fee)})`,
    );
    return false;
  }

  if (typeof airline_code !== 'string' || airline_code.length === 0) {
    logger.warn(
      `discarding item from ${SUPPLIER_ID}: invalid airline_code (${JSON.stringify(airline_code)})`,
    );
    return false;
  }

  return true;
}

/**
 * Mapeia o payload cru do Fornecedor C (`price_miles`, `fee`, `airline_code`) para o formato
 * interno único de cotação. Função pura: não faz chamada de rede.
 *
 * Diferente de A/B, a validação acontece item a item (`isValidRawItem`) dentro do loop: o
 * Fornecedor C nunca retorna erro HTTP para payload sujo (sempre status 200), então é aqui — não
 * no client — que dado inválido precisa ser isolado sem descartar a resposta inteira nem os itens
 * bons ao lado. Item inválido é descartado com `logger.warn` e o loop **continua**, nunca lança.
 *
 * Decisão explícita (confirmada pelo desenvolvedor): **sem parse tolerante** de `price_miles`
 * string (ex.: `Number("17500")`). `"17500"` é descartado, não convertido — não há como
 * distinguir, só pela AC, um `price_miles` "string mas confiável" de um dado realmente corrompido
 * (ex.: `"17.500"`, `"17500 milhas"`, `""`); descartar é a leitura mais segura do requisito de a
 * story de "dados inválidos não chegarem ao usuário como se fossem uma cotação real".
 *
 * `airline_code` fora do catálogo conhecido (`IATA_TO_CARRIER`) não é descartado — passthrough do
 * código cru como `carrier`, com log de warning, mesma política de A/B para companhia
 * desconhecida.
 */
export function normalizeSupplierC(
  raw: SupplierCRawResponse,
  logger: Logger = new Logger('SupplierCNormalizer'),
): Quote[] {
  const quotes: Quote[] = [];

  for (const item of raw.data) {
    if (!isValidRawItem(item, logger)) {
      continue;
    }

    const carrier = IATA_TO_CARRIER[item.airline_code];
    if (!carrier) {
      logger.warn(
        `unknown airline_code from ${SUPPLIER_ID}: "${item.airline_code}"`,
      );
    }

    quotes.push({
      miles: item.price_miles,
      taxesBrl: item.fee,
      carrier: carrier ?? item.airline_code,
      supplier: SUPPLIER_ID,
    });
  }

  return quotes;
}
