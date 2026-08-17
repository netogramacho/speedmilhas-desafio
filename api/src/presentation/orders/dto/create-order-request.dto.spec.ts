import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { validationExceptionFactory } from '../../../common/validation/validation-exception-factory';
import { CreateOrderRequestDto } from './create-order-request.dto';

const VALID_BODY = {
  quoteId: 'quote-abc123',
  idempotencyKey: 'e2e-key-1',
  passenger: { name: 'Maria da Silva', document: '52998224725' },
  quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' },
};

async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateOrderRequestDto, body);
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

function withPassenger(
  body: Record<string, unknown>,
  passenger: Record<string, unknown>,
): Record<string, unknown> {
  return { ...body, passenger };
}

function withQuote(
  body: Record<string, unknown>,
  quote: Record<string, unknown>,
): Record<string, unknown> {
  return { ...body, quote };
}

describe('CreateOrderRequestDto', () => {
  it('body totalmente válido: validate() devolve []', async () => {
    const errors = await validateBody(VALID_BODY);

    expect(errors).toEqual([]);
  });

  it('quoteId ausente: erro constraints.isNotEmpty no campo raiz', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'quoteId'));

    const error = errors.find((e) => e.property === 'quoteId');
    expect(error?.constraints).toHaveProperty('isNotEmpty');
  });

  it('idempotencyKey ausente: erro constraints.isNotEmpty no campo raiz', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'idempotencyKey'));

    const error = errors.find((e) => e.property === 'idempotencyKey');
    expect(error?.constraints).toHaveProperty('isNotEmpty');
  });

  it('passenger ausente: erro no campo passenger', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'passenger'));

    const error = errors.find((e) => e.property === 'passenger');
    expect(error).toBeDefined();
  });

  it('passenger.name/passenger.document ausentes: erro aninhado com children', async () => {
    const errors = await validateBody(withPassenger(VALID_BODY, {}));

    const passengerError = errors.find((e) => e.property === 'passenger');
    expect(passengerError?.children).toBeDefined();

    const childProperties = passengerError?.children?.map((c) => c.property);
    expect(childProperties).toEqual(
      expect.arrayContaining(['name', 'document']),
    );
  });

  it('quote ausente: erro no campo quote', async () => {
    const errors = await validateBody(omit(VALID_BODY, 'quote'));

    const error = errors.find((e) => e.property === 'quote');
    expect(error).toBeDefined();
  });

  it('quote: null: erro no campo quote (mesmo comportamento de quote ausente)', async () => {
    const errors = await validateBody({ ...VALID_BODY, quote: null });

    const error = errors.find((e) => e.property === 'quote');
    expect(error).toBeDefined();
  });

  it('quote.miles/quote.taxesBrl/quote.carrier ausentes: erro aninhado com children', async () => {
    const errors = await validateBody(withQuote(VALID_BODY, {}));

    const quoteError = errors.find((e) => e.property === 'quote');
    expect(quoteError?.children).toBeDefined();

    const childProperties = quoteError?.children?.map((c) => c.property);
    expect(childProperties).toEqual(
      expect.arrayContaining(['miles', 'taxesBrl', 'carrier']),
    );
  });

  describe('code final via validationExceptionFactory', () => {
    it('quoteId ausente: FIELD_REQUIRED', async () => {
      const codes = await codesFor(omit(VALID_BODY, 'quoteId'));

      expect(codes.quoteId).toBe('FIELD_REQUIRED');
    });

    it('idempotencyKey ausente: FIELD_REQUIRED', async () => {
      const codes = await codesFor(omit(VALID_BODY, 'idempotencyKey'));

      expect(codes.idempotencyKey).toBe('FIELD_REQUIRED');
    });

    it('passenger.name ausente: FIELD_REQUIRED em passenger.name', async () => {
      const codes = await codesFor(
        withPassenger(VALID_BODY, { document: '52998224725' }),
      );

      expect(codes['passenger.name']).toBe('FIELD_REQUIRED');
    });

    it('passenger.document ausente: FIELD_REQUIRED em passenger.document (não INVALID_CPF)', async () => {
      const codes = await codesFor(
        withPassenger(VALID_BODY, { name: 'Maria da Silva' }),
      );

      expect(codes['passenger.document']).toBe('FIELD_REQUIRED');
    });

    it('passenger.document com dígito verificador inválido: INVALID_CPF', async () => {
      const codes = await codesFor(
        withPassenger(VALID_BODY, {
          name: 'Maria da Silva',
          document: '52998224735',
        }),
      );

      expect(codes['passenger.document']).toBe('INVALID_CPF');
    });

    it('passenger.document em sequência repetida: INVALID_CPF', async () => {
      const codes = await codesFor(
        withPassenger(VALID_BODY, {
          name: 'Maria da Silva',
          document: '11111111111',
        }),
      );

      expect(codes['passenger.document']).toBe('INVALID_CPF');
    });

    it('passenger.document com menos de 11 dígitos: INVALID_CPF', async () => {
      const codes = await codesFor(
        withPassenger(VALID_BODY, {
          name: 'Maria da Silva',
          document: '123456789',
        }),
      );

      expect(codes['passenger.document']).toBe('INVALID_CPF');
    });

    it('quote.miles ausente: FIELD_REQUIRED', async () => {
      const codes = await codesFor(
        withQuote(VALID_BODY, { taxesBrl: 38.5, carrier: 'GOL' }),
      );

      expect(codes['quote.miles']).toBe('FIELD_REQUIRED');
    });

    it('quote.miles = 0: INVALID_QUOTE_VALUE', async () => {
      const codes = await codesFor(
        withQuote(VALID_BODY, { miles: 0, taxesBrl: 38.5, carrier: 'GOL' }),
      );

      expect(codes['quote.miles']).toBe('INVALID_QUOTE_VALUE');
    });

    it('quote.taxesBrl = -1: INVALID_QUOTE_VALUE', async () => {
      const codes = await codesFor(
        withQuote(VALID_BODY, {
          miles: 18500,
          taxesBrl: -1,
          carrier: 'GOL',
        }),
      );

      expect(codes['quote.taxesBrl']).toBe('INVALID_QUOTE_VALUE');
    });

    it('quote.taxesBrl = 38.505 (3 casas decimais): FIELD_REQUIRED', async () => {
      const codes = await codesFor(
        withQuote(VALID_BODY, {
          miles: 18500,
          taxesBrl: 38.505,
          carrier: 'GOL',
        }),
      );

      expect(codes['quote.taxesBrl']).toBe('FIELD_REQUIRED');
    });

    it('quote.miles = "abc" (dispara isInt e min juntos): FIELD_REQUIRED, não INVALID_QUOTE_VALUE', async () => {
      const codes = await codesFor(
        withQuote(VALID_BODY, {
          miles: 'abc',
          taxesBrl: 38.5,
          carrier: 'GOL',
        }),
      );

      expect(codes['quote.miles']).toBe('FIELD_REQUIRED');
    });
  });
});
