/**
 * Tipos do payload cru do Fornecedor C. Não vazam para fora do client/normalizer.
 *
 * Campos tipados como `unknown`, não `number`/`string`: o próprio contrato do fornecedor admite
 * sujeira em runtime (10% das respostas vêm malformadas com status 200 — `data: []`, campo
 * `null`, `price_miles` como string) — tipar como `number`/`string` aqui seria mentir para o
 * compilador. `normalizeSupplierC` é quem valida o tipo real em runtime, item a item.
 */

export interface SupplierCRawItem {
  price_miles: unknown;
  fee: unknown;
  airline_code: unknown;
}

export interface SupplierCRawResponse {
  data: SupplierCRawItem[];
}
