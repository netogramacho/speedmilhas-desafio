import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

import { CONSTRAINT_ERROR_CODES } from './constraint-error-codes';

export interface ValidationErrorField {
  field: string;
  code: string;
  message: string;
}

/** Payload estruturado carregado pela `BadRequestException` — é isto que `AllExceptionsFilter`
 * reconhece e repassa como está, em vez de cair no envelope genérico de erro. */
export interface ValidationExceptionPayload {
  code: 'VALIDATION_ERROR';
  message: string;
  fields: ValidationErrorField[];
}

function constraintCode(constraintKey: string): string {
  return CONSTRAINT_ERROR_CODES[constraintKey] ?? constraintKey.toUpperCase();
}

/**
 * Achata os `ValidationError` do `class-validator` (recursivo para `children`, embora
 * `SearchRequestDto` seja raso e não precise disso hoje) em uma entrada por campo — a primeira
 * constraint violada de cada campo decide `code`/`message`.
 */
function flattenErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorField[] {
  const fields: ValidationErrorField[] = [];

  for (const error of errors) {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      const [constraintKey, message] = Object.entries(error.constraints)[0];
      fields.push({ field, code: constraintCode(constraintKey), message });
    }

    if (error.children && error.children.length > 0) {
      fields.push(...flattenErrors(error.children, field));
    }
  }

  return fields;
}

/**
 * Usada como `exceptionFactory` do `ValidationPipe` global (`app.module.ts`). Monta um
 * `BadRequestException` cujo `getResponse()` carrega `{ code, message, fields }` — formato que
 * `AllExceptionsFilter` reconhece e repassa como está.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const payload: ValidationExceptionPayload = {
    code: 'VALIDATION_ERROR',
    message: 'Requisição inválida.',
    fields: flattenErrors(errors),
  };

  return new BadRequestException(payload);
}
