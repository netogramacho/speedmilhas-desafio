/**
 * Traduz `AggregatedSearchResult` (DSM-4, domínio puro) para o contrato HTTP de `POST /search`.
 * Sem import de `@nestjs/*` (item 16 de `claude/config/parametros-tecnicos.md`).
 */

import { SupplierId } from '../../domain/suppliers/types';
import { AggregatedSearchResult } from '../../domain/search/types';
import { SearchResponseDto } from './dto/search-response.dto';

/**
 * `status` é binário: `'complete'` sse os 3 outcomes são `'ok'`; caso contrário `'partial'` —
 * inclui o caso extremo de nenhum fornecedor responder (`quotes: []`, os 3 outcomes não-`'ok'`).
 * Ver `claude/specs/DSM-5/spec.md`, "Arquitetura decidida".
 */
export function mapAggregatedResultToResponse(
  result: AggregatedSearchResult,
): SearchResponseDto {
  const allOk = result.outcomes.every((outcome) => outcome.status === 'ok');

  const suppliers = result.outcomes.reduce<
    Record<SupplierId, SearchResponseDto['suppliers'][SupplierId]>
  >(
    (acc, outcome) => {
      acc[outcome.supplier] = outcome.status;
      return acc;
    },
    {} as Record<SupplierId, SearchResponseDto['suppliers'][SupplierId]>,
  );

  return {
    status: allOk ? 'complete' : 'partial',
    quotes: result.quotes.map((quote) => ({
      miles: quote.miles,
      taxesBrl: quote.taxesBrl,
      carrier: quote.carrier,
    })),
    suppliers,
  };
}
