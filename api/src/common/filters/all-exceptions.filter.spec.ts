import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

import { validationExceptionFactory } from '../validation/validation-exception-factory';
import { AllExceptionsFilter } from './all-exceptions.filter';

function validationError(
  property: string,
  constraints: Record<string, string>,
): ValidationError {
  const error = new ValidationError();
  error.property = property;
  error.constraints = constraints;
  return error;
}

function mockHost(): {
  host: ArgumentsHost;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('BadRequestException estruturada (validationExceptionFactory): repassa code/fields/message, status 400', () => {
    const exception = validationExceptionFactory([
      validationError('origin', { isIn: 'origin inválido' }),
    ]);
    const { host, json, status } = mockHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Requisição inválida.',
        fields: [
          {
            field: 'origin',
            code: 'AIRPORT_NOT_SUPPORTED',
            message: 'origin inválido',
          },
        ],
      },
    });
  });

  it('HttpException genérica sem code (NotFoundException padrão): envelope genérico, status da exceção original', () => {
    const exception = new NotFoundException();
    const { host, json, status } = mockHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'Not Found',
      },
    });
  });

  it('erro não-HttpException (new Error): envelope INTERNAL_ERROR com mensagem genérica (não a mensagem interna), status 500', () => {
    const exception = new Error('boom, detalhe interno sensível');
    const { host, json, status } = mockHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    const [payload] = json.mock.calls[0] as [
      { error: { code: string; message: string } },
    ];
    expect(payload.error.code).toBe('INTERNAL_ERROR');
    expect(payload.error.message).not.toContain('boom');
  });
});
