import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SupplierAClient } from '../suppliers/supplier-a/supplier-a.client';
import { SupplierBClient } from '../suppliers/supplier-b/supplier-b.client';
import { SupplierCClient } from '../suppliers/supplier-c/supplier-c.client';
import {
  Quote,
  SupplierId,
  SupplierQuoteQuery,
  SupplierQuoteResult,
} from '../../domain/suppliers/types';
import {
  AggregatedSearchResult,
  SupplierOutcome,
} from '../../domain/search/types';
import {
  GLOBAL_TIMEOUT_MARKER,
  raceAgainstDeadline,
} from '../../domain/search/race-against-deadline';
import { sortQuotes } from '../../domain/search/sort-quotes';

type RacedResult = SupplierQuoteResult | typeof GLOBAL_TIMEOUT_MARKER;

@Injectable()
export class SearchAggregatorService {
  private readonly logger = new Logger(SearchAggregatorService.name);

  constructor(
    private readonly supplierA: SupplierAClient,
    private readonly supplierB: SupplierBClient,
    private readonly supplierC: SupplierCClient,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Dispara as três chamadas de fornecedor em paralelo, corre cada uma contra
   * `SEARCH_TOTAL_TIMEOUT_MS` e agrega os resultados. Nunca lança — mesmo critério dos clients
   * individuais (DSM-1/2/3), agora no nível da agregação.
   */
  async search(query: SupplierQuoteQuery): Promise<AggregatedSearchResult> {
    const deadlineMs = this.configService.get<number>(
      'SEARCH_TOTAL_TIMEOUT_MS',
    )!;

    const racedResults = await Promise.all([
      this.raceSupplier(
        'supplier-a',
        this.supplierA.getQuotes(query),
        deadlineMs,
      ),
      this.raceSupplier(
        'supplier-b',
        this.supplierB.getQuotes(query),
        deadlineMs,
      ),
      this.raceSupplier(
        'supplier-c',
        this.supplierC.getQuotes(query),
        deadlineMs,
      ),
    ]);

    const outcomes: SupplierOutcome[] = [];
    const allQuotes: Quote[] = [];

    for (const { supplier, result } of racedResults) {
      const outcome = this.classifyOutcome(supplier, result);
      outcomes.push(outcome);

      if (result !== GLOBAL_TIMEOUT_MARKER && result.ok) {
        allQuotes.push(...result.quotes);
      }

      this.logOutcome(outcome, result);
    }

    return { quotes: sortQuotes(allQuotes), outcomes };
  }

  private async raceSupplier(
    supplier: SupplierId,
    promise: Promise<SupplierQuoteResult>,
    deadlineMs: number,
  ): Promise<{ supplier: SupplierId; result: RacedResult }> {
    const result = await raceAgainstDeadline(
      promise,
      deadlineMs,
      (lateResult) => {
        this.logger.warn(
          `supplier=${supplier} outcome=late-arrival result=${lateResult.ok ? 'ok' : lateResult.failure.reason}`,
        );
      },
    );

    return { supplier, result };
  }

  private classifyOutcome(
    supplier: SupplierId,
    result: RacedResult,
  ): SupplierOutcome {
    if (result === GLOBAL_TIMEOUT_MARKER) {
      return { supplier, status: 'timeout', quotesCount: 0 };
    }

    if (result.ok) {
      return { supplier, status: 'ok', quotesCount: result.quotes.length };
    }

    const status = result.failure.reason === 'timeout' ? 'timeout' : 'failed';
    return { supplier, status, quotesCount: 0 };
  }

  private logOutcome(outcome: SupplierOutcome, result: RacedResult): void {
    const detail =
      result !== GLOBAL_TIMEOUT_MARKER && !result.ok
        ? ` detail=${result.failure.reason}`
        : '';

    this.logger.log(
      `supplier=${outcome.supplier} outcome=${outcome.status} quotesCount=${outcome.quotesCount}${detail}`,
    );
  }
}
