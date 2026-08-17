import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

const GENERIC_INTERNAL_ERROR_MESSAGE =
  'Erro interno do servidor. Tente novamente mais tarde.';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: unknown;
  };
}

interface StructuredExceptionResponse {
  code: string;
  message: string;
  fields?: unknown;
}

function isStructuredExceptionResponse(
  response: unknown,
): response is StructuredExceptionResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    typeof response.code === 'string'
  );
}

/** `HttpStatus` do Nest já expõe as chaves em UPPER_SNAKE_CASE (ex. `NOT_FOUND` para 404). */
function statusToCode(status: number): string {
  if (status === Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
    return 'INTERNAL_ERROR';
  }

  const name = (HttpStatus as unknown as Record<number, string>)[status];
  return name ?? 'INTERNAL_ERROR';
}

/**
 * Filtro de exceção global (`APP_FILTER`, `app.module.ts`) — produz um envelope único de erro
 * (`{ error: { code, message, fields? } }`) para qualquer exceção da API, reaproveitável para
 * 400/404/409/500 (DSM-5/6/7). Se a exceção já carrega `{ code, message, fields }` estruturado
 * (produzido por `validationExceptionFactory`), repassa como está; caso contrário monta um
 * envelope genérico a partir do status HTTP, sem vazar stack trace/mensagem interna ao cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const envelope = this.buildEnvelope(exception, status);

    if (!(exception instanceof HttpException)) {
      const message =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error(
        `unhandled exception: ${message}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json(envelope);
  }

  private buildEnvelope(exception: unknown, status: number): ErrorEnvelope {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (isStructuredExceptionResponse(body)) {
        return {
          error: {
            code: body.code,
            message: body.message,
            ...(body.fields !== undefined ? { fields: body.fields } : {}),
          },
        };
      }

      return {
        error: {
          code: statusToCode(status),
          message: exception.message,
        },
      };
    }

    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: GENERIC_INTERNAL_ERROR_MESSAGE,
      },
    };
  }
}
