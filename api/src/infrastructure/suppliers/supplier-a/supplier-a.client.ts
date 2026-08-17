import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import {
  Quote,
  SupplierFailure,
  SupplierId,
  SupplierQuoteQuery,
  SupplierQuoteResult,
} from '../../../domain/suppliers/types';
import { normalizeSupplierA } from '../../../domain/suppliers/supplier-a/supplier-a.normalizer';
import { SupplierARawResponse } from '../../../domain/suppliers/supplier-a/supplier-a.types';

const SUPPLIER_ID: SupplierId = 'supplier-a';
const QUOTES_ENDPOINT = '/supplier-a/quotes';

@Injectable()
export class SupplierAClient {
  private readonly logger = new Logger(SupplierAClient.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Consulta o Fornecedor A e devolve o resultado normalizado. Nunca lança — chamada HTTP e
   * normalização ficam dentro do mesmo `try/catch`, então qualquer erro (rede, timeout, HTTP,
   * formato inesperado) vira uma falha classificada em vez de exceção não tratada.
   */
  async getQuotes(query: SupplierQuoteQuery): Promise<SupplierQuoteResult> {
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get<SupplierARawResponse>(QUOTES_ENDPOINT, {
          params: {
            origin: query.origin,
            destination: query.destination,
            date: query.date,
          },
        }),
      );

      const quotes: Quote[] = normalizeSupplierA(response.data, this.logger);
      const latencyMs = Date.now() - startedAt;

      this.logger.log(
        `supplier=${SUPPLIER_ID} outcome=ok quotes=${quotes.length} latencyMs=${latencyMs}`,
      );

      return { ok: true, supplier: SUPPLIER_ID, quotes };
    } catch (err) {
      const failure = this.classifyFailure(err);
      const latencyMs = Date.now() - startedAt;

      this.logger.warn(
        `supplier=${SUPPLIER_ID} outcome=failure reason=${failure.reason} httpStatus=${failure.httpStatus ?? '-'} latencyMs=${latencyMs}`,
      );

      return { ok: false, supplier: SUPPLIER_ID, failure };
    }
  }

  private classifyFailure(err: unknown): SupplierFailure {
    const message = err instanceof Error ? err.message : String(err);

    if (isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        return { supplier: SUPPLIER_ID, reason: 'timeout', message };
      }

      if (err.response) {
        return {
          supplier: SUPPLIER_ID,
          reason: 'http_error',
          message,
          httpStatus: err.response.status,
        };
      }
    }

    return { supplier: SUPPLIER_ID, reason: 'unknown_error', message };
  }
}
