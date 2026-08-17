import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QuoteDto } from './quote.dto';

const VALID_BODY = { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' };

async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(QuoteDto, body);
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

describe('QuoteDto', () => {
  it('body válido: validate() devolve []', async () => {
    const errors = await validateBody(VALID_BODY);

    expect(errors).toEqual([]);
  });

  it('miles ausente: constraints.isInt', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'miles'));

    const error = errors.find((e) => e.property === 'miles');
    expect(error?.constraints).toHaveProperty('isInt');
  });

  it('miles = 0: constraints.min', async () => {
    const errors = await validateBody({ ...VALID_BODY, miles: 0 });

    const error = errors.find((e) => e.property === 'miles');
    expect(error?.constraints).toHaveProperty('min');
  });

  it('miles como string: constraints.isInt', async () => {
    const errors = await validateBody({ ...VALID_BODY, miles: '18500' });

    const error = errors.find((e) => e.property === 'miles');
    expect(error?.constraints).toHaveProperty('isInt');
  });

  it('taxesBrl ausente: constraints.isNumber', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'taxesBrl'));

    const error = errors.find((e) => e.property === 'taxesBrl');
    expect(error?.constraints).toHaveProperty('isNumber');
  });

  it('taxesBrl = -1: constraints.min', async () => {
    const errors = await validateBody({ ...VALID_BODY, taxesBrl: -1 });

    const error = errors.find((e) => e.property === 'taxesBrl');
    expect(error?.constraints).toHaveProperty('min');
  });

  it('taxesBrl = 38.505 (3 casas decimais): constraints.isNumber (via maxDecimalPlaces)', async () => {
    const errors = await validateBody({ ...VALID_BODY, taxesBrl: 38.505 });

    const error = errors.find((e) => e.property === 'taxesBrl');
    expect(error?.constraints).toHaveProperty('isNumber');
  });

  it('carrier ausente: constraints.isNotEmpty', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'carrier'));

    const error = errors.find((e) => e.property === 'carrier');
    expect(error?.constraints).toHaveProperty('isNotEmpty');
  });

  it('carrier vazio: constraints.isNotEmpty', async () => {
    const errors = await validateBody({ ...VALID_BODY, carrier: '' });

    const error = errors.find((e) => e.property === 'carrier');
    expect(error?.constraints).toHaveProperty('isNotEmpty');
  });
});
