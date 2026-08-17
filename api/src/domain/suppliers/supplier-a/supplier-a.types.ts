/**
 * Tipos do payload cru do Fornecedor A. Não vazam para fora do client/normalizer.
 */

export interface SupplierARawItem {
  miles: number;
  taxes_brl: number;
  carrier: string;
}

export interface SupplierARawResponse {
  results: SupplierARawItem[];
}
