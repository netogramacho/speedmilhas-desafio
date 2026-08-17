import { SupplierId } from '../../../domain/suppliers/types';
import { SupplierOutcomeStatus } from '../../../domain/search/types';

export interface SearchResponseQuoteDto {
  miles: number;
  taxesBrl: number;
  carrier: string;
}

/**
 * Corpo de sucesso (200) de `POST /search`. `status` é derivado de `outcomes` em
 * `search-response.mapper.ts` — binário (`complete`/`partial`), inclusive quando os 3
 * fornecedores falham (`quotes: []`) — ver `claude/specs/DSM-5/spec.md`, "Arquitetura decidida".
 */
export interface SearchResponseDto {
  status: 'complete' | 'partial';
  quotes: SearchResponseQuoteDto[];
  suppliers: Record<SupplierId, SupplierOutcomeStatus>;
}
