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
} from '../types';
import { normalizeSupplierC } from './supplier-c.normalizer';
import { SupplierCRawResponse } from './supplier-c.types';

const SUPPLIER_ID: SupplierId = 'supplier-c';
const QUOTES_ENDPOINT = '/supplier-c/v2/quotes';

@Injectable()
export class SupplierCClient {
  private readonly logger = new Logger(SupplierCClient.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Consulta o Fornecedor C e devolve o resultado normalizado. Nunca lança — chamada HTTP e
   * normalização ficam dentro do mesmo `try/catch`, então qualquer erro (rede, timeout, HTTP,
   * formato inesperado não coberto pela validação item a item) vira uma falha classificada em vez
   * de exceção não tratada.
   *
   * Sem retry automático — mesma política de A (DSM-1): o Fornecedor C não tem comportamento de
   * rate limit documentado, só a exceção explícita do 429 do Fornecedor B justifica retry.
   *
   * A sujeira de payload do Fornecedor C (`data: []`, item com campo `null`, `price_miles` como
   * string) vem sempre com status 200 — não lança nem aqui nem no `catch`; é isolada item a item
   * dentro de `normalizeSupplierC`, que nunca lança.
   */
  async getQuotes(query: SupplierQuoteQuery): Promise<SupplierQuoteResult> {
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post<SupplierCRawResponse>(QUOTES_ENDPOINT, {
          origin: query.origin,
          destination: query.destination,
          date: query.date,
        }),
      );

      const rawCount = response.data.data.length;
      const quotes: Quote[] = normalizeSupplierC(response.data, this.logger);
      const discarded = rawCount - quotes.length;
      const latencyMs = Date.now() - startedAt;

      this.logger.log(
        `supplier=${SUPPLIER_ID} outcome=ok quotes=${quotes.length} discarded=${discarded} latencyMs=${latencyMs}`,
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
