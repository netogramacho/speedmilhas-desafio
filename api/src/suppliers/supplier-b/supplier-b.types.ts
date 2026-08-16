/**
 * Tipos do payload cru do Fornecedor B. Não vazam para fora do client/normalizer.
 */

export interface SupplierBRawItem {
  pontos: number;
  taxa: {
    valor: number;
    moeda: string;
  };
  cia: string;
}

export interface SupplierBRawResponse {
  dados: SupplierBRawItem[];
}
