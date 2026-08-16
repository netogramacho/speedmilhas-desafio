/**
 * Formato interno único de cotação e o contrato de resultado por fornecedor.
 *
 * Compartilhado por `supplier-a`/`supplier-b`/`supplier-c` (DSM-1/2/3) e pela agregação
 * (DSM-4/5).
 */

export type SupplierId = 'supplier-a' | 'supplier-b' | 'supplier-c';

export type CarrierName = 'LATAM' | 'GOL' | 'AZUL';

export interface Quote {
  miles: number;
  taxesBrl: number;
  carrier: CarrierName | (string & {}); // string: passthrough defensivo p/ nome de companhia não mapeado
  supplier: SupplierId;
}

export type SupplierFailureReason = 'timeout' | 'http_error' | 'unknown_error';

export interface SupplierFailure {
  supplier: SupplierId;
  reason: SupplierFailureReason;
  message: string;
  httpStatus?: number; // presente só quando reason === 'http_error'
}

export type SupplierQuoteResult =
  | { ok: true; supplier: SupplierId; quotes: Quote[] }
  | { ok: false; supplier: SupplierId; failure: SupplierFailure };

export interface SupplierQuoteQuery {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD, já validado por quem chama (fora do escopo desta story)
}
