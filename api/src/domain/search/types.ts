/**
 * Contrato da agregação paralela dos três fornecedores (DSM-4).
 */

import { Quote, SupplierId } from '../suppliers/types';

/**
 * Status simplificado por fornecedor para a resposta agregada — 3 estados, não os 4 de
 * `SupplierFailureReason` (`suppliers/types.ts`). `http_error`/`unknown_error`/`rate_limited`
 * colapsam em `'failed'`; `'timeout'` fica separado porque a busca precisa distinguir
 * explicitamente "não respondeu a tempo" de "falhou" (user-story AC2/AC3). O motivo detalhado
 * original continua existindo e sendo logado pelo client (DSM-1/2/3) e por esta agregação — só
 * não é reexposto neste contrato.
 */
export type SupplierOutcomeStatus = 'ok' | 'timeout' | 'failed';

export interface SupplierOutcome {
  supplier: SupplierId;
  status: SupplierOutcomeStatus;
  /** Quantidade de cotações contribuídas por este fornecedor; 0 quando status !== 'ok'. */
  quotesCount: number;
}

/**
 * Resultado da agregação paralela dos três fornecedores (DSM-4). Não inclui um status geral da
 * busca (`complete`/`partial`/`empty`) — esse rótulo é derivado de `outcomes` na DSM-5, que monta
 * a resposta HTTP.
 */
export interface AggregatedSearchResult {
  /** Cotações de todos os fornecedores com status 'ok', ordenadas por miles asc, taxesBrl asc no empate. */
  quotes: Quote[];
  /** Sempre 3 entradas, uma por SupplierId, na ordem supplier-a/supplier-b/supplier-c. */
  outcomes: SupplierOutcome[];
}
