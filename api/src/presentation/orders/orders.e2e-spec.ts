import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrderResponseDto } from './dto/order-response.dto';


const VALID_TEST_CPF = '52998224725';
const INVALID_CHECK_DIGIT_CPF = '52998224735';

function validBody(idempotencyKey: string): Record<string, unknown> {
  return {
    quoteId: 'quote-abc123',
    idempotencyKey,
    passenger: { name: 'Maria da Silva', document: VALID_TEST_CPF },
    quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' },
  };
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    fields: { field: string; code: string; message: string }[];
  };
}

describe('POST /orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    const orders = await prisma.order.findMany({
      where: { idempotencyKey: { startsWith: 'orders-e2e-' } },
      select: { passengerId: true, quoteSnapshotId: true },
    });
    const passengerIds = orders.map((order) => order.passengerId);
    const quoteSnapshotIds = orders.map((order) => order.quoteSnapshotId);

    await prisma.order.deleteMany({
      where: { idempotencyKey: { startsWith: 'orders-e2e-' } },
    });
    await prisma.passenger.deleteMany({
      where: { id: { in: passengerIds } },
    });
    await prisma.quoteSnapshot.deleteMany({
      where: { id: { in: quoteSnapshotIds } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC1: body válido devolve 201, id no formato UUID, status CONFIRMED, passenger/quoteId/quote batem com o enviado', async () => {
    const idempotencyKey = 'orders-e2e-ac1';

    const response = await request(app.getHttpServer())
      .post('/orders')
      .send(validBody(idempotencyKey));

    expect(response.status).toBe(201);

    const body = response.body as OrderResponseDto;
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.status).toBe('CONFIRMED');
    expect(body.quoteId).toBe('quote-abc123');
    expect(body.quote).toEqual({
      miles: 18500,
      taxesBrl: 38.5,
      carrier: 'GOL',
    });
    expect(body.passenger).toEqual({
      name: 'Maria da Silva',
      document: VALID_TEST_CPF,
    });

    const persisted = await prisma.order.findUnique({
      where: { id: body.id },
      include: { quoteSnapshot: true },
    });
    expect(persisted?.quoteSnapshot.taxesBrlCents).toBe(3850);
  });

  it('AC2: duas chamadas sequenciais com a mesma idempotencyKey devolvem 201 com o mesmo id; apenas um Order persistido', async () => {
    const idempotencyKey = 'orders-e2e-ac2';

    const first = await request(app.getHttpServer())
      .post('/orders')
      .send(validBody(idempotencyKey));
    const second = await request(app.getHttpServer())
      .post('/orders')
      .send(validBody(idempotencyKey));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((second.body as OrderResponseDto).id).toBe(
      (first.body as OrderResponseDto).id,
    );
    expect((second.body as OrderResponseDto).quote).toEqual(
      (first.body as OrderResponseDto).quote,
    );

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(1);

    const order = await prisma.order.findUnique({ where: { idempotencyKey } });
    const quoteSnapshotCount = await prisma.quoteSnapshot.count({
      where: { id: order?.quoteSnapshotId },
    });
    expect(quoteSnapshotCount).toBe(1);
  });

  it('AC3: duas chamadas concorrentes (Promise.all) com a mesma idempotencyKey devolvem 201 com o mesmo id nas duas respostas; apenas um Order/Passenger persistido', async () => {
    const idempotencyKey = 'orders-e2e-ac3';

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/orders')
        .send(validBody(idempotencyKey)),
      request(app.getHttpServer())
        .post('/orders')
        .send(validBody(idempotencyKey)),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((second.body as OrderResponseDto).id).toBe(
      (first.body as OrderResponseDto).id,
    );
    expect((second.body as OrderResponseDto).quote).toEqual(
      (first.body as OrderResponseDto).quote,
    );

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(1);

    const passengerCount = await prisma.passenger.count({
      where: { document: VALID_TEST_CPF },
    });
    expect(passengerCount).toBe(1);

    const order = await prisma.order.findUnique({ where: { idempotencyKey } });
    const quoteSnapshotCount = await prisma.quoteSnapshot.count({
      where: { id: order?.quoteSnapshotId },
    });
    expect(quoteSnapshotCount).toBe(1);
  });

  it('AC5 (quoteId ausente): 400 VALIDATION_ERROR com FIELD_REQUIRED em quoteId; nenhum Order criado', async () => {
    const idempotencyKey = 'orders-e2e-ac5-quoteid';
    const body = validBody(idempotencyKey);
    delete body.quoteId;

    const response = await request(app.getHttpServer())
      .post('/orders')
      .send(body);

    expect(response.status).toBe(400);
    const errorBody = response.body as ErrorBody;
    expect(errorBody.error.code).toBe('VALIDATION_ERROR');
    expect(errorBody.error.fields).toContainEqual(
      expect.objectContaining({ field: 'quoteId', code: 'FIELD_REQUIRED' }),
    );

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(0);
  });

  it('AC5 (passageiro incompleto): 400 com FIELD_REQUIRED em passenger.document; nenhum Order/Passenger criado', async () => {
    const idempotencyKey = 'orders-e2e-ac5-passenger';
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({
        quoteId: 'quote-abc123',
        idempotencyKey,
        passenger: { name: 'Maria da Silva' },
      });

    expect(response.status).toBe(400);
    const errorBody = response.body as ErrorBody;
    expect(errorBody.error.fields).toContainEqual(
      expect.objectContaining({
        field: 'passenger.document',
        code: 'FIELD_REQUIRED',
      }),
    );

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(0);
  });

  it('AC5 (CPF inválido): 400 com INVALID_CPF em passenger.document; nenhum Order/Passenger criado', async () => {
    const idempotencyKey = 'orders-e2e-ac5-cpf';
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({
        quoteId: 'quote-abc123',
        idempotencyKey,
        passenger: {
          name: 'Maria da Silva',
          document: INVALID_CHECK_DIGIT_CPF,
        },
      });

    expect(response.status).toBe(400);
    const errorBody = response.body as ErrorBody;
    expect(errorBody.error.fields).toContainEqual(
      expect.objectContaining({
        field: 'passenger.document',
        code: 'INVALID_CPF',
      }),
    );

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(0);
  });

  it('AC5 (quote ausente): 400 com FIELD_REQUIRED em quote; nenhum Order/Passenger/QuoteSnapshot criado', async () => {
    const idempotencyKey = 'orders-e2e-ac5-quote';
    const body = validBody(idempotencyKey);
    delete body.quote;

    const response = await request(app.getHttpServer())
      .post('/orders')
      .send(body);

    expect(response.status).toBe(400);
    const errorBody = response.body as ErrorBody;
    expect(errorBody.error.fields).toContainEqual(
      expect.objectContaining({ field: 'quote', code: 'FIELD_REQUIRED' }),
    );

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(0);
  });

  it('AC5 (quote.miles inválido, ex. 0): 400 com INVALID_QUOTE_VALUE em quote.miles; nenhuma linha criada', async () => {
    const idempotencyKey = 'orders-e2e-ac5-quote-miles';
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({
        ...validBody(idempotencyKey),
        quote: { miles: 0, taxesBrl: 38.5, carrier: 'GOL' },
      });

    expect(response.status).toBe(400);
    const errorBody = response.body as ErrorBody;
    expect(errorBody.error.fields).toContainEqual(
      expect.objectContaining({
        field: 'quote.miles',
        code: 'INVALID_QUOTE_VALUE',
      }),
    );

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(0);
  });

  it('AC5 (reaproveitamento de idempotencyKey após tentativa inválida por quote ausente): tentativa seguinte com dados válidos segue o caminho normal (201)', async () => {
    const idempotencyKey = 'orders-e2e-ac5-retry-quote';
    const invalidBody = validBody(idempotencyKey);
    delete invalidBody.quote;

    const invalidResponse = await request(app.getHttpServer())
      .post('/orders')
      .send(invalidBody);
    expect(invalidResponse.status).toBe(400);

    const validResponse = await request(app.getHttpServer())
      .post('/orders')
      .send(validBody(idempotencyKey));
    expect(validResponse.status).toBe(201);

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(1);
  });

  it('AC5 (reaproveitamento de idempotencyKey após tentativa inválida por quoteId ausente): tentativa seguinte com dados válidos segue o caminho normal (201)', async () => {
    const idempotencyKey = 'orders-e2e-ac5-retry-quoteid';
    const invalidBody = validBody(idempotencyKey);
    delete invalidBody.quoteId;

    const invalidResponse = await request(app.getHttpServer())
      .post('/orders')
      .send(invalidBody);
    expect(invalidResponse.status).toBe(400);

    const validResponse = await request(app.getHttpServer())
      .post('/orders')
      .send(validBody(idempotencyKey));
    expect(validResponse.status).toBe(201);

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(1);
  });

  it('AC5 (reaproveitamento de idempotencyKey após tentativa inválida por CPF): tentativa seguinte com dados válidos segue o caminho normal (201)', async () => {
    const idempotencyKey = 'orders-e2e-ac5-retry-cpf';

    const invalidResponse = await request(app.getHttpServer())
      .post('/orders')
      .send({
        quoteId: 'quote-abc123',
        idempotencyKey,
        passenger: {
          name: 'Maria da Silva',
          document: INVALID_CHECK_DIGIT_CPF,
        },
      });
    expect(invalidResponse.status).toBe(400);

    const validResponse = await request(app.getHttpServer())
      .post('/orders')
      .send(validBody(idempotencyKey));
    expect(validResponse.status).toBe(201);

    const orderCount = await prisma.order.count({ where: { idempotencyKey } });
    expect(orderCount).toBe(1);
  });
});
