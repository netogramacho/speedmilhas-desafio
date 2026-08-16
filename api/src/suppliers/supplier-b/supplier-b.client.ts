import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import {
  Quote,
  SupplierFailure,
  SupplierId,
  SupplierQuoteQuery,
  SupplierQuoteResult,
} from '../types';
import { normalizeSupplierB } from './supplier-b.normalizer';
import { SupplierBRawResponse } from './supplier-b.types';

const SUPPLIER_ID: SupplierId = 'supplier-b';
const SEARCH_ENDPOINT = '/supplier-b/search';

/** Fallback usado quando o header `Retry-After` do 429 está ausente ou não é numérico. */
const DEFAULT_RETRY_AFTER_MS = 1000;

@Injectable()
export class SupplierBClient {
  private readonly logger = new Logger(SupplierBClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Consulta o Fornecedor B e devolve o resultado normalizado. Nunca lança — chamada HTTP e
   * normalização ficam dentro do mesmo `try/catch`, então qualquer erro (rede, timeout, HTTP,
   * formato inesperado) vira uma falha classificada em vez de exceção não tratada.
   *
   * Única exceção à política geral de "sem retry automático" (`parametros-tecnicos.md`, item 2):
   * um 429 na 1ª tentativa dispara um retry único e orçado (ver `handleRateLimited`). Qualquer
   * outro erro (500, timeout, desconhecido), em qualquer uma das tentativas, não tem retry.
   */
  async getQuotes(query: SupplierQuoteQuery): Promise<SupplierQuoteResult> {
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get<SupplierBRawResponse>(SEARCH_ENDPOINT, {
          params: this.buildParams(query),
        }),
      );

      return this.buildSuccess(response.data, startedAt, false);
    } catch (err) {
      if (this.isAxiosError(err) && err.response?.status === 429) {
        return this.handleRateLimited(err, query, startedAt);
      }

      return this.buildFailure(this.classifyFailure(err), startedAt, false);
    }
  }

  /**
   * Fluxo de retry único e orçado do 429 (`spec.md`, "Fluxo de retry do 429"). Só é chamado a
   * partir da 1ª tentativa; a 2ª tentativa (sucesso ou qualquer falha, inclusive outro 429) é
   * sempre o resultado final — nunca há uma 3ª chamada.
   */
  private async handleRateLimited(
    err: AxiosError,
    query: SupplierQuoteQuery,
    startedAt: number,
  ): Promise<SupplierQuoteResult> {
    const timeoutMs = this.configService.get<number>('SUPPLIER_TIMEOUT_MS')!;
    const elapsedMs = Date.now() - startedAt;
    const remainingBudgetMs = timeoutMs - elapsedMs;

    if (remainingBudgetMs <= 0) {
      this.logger.warn(
        `supplier=${SUPPLIER_ID} outcome=rate_limited retry=skipped reason=no_budget elapsedMs=${elapsedMs}`,
      );
      return this.buildFailure(this.rateLimitedFailure(err), startedAt, false);
    }

    const retryAfterMs = this.parseRetryAfterMs(
      err.response?.headers?.['retry-after'],
    );
    const waitMs = Math.min(retryAfterMs, remainingBudgetMs);

    this.logger.warn(
      `supplier=${SUPPLIER_ID} outcome=rate_limited retry=waiting retryAfterMs=${retryAfterMs} waitMs=${waitMs} remainingBudgetMs=${remainingBudgetMs}`,
    );

    await this.sleep(waitMs);

    const retryTimeoutMs = remainingBudgetMs - waitMs;
    if (retryTimeoutMs <= 0) {
      this.logger.warn(
        `supplier=${SUPPLIER_ID} outcome=rate_limited retry=skipped reason=wait_consumed_budget waitMs=${waitMs}`,
      );
      return this.buildFailure(this.rateLimitedFailure(err), startedAt, false);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<SupplierBRawResponse>(SEARCH_ENDPOINT, {
          params: this.buildParams(query),
          timeout: retryTimeoutMs,
        }),
      );

      return this.buildSuccess(response.data, startedAt, true);
    } catch (retryErr) {
      return this.buildFailure(this.classifyFailure(retryErr), startedAt, true);
    }
  }

  private buildParams(query: SupplierQuoteQuery): Record<string, string> {
    return {
      from: query.origin,
      to: query.destination,
      day: query.date,
    };
  }

  private buildSuccess(
    raw: SupplierBRawResponse,
    startedAt: number,
    retried: boolean,
  ): SupplierQuoteResult {
    const quotes: Quote[] = normalizeSupplierB(raw, this.logger);
    const latencyMs = Date.now() - startedAt;

    this.logger.log(
      `supplier=${SUPPLIER_ID} outcome=ok quotes=${quotes.length} retried=${retried} latencyMs=${latencyMs}`,
    );

    return { ok: true, supplier: SUPPLIER_ID, quotes };
  }

  private buildFailure(
    failure: SupplierFailure,
    startedAt: number,
    retried: boolean,
  ): SupplierQuoteResult {
    const latencyMs = Date.now() - startedAt;

    this.logger.warn(
      `supplier=${SUPPLIER_ID} outcome=failure reason=${failure.reason} httpStatus=${failure.httpStatus ?? '-'} retried=${retried} latencyMs=${latencyMs}`,
    );

    return { ok: false, supplier: SUPPLIER_ID, failure };
  }

  private rateLimitedFailure(err: AxiosError): SupplierFailure {
    return {
      supplier: SUPPLIER_ID,
      reason: 'rate_limited',
      message: err instanceof Error ? err.message : String(err),
      httpStatus: 429,
    };
  }

  private classifyFailure(err: unknown): SupplierFailure {
    const message = err instanceof Error ? err.message : String(err);

    if (this.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        return { supplier: SUPPLIER_ID, reason: 'timeout', message };
      }

      if (err.response?.status === 429) {
        return {
          supplier: SUPPLIER_ID,
          reason: 'rate_limited',
          message,
          httpStatus: 429,
        };
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

  /**
   * Parseia `Retry-After` como inteiro em segundos (formato usado pelo mock, ex.: `'1'`). Header
   * ausente ou não numérico cai no fallback fixo, com log de warning — a `Retry-After` do mock
   * real é sempre `'1'`, então este ramo é puramente defensivo.
   */
  private parseRetryAfterMs(headerValue: unknown): number {
    if (typeof headerValue === 'string' || typeof headerValue === 'number') {
      const seconds = Number(headerValue);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
      }
    }

    this.logger.warn(
      `supplier=${SUPPLIER_ID} retry-after header missing or non-numeric ("${String(headerValue)}"), falling back to ${DEFAULT_RETRY_AFTER_MS}ms`,
    );
    return DEFAULT_RETRY_AFTER_MS;
  }

  /** Espera assíncrona usada no retry do 429. Método de instância para ser mockável em teste. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as AxiosError).isAxiosError === true
    );
  }
}
