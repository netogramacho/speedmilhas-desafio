import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { SearchResponseDto } from './dto/search-response.dto';

/**
 * Teste de integração fim a fim (`claude/specs/DSM-5/spec.md`, "Plano de testes"): sobe o
 * `AppModule` real via `Test.createTestingModule` + `app.init()`, usa `supertest` contra o
 * servidor HTTP real e bate no `mock-suppliers` real (`docker compose up -d`,
 * `parametros-tecnicos.md` item 13). Requer `mock-suppliers` saudável em `localhost:4000`.
 */

const MOCK_SUPPLIERS_BASE_URL = 'http://localhost:4000';
// Margem sobre SEARCH_TOTAL_TIMEOUT_MS (6000ms) para absorver overhead de execução da suíte, não
// do endpoint em si — ver "Plano de testes" da spec.
const AC5_MEASURED_TIME_MARGIN_MS = 6200;

async function resetMockSuppliers(): Promise<void> {
  await fetch(`${MOCK_SUPPLIERS_BASE_URL}/admin/reset`, { method: 'POST' });
}

async function forceSlow(supplier: string): Promise<void> {
  await fetch(`${MOCK_SUPPLIERS_BASE_URL}/admin/force-slow/${supplier}`, {
    method: 'POST',
  });
}

async function fetchTotalCalls(): Promise<number> {
  const response = await fetch(`${MOCK_SUPPLIERS_BASE_URL}/admin/stats`);
  const body = (await response.json()) as { totalCalls: number };
  return body.totalCalls;
}

describe('POST /search (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await resetMockSuppliers();
  });

  afterAll(async () => {
    await resetMockSuppliers();
    await app.close();
  });

  it('caminho feliz: body válido devolve 200, status complete|partial, quotes não vazio, suppliers com as 3 chaves', async () => {
    const response = await request(app.getHttpServer())
      .post('/search')
      .send({ origin: 'GRU', destination: 'GIG', date: '2026-08-15' });

    expect(response.status).toBe(200);

    const body = response.body as SearchResponseDto;
    expect(['complete', 'partial']).toContain(body.status);
    expect(body.quotes.length).toBeGreaterThan(0);
    expect(Object.keys(body.suppliers).sort()).toEqual([
      'supplier-a',
      'supplier-b',
      'supplier-c',
    ]);
  });

  it('AC5: força supplier-b lento (8s) — tempo end-to-end medido fica dentro do teto de 6s, supplier-b marcado como timeout', async () => {
    await forceSlow('supplier-b');

    const startedAt = Date.now();
    const response = await request(app.getHttpServer())
      .post('/search')
      .send({ origin: 'GRU', destination: 'GIG', date: '2026-08-15' });
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(elapsedMs).toBeLessThanOrEqual(AC5_MEASURED_TIME_MARGIN_MS);

    const body = response.body as SearchResponseDto;
    expect(body.suppliers['supplier-b']).toBe('timeout');

    await resetMockSuppliers();
  }, 10000);

  it('400 sem chamar fornecedor: body inválido (origin ausente) não incrementa totalCalls do mock', async () => {
    const totalCallsBefore = await fetchTotalCalls();

    const response = await request(app.getHttpServer())
      .post('/search')
      .send({ destination: 'GIG', date: '2026-08-15' });

    expect(response.status).toBe(400);

    const body = response.body as {
      error: {
        code: string;
        message: string;
        fields: { field: string; code: string; message: string }[];
      };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof body.error.message).toBe('string');
    const originField = body.error.fields.find(
      (field) => field.field === 'origin',
    );
    expect(originField).toBeDefined();
    // Regressão do achado 1 do review de DSM-5: campo ausente deve mapear para FIELD_REQUIRED,
    // não para o code do validador mais específico (ex.: AIRPORT_NOT_SUPPORTED).
    expect(originField?.code).toBe('FIELD_REQUIRED');

    const totalCallsAfter = await fetchTotalCalls();
    expect(totalCallsAfter).toBe(totalCallsBefore);
  });

  it('400 sem chamar fornecedor: body com campo extra não declarado no DTO é rejeitado pelo forbidNonWhitelisted', async () => {
    const totalCallsBefore = await fetchTotalCalls();

    const response = await request(app.getHttpServer()).post('/search').send({
      origin: 'GRU',
      destination: 'GIG',
      date: '2026-08-15',
      foo: 'bar',
    });

    expect(response.status).toBe(400);

    const body = response.body as {
      error: {
        code: string;
        message: string;
        fields: { field: string; code: string; message: string }[];
      };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof body.error.message).toBe('string');
    const extraField = body.error.fields.find((field) => field.field === 'foo');
    expect(extraField).toBeDefined();
    expect(extraField?.message).toBe('property foo should not exist');

    const totalCallsAfter = await fetchTotalCalls();
    expect(totalCallsAfter).toBe(totalCallsBefore);
  });
});
