import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SearchRequestDto } from './search-request.dto';

const VALID_BODY = { origin: 'GRU', destination: 'GIG', date: '2026-08-15' };

async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(SearchRequestDto, body);
  return validate(dto);
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
});
