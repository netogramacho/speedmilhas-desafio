import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Constraint usada via `@Validate(IsValidCalendarDate)` — confirma que um texto no formato
 * `YYYY-MM-DD` (o formato em si é validado à parte, por `@Matches`, em
 * `search-request.dto.ts`) é uma data de calendário real: rejeita dia/mês fora de alcance (ex.
 * `2026-02-30`), reconstruindo a data via `Date.UTC` e comparando contra os componentes originais
 * (`Date` normaliza datas inválidas em vez de rejeitá-las, por isso a comparação por componente em
 * vez de só checar `isNaN`).
 */
@ValidatorConstraint({ name: 'isValidCalendarDate', async: false })
export class IsValidCalendarDate implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const match = DATE_PATTERN.exec(value);
    if (!match) {
      return false;
    }

    const [, yearStr, monthStr, dayStr] = match;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} deve ser uma data de calendário válida`;
  }
}
