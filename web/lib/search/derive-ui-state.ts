import type { SearchResponseBody } from './api';
import type { SearchUiState, SupplierId } from './types';

/**
 * Deriva o estado de UI a partir de uma resposta HTTP 200 já parseada de `POST /search`.
 *
 * O `status` binário da API (`complete`/`partial`) não mapeia 1:1 para o que a tela precisa
 * mostrar: `partial` com todos os fornecedores falhos é tratado como erro total (AC4), mesmo o
 * backend respondendo 200 — ver `claude/specs/DSM-9/spec.md`, "Arquitetura decidida".
 */
export function deriveSearchUiState(response: SearchResponseBody): SearchUiState {
  const missingSuppliers = (Object.keys(response.suppliers) as SupplierId[]).filter(
    (supplierId) => response.suppliers[supplierId] !== 'ok',
  );

  const allSuppliersFailed = missingSuppliers.length === Object.keys(response.suppliers).length;
  if (response.quotes.length === 0 && allSuppliersFailed) {
    return { kind: 'error' };
  }

  if (response.status === 'complete') {
    return response.quotes.length === 0
      ? { kind: 'empty' }
      : { kind: 'success', quotes: response.quotes };
  }

  return { kind: 'partial', quotes: response.quotes, missingSuppliers };
}
