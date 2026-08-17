import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { validationExceptionFactory } from '../../../common/validation/validation-exception-factory';
import { SearchRequestDto } from './search-request.dto';

const VALID_BODY = { origin: 'GRU', destination: 'GIG', date: '2026-08-15' };

async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(SearchRequestDto, body);
  return validate(dto);
}

/** Roda o DTO real através de `validationExceptionFactory`, de ponta a ponta — é assim que o
 * `ValidationPipe` global (`app.module.ts`) monta o `code` de fato entregue ao cliente. */
async function codesFor(
  body: Record<string, unknown>,
): Promise<Record<string, string>> {
  const errors = await validateBody(body);
  const response = validationExceptionFactory(errors).getResponse() as {
    fields: { field: string; code: string }[];
  };
  return Object.fromEntries(
    response.fields.map((field) => [field.field, field.code]),
  );
}

function omit(
  body: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const copy = { ...body };
  delete copy[field];
  return copy;
}

describe('SearchRequestDto', () => {
  it('body totalmente válido: validate() devolve []', async () => {
    const errors = await validateBody(VALID_BODY);

    expect(errors).toEqual([]);
  });

  it('origin ausente: erro com constraints.isNotEmpty', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'origin'));

    const originError = errors.find((e) => e.property === 'origin');
    expect(originError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('destination ausente: erro com constraints.isNotEmpty', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'destination'));

    const destinationError = errors.find((e) => e.property === 'destination');
    expect(destinationError?.constraints).toHaveProperty('isNotEmpty');
  });

  it('origin fora de SUPPORTED_AIRPORTS: erro com constraints.isIn', async () => {
    const errors = await validateBody({ ...VALID_BODY, origin: 'XXX' });

    const originError = errors.find((e) => e.property === 'origin');
    expect(originError?.constraints).toHaveProperty('isIn');
  });

  it('origin === destination: erro com constraints.isDifferentFrom no campo destination', async () => {
    const errors = await validateBody({
      ...VALID_BODY,
      origin: 'GRU',
      destination: 'GRU',
    });

    const destinationError = errors.find((e) => e.property === 'destination');
    expect(destinationError?.constraints).toHaveProperty('isDifferentFrom');
  });

  it('origin/destination em minúsculo: válido após @Transform (normalizado para maiúsculo)', async () => {
    const errors = await validateBody({
      ...VALID_BODY,
      origin: 'gru',
      destination: ' gig ',
    });

    expect(errors).toEqual([]);
  });

  it('date fora do formato (15-08-2026): erro constraints.matches', async () => {
    const errors = await validateBody({ ...VALID_BODY, date: '15-08-2026' });

    const dateError = errors.find((e) => e.property === 'date');
    expect(dateError?.constraints).toHaveProperty('matches');
  });

  it('date fora do formato (2026/08/15): erro constraints.matches', async () => {
    const errors = await validateBody({ ...VALID_BODY, date: '2026/08/15' });

    const dateError = errors.find((e) => e.property === 'date');
    expect(dateError?.constraints).toHaveProperty('matches');
  });

  it('date no formato certo mas inexistente no calendário (2026-02-30): erro constraints.isValidCalendarDate', async () => {
    const errors = await validateBody({ ...VALID_BODY, date: '2026-02-30' });

    const dateError = errors.find((e) => e.property === 'date');
    expect(dateError?.constraints).toHaveProperty('isValidCalendarDate');
  });

  it('date válida (2026-08-15): sem erro', async () => {
    const errors = await validateBody({ ...VALID_BODY, date: '2026-08-15' });

    const dateError = errors.find((e) => e.property === 'date');
    expect(dateError).toBeUndefined();
  });

  // Ponta a ponta: SearchRequestDto real (plainToInstance + validate()) através de
  // validationExceptionFactory, confirmando o `code` que de fato chega ao cliente via
  // ValidationPipe — não só a presença da constraint no objeto do class-validator (achado 1 do
  // review de DSM-5).
  describe('code final via validationExceptionFactory', () => {
    it('origin ausente: FIELD_REQUIRED (não AIRPORT_NOT_SUPPORTED)', async () => {
      const codes = await codesFor(omit(VALID_BODY, 'origin'));

      expect(codes.origin).toBe('FIELD_REQUIRED');
    });

    it('destination ausente: FIELD_REQUIRED (não ORIGIN_EQUALS_DESTINATION)', async () => {
      const codes = await codesFor(omit(VALID_BODY, 'destination'));

      expect(codes.destination).toBe('FIELD_REQUIRED');
    });

    it('date ausente: FIELD_REQUIRED (não INVALID_DATE)', async () => {
      const codes = await codesFor(omit(VALID_BODY, 'date'));

      expect(codes.date).toBe('FIELD_REQUIRED');
    });

    it('origin com tipo errado (número): FIELD_REQUIRED', async () => {
      const codes = await codesFor({ ...VALID_BODY, origin: 123 });

      expect(codes.origin).toBe('FIELD_REQUIRED');
    });

    it('origin fora de SUPPORTED_AIRPORTS: AIRPORT_NOT_SUPPORTED', async () => {
      const codes = await codesFor({ ...VALID_BODY, origin: 'XXX' });

      expect(codes.origin).toBe('AIRPORT_NOT_SUPPORTED');
    });

    it('origin === destination: ORIGIN_EQUALS_DESTINATION', async () => {
      const codes = await codesFor({
        ...VALID_BODY,
        origin: 'GRU',
        destination: 'GRU',
      });

      expect(codes.destination).toBe('ORIGIN_EQUALS_DESTINATION');
    });

    it('date presente mas inexistente no calendário (2026-02-30): INVALID_DATE', async () => {
      const codes = await codesFor({ ...VALID_BODY, date: '2026-02-30' });

      expect(codes.date).toBe('INVALID_DATE');
    });

    it('date fora do formato (15-08-2026): INVALID_DATE_FORMAT', async () => {
      const codes = await codesFor({ ...VALID_BODY, date: '15-08-2026' });

      expect(codes.date).toBe('INVALID_DATE_FORMAT');
    });
  });
});
