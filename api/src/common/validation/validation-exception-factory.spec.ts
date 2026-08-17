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

  it('múltiplas constraints simultâneas no mesmo campo (campo ausente): isNotEmpty vence, não a mais específica', () => {
    // Espelha o que o class-validator produz de verdade quando um campo está ausente: várias
    // constraints disparam juntas, na ordem inversa à declaração no DTO (a mais específica —
    // aqui, isIn — aparece primeiro no objeto). O code final deve ser FIELD_REQUIRED mesmo assim.
    const errors = [
      validationError('origin', {
        isIn: 'origin deve ser um dos aeroportos suportados: GRU, GIG, BSB, SSA, REC, POA, CNF, FOR',
        isNotEmpty: 'origin should not be empty',
        isString: 'origin must be a string',
      }),
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as {
      fields: { field: string; code: string; message: string }[];
    };

    expect(response.fields[0]).toEqual({
      field: 'origin',
      code: 'FIELD_REQUIRED',
      message: 'origin should not be empty',
    });
  });

  it('múltiplas constraints simultâneas: isDifferentFrom + isIn + isNotEmpty + isString — isNotEmpty vence', () => {
    const errors = [
      validationError('destination', {
        isDifferentFrom: 'destination must be different from origin',
        isIn: 'destination deve ser um dos aeroportos suportados: GRU, GIG, BSB, SSA, REC, POA, CNF, FOR',
        isNotEmpty: 'destination should not be empty',
        isString: 'destination must be a string',
      }),
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as {
      fields: { field: string; code: string; message: string }[];
    };

    expect(response.fields[0].code).toBe('FIELD_REQUIRED');
  });

  it('múltiplas constraints simultâneas: isValidCalendarDate + matches + isNotEmpty + isString — isNotEmpty vence', () => {
    const errors = [
      validationError('date', {
        isValidCalendarDate: 'date deve ser uma data válida do calendário',
        matches: 'date must match /^\\d{4}-\\d{2}-\\d{2}$/',
        isNotEmpty: 'date should not be empty',
        isString: 'date must be a string',
      }),
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as {
      fields: { field: string; code: string; message: string }[];
    };

    expect(response.fields[0].code).toBe('FIELD_REQUIRED');
  });

  it('sem isNotEmpty/isString: matches + isValidCalendarDate simultâneos — matches vence (maior prioridade entre os específicos)', () => {
    const errors = [
      validationError('date', {
        isValidCalendarDate: 'date deve ser uma data válida do calendário',
        matches: 'date must match /^\\d{4}-\\d{2}-\\d{2}$/',
      }),
    ];

    const exception = validationExceptionFactory(errors);
    const response = exception.getResponse() as {
      fields: { field: string; code: string; message: string }[];
    };

    expect(response.fields[0].code).toBe('INVALID_DATE_FORMAT');
  });
});
