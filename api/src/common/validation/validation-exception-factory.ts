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
 * Prioridade explícita das constraint keys quando várias disparam ao mesmo tempo no mesmo campo
 * (caso típico: campo ausente, onde `isNotEmpty`/`isString` e os validadores mais específicos —
 * `isIn`, `isDifferentFrom`, `matches`, `isValidCalendarDate` — disparam juntos). "Campo ausente" é
 * logicamente anterior a "campo com valor inválido", por isso os genéricos vêm primeiro.
 *
 * Não usamos a ordem de inserção de `error.constraints` (`Object.entries(...)[0]`) porque ela
 * reflete a ordem de execução dos decorators do `class-validator` — o inverso da ordem declarada
 * no DTO — que não é um contrato estável para depender.
 */
const CONSTRAINT_PRIORITY = [
  'isNotEmpty',
  'isString',
  'isIn',
  'isDifferentFrom',
  'matches',
  'isValidCalendarDate',
];

/** Escolhe, entre as constraints violadas de um campo, a de maior prioridade (menor índice em
 * `CONSTRAINT_PRIORITY`). Constraints fora dessa lista caem por último, na ordem em que aparecem
 * em `constraints`. */
function pickConstraint(
  constraints: Record<string, string>,
): [constraintKey: string, message: string] {
  const entries = Object.entries(constraints);

  return entries.reduce((chosen, current) => {
    const chosenPriority = CONSTRAINT_PRIORITY.indexOf(chosen[0]);
    const currentPriority = CONSTRAINT_PRIORITY.indexOf(current[0]);

    const chosenRank = chosenPriority === -1 ? Infinity : chosenPriority;
    const currentRank = currentPriority === -1 ? Infinity : currentPriority;

    return currentRank < chosenRank ? current : chosen;
  }, entries[0]);
}

/**
 * Achata os `ValidationError` do `class-validator` (recursivo para `children`, embora
 * `SearchRequestDto` seja raso e não precise disso hoje) em uma entrada por campo — a constraint
 * de maior prioridade (`CONSTRAINT_PRIORITY`) de cada campo decide `code`/`message`.
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
      const [constraintKey, message] = pickConstraint(error.constraints);
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
