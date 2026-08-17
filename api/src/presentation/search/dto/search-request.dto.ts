import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, Matches, Validate } from 'class-validator';

import { SUPPORTED_AIRPORTS } from '../supported-airports';
import { IsDifferentFrom } from './validators/is-different-from.validator';
import { IsValidCalendarDate } from './validators/is-valid-calendar-date.validator';

/** `trim()` + `toUpperCase()`, espelhando `normalizeQuery` do mock (`mock-suppliers/src/index.js:107-109`). */
function normalizeAirportCode({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

const DATE_FORMAT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Corpo de `POST /search`. Validado pelo `ValidationPipe` global (`app.module.ts`) antes de
 * chegar ao `SearchController` — nenhum fornecedor é chamado se algo aqui for inválido.
 */
export class SearchRequestDto {
  @Transform(normalizeAirportCode)
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_AIRPORTS)
  origin!: string;

  @Transform(normalizeAirportCode)
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_AIRPORTS)
  @Validate(IsDifferentFrom, ['origin'])
  destination!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(DATE_FORMAT_PATTERN)
  @Validate(IsValidCalendarDate)
  date!: string;
}
