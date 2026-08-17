import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

import { validationExceptionFactory } from './validation-exception-factory';

function validationError(
  property: string,
  constraints: Record<string, string>,
): ValidationError {
  const error = new ValidationError();
  error.property = property;
  error.constraints = constraints;
  return error;
}

describe('validationExceptionFactory', () => {
  it('origin inválido: devolve BadRequestException com o envelope estruturado esperado', () => {
    const errors = [
      validationError('origin', {
        isIn: 'origin deve ser um dos aeroportos suportados: GRU, GIG, BSB, SSA, REC, POA, CNF, FOR',
      }),
    ];

    const exception = validationExceptionFactory(errors);

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getResponse()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Requisição inválida.',
      fields: [
        {
          field: 'origin',
          code: 'AIRPORT_NOT_SUPPORTED',
          message:
            'origin deve ser um dos aeroportos suportados: GRU, GIG, BSB, SSA, REC, POA, CNF, FOR',
        },
      ],
    });
  });

  it('constraint sem entrada em CONSTRAINT_ERROR_CODES: code cai no fallback (constraintKey.toUpperCase())', () => {
    const errors = [
      validationError('someField', {
        someUnmappedConstraint: 'mensagem qualquer',
      }),
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as {
      fields: { field: string; code: string }[];
    };

    expect(response.fields[0]).toEqual({
      field: 'someField',
      code: 'SOMEUNMAPPEDCONSTRAINT',
      message: 'mensagem qualquer',
    });
  });

  it('múltiplos campos inválidos ao mesmo tempo: fields com uma entrada por campo', () => {
    const errors = [
      validationError('origin', { isIn: 'origin inválido' }),
      validationError('date', { matches: 'date fora do formato' }),
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as {
      fields: { field: string; code: string }[];
    };

    expect(response.fields).toHaveLength(2);
    expect(response.fields.map((f) => f.field)).toEqual(['origin', 'date']);
    expect(response.fields.map((f) => f.code)).toEqual([
      'AIRPORT_NOT_SUPPORTED',
      'INVALID_DATE_FORMAT',
    ]);
  });
});
