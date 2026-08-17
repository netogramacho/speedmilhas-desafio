# DSM-5 — Endpoint `POST /search`

## Contexto

User story: `claude/specs/DSM-5/user-story.md`.

`SearchAggregatorService.search(query)` (DSM-4, `api/src/search/search-aggregator.service.ts`) já
consulta os três fornecedores em paralelo, corta em `SEARCH_TOTAL_TIMEOUT_MS` (6s por padrão) e
devolve `{ quotes, outcomes }` (`AggregatedSearchResult`, `api/src/search/types.ts`) — nunca lança,
mesmo quando todos os fornecedores falham. Falta expor isso como contrato HTTP público: receber
`{ origin, destination, date }` no corpo, validar **antes** de chamar qualquer fornecedor, e
traduzir `AggregatedSearchResult` para a resposta JSON que a DSM-9 (tela de busca) vai consumir —
incluindo o rótulo de status geral (`complete`/`partial`) que a DSM-4 deliberadamente deixou de
fora (`search/types.ts:24-28`).

Reaproveitado sem alteração: `SearchAggregatorService`, `SearchModule` (`api/src/search/`),
`SupplierQuoteQuery`/`SupplierId`/`Quote` (`api/src/suppliers/types.ts`), `ConfigModule` global. O
comentário em `SupplierQuoteQuery.date` (`suppliers/types.ts:36`, "já validado por quem chama, fora
do escopo desta story") é exatamente o contrato que a DSM-5 cumpre agora.

**Fora de escopo (mantido conforme a story):** autenticação; paginação (bônus, DSM-14); cache
(bônus, DSM-11); as combinações mais profundas de falha parcial testadas via `/admin/force-*`
(bônus DSM-13 — esta story cobre o cenário mínimo exigido pela própria AC5 de medir o tempo
end-to-end, DSM-13 aprofunda).

**Nota sobre este processo:** o ambiente desta sessão não deu acesso à ferramenta interativa de
pergunta ao desenvolvedor (só leitura/escrita de arquivo e busca). Os pontos abaixo que têm mais de
uma abordagem razoável foram **decididos por este agente** (não por confirmação do desenvolvedor),
seguindo os padrões já fixados em `claude/config/parametros-tecnicos.md` (validação via
`class-validator`/`ValidationPipe`, filtro de erro global, código/chave estável nas mensagens de
erro, arquitetura em camadas) e a consistência com DSM-1 a DSM-4. Cada decisão não trivial está
justificada abaixo e marcada explicitamente — revisar antes de implementar, em especial as
marcadas "decisão aberta" na tabela de casos de borda.

## Arquitetura decidida

- **Controller único no módulo existente:** `SearchController` (`@Controller()`, método
  `@Post('search')`) entra em `api/src/search/`, registrado em `SearchModule` (que já existe e já
  exporta `SearchAggregatorService` — DSM-4). Não cria módulo novo; segue a diretriz de estrutura
  por domínio já fixada (`parametros-tecnicos.md`, item 10: `search/ # DSM-4/5 — agregação +
  endpoint POST /search`).
- **Validação de entrada — `class-validator` + `class-transformer` + `ValidationPipe` global**,
  exatamente como já fixado em `parametros-tecnicos.md` item 10. Nenhuma das duas libs está em
  `api/package.json` hoje — é esta story que as introduz (primeiro DTO/controller do projeto). Pipe
  registrado via `APP_PIPE` em `AppModule` (não `app.useGlobalPipes` solto em `main.ts`), para valer
  também quando a aplicação sobe via `Test.createTestingModule({ imports: [AppModule] }).compile()`
  nos testes (mesmo padrão de bootstrap usado por `app.module.spec.ts` e pelo teste de integração
  desta story), sem depender de `main.ts` ser executado.
- **Filtro de exceção global, não tratamento ad hoc no controller:** `AllExceptionsFilter`
  (`@Catch()`), registrado via `APP_FILTER` em `AppModule`, produz um envelope único de erro para
  qualquer exceção da API (400 de validação hoje; reaproveitável por 404/409 quando RF2 — DSM-6/7 —
  existir), conforme já fixado em `parametros-tecnicos.md` item 10 ("Resposta de erro padronizada
  via exception filter global"). O `exceptionFactory` do `ValidationPipe` não lança um formato ad
  hoc — monta um `BadRequestException` com um payload estruturado (`code`, `fields`) que o filtro
  reconhece e repassa; qualquer outra exceção (incluindo erro não tratado, que viraria 500) cai no
  envelope genérico do filtro. Ver "Contratos de dados".
- **Código estável por campo inválido, não só mensagem em pt-BR** — decisão já fixada em
  `parametros-tecnicos.md` item 15 ("respostas de erro/validação expostas ao cliente carregam um
  código/chave estável"). Cada `ValidationError` do `class-validator` já expõe as chaves de
  constraint violadas (`error.constraints`, ex.: `{ isIn: '...' }`) — mapeadas aqui para códigos
  legíveis (`AIRPORT_NOT_SUPPORTED`, `INVALID_DATE_FORMAT`, `INVALID_DATE`,
  `ORIGIN_EQUALS_DESTINATION`, `FIELD_REQUIRED`), com fallback genérico
  (`constraintKey.toUpperCase()`) para qualquer validador futuro não mapeado explicitamente — não é
  necessário manter a tabela 100% exaustiva a cada novo DTO.
- **Lista de aeroportos suportados — constante estática no código da API, não buscada do
  `mock-suppliers` em runtime.** *(Decisão deste agente, sem alternativa real melhor dado o
  restante da story — ver justificativa.)* O catálogo é fixo e documentado no `README.md`
  (`GRU, GIG, BSB, SSA, REC, POA, CNF, FOR`) e no próprio `mock-suppliers/src/index.js:31`
  (`AIRPORTS`, arquivo que a regra do desafio proíbe alterar, mas não proíbe ler/copiar a lista
  fixa dele). Buscar essa lista via `GET /` do mock a cada validação (ou mesmo só no boot)
  introduziria uma dependência de rede exatamente na etapa que a AC de DSM-5 exige ser síncrona e
  sem chamar nenhum fornecedor ("retorna 400 ... sem chamar nenhum fornecedor") — e o mock, sendo
  "instável de propósito", é o pior lugar para depender de uma chamada de rede na validação de
  entrada. `SUPPORTED_AIRPORTS` fica em `api/src/search/supported-airports.ts`, comentado com a
  origem (README) para não parecer um número mágico.
- **Formato do corpo de sucesso (200) — decisões deste agente, sem confirmação interativa:**
  - `status: 'complete' | 'partial'` — **binário**, derivado só de `outcomes`: `'complete'` sse os
    3 outcomes são `'ok'`; senão `'partial'` (inclui o caso extremo de nenhum fornecedor responder
    — `quotes: []`, os 3 outcomes não-`'ok'`). *Decisão aberta:* a user story só define
    literalmente os dois casos opostos ("todos responderam" → `complete`; "ao menos um falhou mas
    ao menos um respondeu" → `partial`) e não cobre o caso "nenhum respondeu". A DSM-9 (frontend)
    já precisa, por conta própria, distinguir esse caso extremo de um `partial` normal para exibir
    "erro" em vez do aviso neutro de parcial (user-story DSM-9, AC4: "todas as cotações vazias com
    todos os fornecedores marcados como falha" faz parte do estado de erro, não do de parcial) —
    ou seja, o frontend já vai inspecionar `quotes.length === 0 && suppliers` todos não-`ok`
    independentemente do texto exato do `status`. Manter só 2 valores no contrato do backend (em
    vez de um terceiro `'failed'`/`'empty'`) evita duplicar essa regra dos dois lados; se o
    desenvolvedor preferir um terceiro valor explícito para simplificar a DSM-9, é uma mudança
    aditiva pequena neste mapper (`search-response.mapper.ts`), sem tocar `SearchAggregatorService`.
  - `suppliers` como **objeto com as chaves completas `SupplierId`** (`"supplier-a"`,
    `"supplier-b"`, `"supplier-c"`), não os apelidos curtos `a`/`b`/`c` do exemplo literal da user
    story. A própria AC diz "ou estrutura equivalente". Motivo: `SupplierId` já é o identificador
    usado em todo o backend (`suppliers/types.ts`, `SupplierOutcome.supplier`, logs) — reexpor com
    um alias diferente só na borda HTTP criaria uma segunda nomenclatura para a mesma coisa sem
    ganho real. *Decisão aberta:* se a tela (DSM-9) preferir chaves curtas por conveniência de UI,
    é uma troca de uma linha no mapper.
  - Cada item de `quotes` expõe só `{ miles, taxesBrl, carrier }` — **sem** o campo interno
    `supplier` de `Quote` (`suppliers/types.ts:12-17`). A DSM-9 não pede agrupar/rotular cotações
    por fornecedor de origem na lista, só ordenar por milhas e mostrar o aviso de parcial à parte
    (via `suppliers`); expor `supplier` por cotação seria informação sem consumidor definido ainda
    (YAGNI, mesmo espírito das decisões de DSM-3 de não estender contratos sem necessidade
    comprovada). Aditivo e reversível se a UI precisar depois.
- **Sem timeout adicional no controller/HTTP:** o handler só faz `await
  searchAggregatorService.search(...)` — nenhum `Promise.race`/timer extra na camada HTTP. A
  DSM-4 já garante que `search()` resolve em até `SEARCH_TOTAL_TIMEOUT_MS` (6000ms por padrão); o
  overhead do próprio Nest (parsing do body, `ValidationPipe`, serialização da resposta) é da ordem
  de poucos milissegundos e não é descontado do orçamento de 6s — não há necessidade de reduzir
  `SEARCH_TOTAL_TIMEOUT_MS` para compensar isso. É esse ponto que o teste de integração desta story
  mede de verdade (AC5: "medido o tempo de resposta end-to-end do endpoint, não só da camada
  interna").
- **HTTP status sempre 200 para entrada válida**, mesmo quando todos os fornecedores falham —
  herdado da decisão já tomada na DSM-4 (AC4: "resposta ainda é bem formada, não erro 500").
  `POST /search` só devolve status diferente de 200 para entrada inválida (400). Não há caminho
  para 500 nesta story: `SearchAggregatorService.search` nunca lança (contrato DSM-4), e o
  `AllExceptionsFilter` cobre qualquer exceção verdadeiramente inesperada sem deixá-la vazar como
  stack trace ao cliente.
- **Normalização leniente de `origin`/`destination`:** `trim()` + `toUpperCase()` antes de validar
  contra `SUPPORTED_AIRPORTS` (`@Transform` do `class-transformer`), espelhando exatamente o que
  `normalizeQuery` do mock já faz (`mock-suppliers/src/index.js:107-109`) — aceitar `"gru"` além de
  `"GRU"` é melhor UX e não amplia o conjunto de aeroportos aceitos, só a forma de digitá-los.
- **`origin === destination` é erro de validação (400), não erro 500 nem chamada aos
  fornecedores** — mesma regra que o mock já aplica (`mock-suppliers/src/index.js:118-120`) — via
  um `ValidatorConstraint` de campo cruzado (`IsDifferentFrom`), avaliado antes de qualquer chamada
  de fornecedor (cumpre literalmente a AC "sem chamar nenhum fornecedor").
- **Formato de data — só `YYYY-MM-DD` estrito**, sem aceitar timestamp/hora embutidos (o regex do
  mock aceita esse prefixo, mas normaliza cortando o resto — `mock-suppliers/src/index.js:122-124`;
  a DSM-5 é mais estrita de propósito, rejeitando o que o mock só tolera). *Decisão deste agente:*
  motivo é manter o formato de entrada idêntico ao que um `<input type="date">` nativo do formulário
  da DSM-9 produz, e mensagens de erro inequívocas — não há requisito na story ou no README pedindo
  suporte a datetime. Além do formato, valida-se que é uma **data de calendário real** (rejeita
  `2026-02-30`), mas **não** se aplica nenhuma regra de negócio sobre passado/futuro (não pedida em
  lugar nenhum da story/README) — decisão deliberada de não inventar escopo; se o desenvolvedor
  quiser essa regra depois, é um novo `@Validate` no mesmo DTO.

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/src/search/supported-airports.ts` | Constante `SUPPORTED_AIRPORTS` (os 8 códigos IATA do README/mock) + tipo `SupportedAirport`. Sem import de `@nestjs/*`. |
| `api/src/search/dto/search-request.dto.ts` | `SearchRequestDto`: `origin`/`destination` (`@Transform` trim+uppercase, `@IsIn(SUPPORTED_AIRPORTS)`, `destination` também com `@Validate(IsDifferentFrom, ['origin'])`), `date` (`@Matches(/^\d{4}-\d{2}-\d{2}$/)` + `@Validate(IsValidCalendarDate)`). Infra de transporte — pode importar `class-validator`/`class-transformer`, não é domínio puro. |
| `api/src/search/dto/is-different-from.validator.ts` | `@ValidatorConstraint` custom `IsDifferentFrom` — compara o campo decorado com outro campo do mesmo objeto (usado para `origin !== destination`). |
| `api/src/search/dto/is-valid-calendar-date.validator.ts` | `@ValidatorConstraint` custom `IsValidCalendarDate` — dado um texto já no formato `YYYY-MM-DD` (regex separado cuida do formato), confirma que é uma data de calendário real (rejeita dia/mês fora de alcance, ex. `2026-02-30`) comparando `Date.UTC(...)` reconstruído contra os componentes originais. |
| `api/src/search/search-response.mapper.ts` | Função pura `mapAggregatedResultToResponse(result: AggregatedSearchResult): SearchResponseDto` — deriva `status` (`complete`/`partial`), `suppliers` (outcomes → `Record<SupplierId, SupplierOutcomeStatus>`), `quotes` (mapeia `Quote` para `{ miles, taxesBrl, carrier }`, descarta `supplier`). Sem import de `@nestjs/*` (domínio puro, item 16 de `parametros-tecnicos.md`). |
| `api/src/search/dto/search-response.dto.ts` | Tipos de saída: `SearchResponseQuoteDto`, `SearchResponseDto` (`{ status, quotes, suppliers }`). |
| `api/src/search/search.controller.ts` | `SearchController` (`@Controller()`): injeta `SearchAggregatorService`. `POST /search` (`@HttpCode(200)`): recebe `SearchRequestDto` (já validado pelo `ValidationPipe` global antes de chegar aqui), chama `searchAggregatorService.search({ origin, destination, date })`, devolve `mapAggregatedResultToResponse(result)`. |
| `api/src/common/filters/all-exceptions.filter.ts` | `AllExceptionsFilter` (`@Catch()`, `implements ExceptionFilter`): produz o envelope `{ error: { code, message, fields? } }` para qualquer exceção. Se a exceção for uma `HttpException` cujo `getResponse()` já tem `{ code, fields }` (produzida pelo `exceptionFactory` da validação), repassa `code`/`fields`/`message` como estão; caso contrário monta um envelope genérico a partir do status HTTP (`code` = nome do status em `UPPER_SNAKE_CASE`, ex. `NOT_FOUND`, `INTERNAL_ERROR` para 500/erro não-`HttpException`). |
| `api/src/common/validation/validation-exception-factory.ts` | `validationExceptionFactory(errors: ValidationError[]): BadRequestException` — usado como `exceptionFactory` do `ValidationPipe`; monta `fields: [{ field, code, message }]` a partir de `errors` (recursivo para erros aninhados, não necessário nesta story pois `SearchRequestDto` é raso), usando `CONSTRAINT_ERROR_CODES` para o `code` de cada campo. |
| `api/src/common/validation/constraint-error-codes.ts` | `CONSTRAINT_ERROR_CODES: Record<string, string>` — mapeia chave de constraint do `class-validator` (`isIn`, `matches`, `isDifferentFrom`, `isValidCalendarDate`, `isNotEmpty`, `isString`) para código estável (`AIRPORT_NOT_SUPPORTED`, `INVALID_DATE_FORMAT`, `ORIGIN_EQUALS_DESTINATION`, `INVALID_DATE`, `FIELD_REQUIRED`, `FIELD_REQUIRED`). Fallback: `constraintKey.toUpperCase()`. |
| `api/src/search/supported-airports.spec.ts` | Teste trivial de sanidade — a constante tem exatamente os 8 códigos do README, sem duplicata. |
| `api/src/search/dto/search-request.dto.spec.ts` | Testes de validação do DTO via `class-validator` `validate()` direto — ver "Plano de testes". |
| `api/src/search/search-response.mapper.spec.ts` | Testes da função pura de mapeamento. |
| `api/src/search/search.controller.spec.ts` | Testes unitários do controller, mockando `SearchAggregatorService` via DI. |
| `api/src/common/validation/validation-exception-factory.spec.ts` | Testes da fábrica de exceção de validação. |
| `api/src/common/filters/all-exceptions.filter.spec.ts` | Testes do filtro global (formato do envelope para `BadRequestException` estruturada, `HttpException` genérica e erro não-`HttpException`). |
| `api/src/search/search.e2e-spec.ts` | Teste de integração fim a fim: sobe o `AppModule` real (`Test.createTestingModule({ imports: [AppModule] }).compile()` + `app.init()`), usa `supertest` contra o servidor HTTP real, e bate no `mock-suppliers` real (`docker compose up -d`, `parametros-tecnicos.md` item 13) — ver "Plano de testes". |

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `api/package.json` | Adicionar `class-validator` e `class-transformer` a `dependencies`; adicionar `supertest`/`@types/supertest` a `devDependencies` (para `search.e2e-spec.ts` — nenhum teste anterior no projeto usa `supertest`, esta story introduz). |
| `api/src/search/search.module.ts` | Adicionar `controllers: [SearchController]` (módulo já importa tudo que o controller precisa via `SearchAggregatorService`, que já é provider deste módulo). |
| `api/src/app.module.ts` | Registrar `{ provide: APP_PIPE, useFactory: ... }` (o `ValidationPipe` global, com `whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory`) e `{ provide: APP_FILTER, useClass: AllExceptionsFilter }` em `providers`. |

`api/src/search/search-aggregator.service.ts` e `api/src/search/types.ts` **não** são alterados —
o contrato `AggregatedSearchResult`/`SupplierOutcome` da DSM-4 já é suficiente como entrada do
mapper desta story. `api/src/suppliers/types.ts` também não é alterado. `DECISIONS.md` não é
tocado por esta story (mesma decisão mantida desde a DSM-2 — só a pergunta 1, sobre o fornecedor B
lento, é preenchida pelo desenvolvedor pessoalmente, sem ser parte do código).

## Contratos de dados

```ts
// api/src/search/supported-airports.ts

/** Catálogo fixo do desafio — README.md e mock-suppliers/src/index.js:31 (AIRPORTS), não altera. */
export const SUPPORTED_AIRPORTS = [
  'GRU', 'GIG', 'BSB', 'SSA', 'REC', 'POA', 'CNF', 'FOR',
] as const;

export type SupportedAirport = (typeof SUPPORTED_AIRPORTS)[number];
```

```ts
// api/src/search/dto/search-request.dto.ts

export class SearchRequestDto {
  origin!: string;       // normalizado para maiúsculo, validado contra SUPPORTED_AIRPORTS
  destination!: string;  // idem + diferente de origin
  date!: string;          // YYYY-MM-DD, data de calendário real
}
```

Body de entrada esperado (JSON), exemplo válido:

```json
{ "origin": "GRU", "destination": "GIG", "date": "2026-08-15" }
```

```ts
// api/src/search/dto/search-response.dto.ts

import { SupplierId } from '../../suppliers/types';
import { SupplierOutcomeStatus } from '../types';

export interface SearchResponseQuoteDto {
  miles: number;
  taxesBrl: number;
  carrier: string;
}

export interface SearchResponseDto {
  status: 'complete' | 'partial';
  quotes: SearchResponseQuoteDto[];
  suppliers: Record<SupplierId, SupplierOutcomeStatus>;
}
```

Resposta 200 — exemplo (parcial, fornecedor B em timeout):

```json
{
  "status": "partial",
  "quotes": [
    { "miles": 17500, "taxesBrl": 55.79, "carrier": "LATAM" },
    { "miles": 18500, "taxesBrl": 75.51, "carrier": "GOL" }
  ],
  "suppliers": {
    "supplier-a": "ok",
    "supplier-b": "timeout",
    "supplier-c": "ok"
  }
}
```

```ts
// api/src/search/search-response.mapper.ts (assinatura)

/** Função pura, sem import de @nestjs/*. */
export function mapAggregatedResultToResponse(
  result: AggregatedSearchResult,
): SearchResponseDto;
```

Regra de `status`: `'complete'` sse `result.outcomes.every(o => o.status === 'ok')`; caso
contrário `'partial'` (inclui o caso de 0 outcomes `'ok'` — ver "Arquitetura decidida").

```ts
// api/src/search/search.controller.ts (assinatura)

@Controller()
export class SearchController {
  constructor(private readonly searchAggregatorService: SearchAggregatorService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() dto: SearchRequestDto): Promise<SearchResponseDto>;
}
```

**Formato de erro (400 de validação, e envelope genérico para qualquer outra exceção da API):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Requisição inválida.",
    "fields": [
      {
        "field": "origin",
        "code": "AIRPORT_NOT_SUPPORTED",
        "message": "origin deve ser um dos aeroportos suportados: GRU, GIG, BSB, SSA, REC, POA, CNF, FOR"
      }
    ]
  }
}
```

`fields` só aparece em erro de validação (`code: 'VALIDATION_ERROR'`); para qualquer outra
exceção capturada pelo `AllExceptionsFilter` o envelope é `{ error: { code, message } }`, sem
`fields`. Status HTTP:
- `VALIDATION_ERROR` → 400.
- Qualquer outro erro não tratado → 500, `code: 'INTERNAL_ERROR'`, mensagem genérica (nunca
  vaza stack trace/detalhe interno ao cliente).

```ts
// api/src/common/validation/constraint-error-codes.ts

export const CONSTRAINT_ERROR_CODES: Record<string, string> = {
  isIn: 'AIRPORT_NOT_SUPPORTED',
  matches: 'INVALID_DATE_FORMAT',
  isDifferentFrom: 'ORIGIN_EQUALS_DESTINATION',
  isValidCalendarDate: 'INVALID_DATE',
  isNotEmpty: 'FIELD_REQUIRED',
  isString: 'FIELD_REQUIRED',
};
// fallback: constraintKey.toUpperCase() para qualquer chave não mapeada aqui.
```

**Fluxo de `SearchController.search(dto)`:**
1. `ValidationPipe` global já rodou antes deste método ser chamado — se algum campo for inválido,
   a requisição nunca chega aqui (400 já foi respondido pelo pipe/filtro, nenhum fornecedor foi
   chamado).
2. `const result = await this.searchAggregatorService.search({ origin: dto.origin, destination: dto.destination, date: dto.date })`.
3. `return mapAggregatedResultToResponse(result)` — Nest serializa como JSON, status 200
   (`@HttpCode(HttpStatus.OK)`, sobrescrevendo o 201 padrão de POST).

## Sequência de implementação

- [ ] Adicionar `class-validator`, `class-transformer` a `api/package.json` (`dependencies`);
      `supertest`, `@types/supertest` a `devDependencies`; `npm install`.
- [ ] Criar `api/src/search/supported-airports.ts` (`SUPPORTED_AIRPORTS`, `SupportedAirport`).
- [ ] Criar `api/src/common/validation/constraint-error-codes.ts` (`CONSTRAINT_ERROR_CODES` +
      fallback).
- [ ] Criar `api/src/common/validation/validation-exception-factory.ts`
      (`validationExceptionFactory`).
- [ ] Criar `api/src/common/filters/all-exceptions.filter.ts` (`AllExceptionsFilter`).
- [ ] Criar `api/src/search/dto/is-different-from.validator.ts` (`IsDifferentFrom`).
- [ ] Criar `api/src/search/dto/is-valid-calendar-date.validator.ts` (`IsValidCalendarDate`).
- [ ] Criar `api/src/search/dto/search-request.dto.ts` (`SearchRequestDto`).
- [ ] Criar `api/src/search/dto/search-response.dto.ts` (`SearchResponseQuoteDto`,
      `SearchResponseDto`).
- [ ] Criar `api/src/search/search-response.mapper.ts` (`mapAggregatedResultToResponse`).
- [ ] Criar `api/src/search/search.controller.ts` (`SearchController`).
- [ ] Registrar `controllers: [SearchController]` em `api/src/search/search.module.ts`.
- [ ] Registrar `APP_PIPE` (`ValidationPipe` com `exceptionFactory: validationExceptionFactory`) e
      `APP_FILTER` (`AllExceptionsFilter`) em `api/src/app.module.ts`.
- [ ] Escrever `supported-airports.spec.ts`, `search-request.dto.spec.ts`,
      `search-response.mapper.spec.ts`, `search.controller.spec.ts`,
      `validation-exception-factory.spec.ts`, `all-exceptions.filter.spec.ts` (unitários).
- [ ] Escrever `search.e2e-spec.ts` (integração real, ver "Plano de testes") — requer
      `docker compose up -d` de pé (`parametros-tecnicos.md`, item 13).
- [ ] Rodar `npm run lint` e `npm test` em `api/` (com `docker compose up -d` ativo) antes de
      considerar a story pronta.
- [ ] **Não** alterar `DECISIONS.md` nesta story (mesma decisão desde a DSM-2; a pergunta 1 é
      preenchida separadamente pelo desenvolvedor).
- [ ] Commit: `feat(DSM-5): endpoint POST /search com validação de entrada e status agregado`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Body válido, todos os fornecedores OK (AC1) | `status: 'complete'`; `quotes` ordenadas (já vem ordenado da DSM-4); `suppliers` com os 3 `'ok'`. |
| Ao menos um fornecedor falha/timeout mas ao menos um responde (AC2/AC3) | `status: 'partial'`; `quotes` só com o que chegou; `suppliers` reflete cada status individual (`ok`/`timeout`/`failed`) — nenhum fornecedor omitido. |
| Todos os fornecedores falham/timeout (não coberto literalmente pela AC da story) | **Decisão aberta deste agente:** `status: 'partial'` (não um terceiro valor) com `quotes: []` e os 3 `suppliers` não-`ok`. Ver justificativa em "Arquitetura decidida". |
| Campo obrigatório ausente (`origin`/`destination`/`date`) | `class-validator` (`@IsString`/`@IsNotEmpty`) rejeita antes do controller — 400, `fields: [{ field, code: 'FIELD_REQUIRED', ... }]`, nenhum fornecedor chamado. |
| Aeroporto fora de `SUPPORTED_AIRPORTS` | 400, `code: 'AIRPORT_NOT_SUPPORTED'`, mensagem lista os aeroportos válidos. |
| `origin === destination` | 400, `code: 'ORIGIN_EQUALS_DESTINATION'` — mesma regra do mock, aplicada antes de qualquer chamada. |
| `date` fora do formato `YYYY-MM-DD` | 400, `code: 'INVALID_DATE_FORMAT'`. |
| `date` no formato certo mas calendário inválido (ex. `2026-02-30`) | 400, `code: 'INVALID_DATE'` (`IsValidCalendarDate`). |
| Campos extras no body (ex. `foo: 'bar'`) | `ValidationPipe` com `forbidNonWhitelisted: true` rejeita com 400 em vez de ignorar silenciosamente — evita a API aceitar contrato mais permissivo do que o documentado. |
| `origin`/`destination` em minúsculo ou com espaço (`" gru "`) | `@Transform` normaliza (`trim` + `toUpperCase`) antes da validação — aceito, não rejeitado. |
| Tempo de resposta end-to-end (AC5) | Sem timer adicional na camada HTTP; o teto de 6s já é garantido pela DSM-4 dentro de `search()`; overhead do Nest (parse/validação/serialização) é desprezível e não é subtraído do orçamento. Medido de verdade pelo teste de integração (`search.e2e-spec.ts`), não só inferido. |
| Todos os fornecedores falham simultaneamente por bug não previsto (exceção não tratada dentro de `SearchAggregatorService`) | Nunca deveria acontecer (contrato DSM-4: `search()` nunca lança) — mas se acontecer, `AllExceptionsFilter` intercepta e devolve 500 com `code: 'INTERNAL_ERROR'` em vez de vazar stack trace ou derrubar o processo. |
| Body malformado (JSON inválido, `Content-Type` errado) | Tratado pelo parser padrão do Nest/Express antes de chegar ao `ValidationPipe`; cai no `AllExceptionsFilter` (`@Catch()` genérico) e sai no mesmo envelope de erro (`code` derivado do status HTTP, ex. `BAD_REQUEST`), mantendo o formato único de erro da API. |
| Duas instâncias da API em paralelo (RF2) | `SearchController`/`mapAggregatedResultToResponse` são stateless — não afeta esta story. |
| Nome das chaves de `suppliers` na resposta (`supplier-a` vs. `a`) | **Decisão aberta deste agente:** chaves completas (`SupplierId`), não os apelidos curtos do exemplo da user story — ver justificativa em "Arquitetura decidida". |
| Campo `supplier` por cotação individual | **Decisão deste agente:** omitido da resposta (YAGNI, sem consumidor definido em DSM-9) — mudança aditiva se precisar depois. |

## Plano de testes

**Unitários (`*.spec.ts`, colocados junto do arquivo testado)** — sem chamada de rede real, exceto
`search.e2e-spec.ts` (ver abaixo).

**`supported-airports.spec.ts`**
- `SUPPORTED_AIRPORTS` tem exatamente 8 elementos, todos os códigos do README, sem duplicata.

**`search-request.dto.spec.ts`** (usa `plainToInstance` + `validate()` do `class-validator`
diretamente sobre `SearchRequestDto`, sem subir o Nest)
- Body totalmente válido → `validate()` devolve `[]`.
- `origin`/`destination` ausentes → erro com `constraints.isNotEmpty`.
- `origin` fora de `SUPPORTED_AIRPORTS` (ex. `'XXX'`) → erro com `constraints.isIn`.
- `origin === destination` → erro com `constraints.isDifferentFrom` no campo `destination`.
- `origin`/`destination` em minúsculo (`'gru'`) → válido após `@Transform` (normalizado para
  `'GRU'`).
- `date` fora do formato (`'15-08-2026'`, `'2026/08/15'`) → erro `constraints.matches`.
- `date` no formato certo mas inexistente no calendário (`'2026-02-30'`) → erro
  `constraints.isValidCalendarDate`.
- `date` válida (`'2026-08-15'`) → sem erro.
- Campo extra não declarado no DTO não é coberto aqui (é responsabilidade do `ValidationPipe`
  global — coberto no teste de integração, `forbidNonWhitelisted`).

**`search-response.mapper.spec.ts`**
- 3 outcomes `'ok'` → `status: 'complete'`.
- 1 outcome não-`'ok'` (`'timeout'` ou `'failed'`), outros `'ok'` → `status: 'partial'`.
- 3 outcomes não-`'ok'` → `status: 'partial'`, `quotes: []`.
- `quotes` mapeadas só com `{ miles, taxesBrl, carrier }` (sem `supplier`).
- `suppliers` é um objeto com as 3 chaves `SupplierId`, cada uma com o `status` do outcome
  correspondente.

**`search.controller.spec.ts`** (mock de `SearchAggregatorService` via DI, `Test.createTestingModule`)
- Chama `searchAggregatorService.search` com `{ origin, destination, date }` extraídos do DTO
  (não o DTO inteiro, para não vazar campos de transporte para o domínio).
- Resposta do controller é exatamente `mapAggregatedResultToResponse(resultMockado)`.
- Retorna com status 200 (via metadata do `@HttpCode`, verificável com `Reflector` ou teste de
  integração — se `Reflector` for verboso demais, mover esta asserção específica só para o teste
  de integração).

**`validation-exception-factory.spec.ts`**
- Dado um array de `ValidationError` simulando `origin` inválido, devolve `BadRequestException`
  cujo `getResponse()` é `{ code: 'VALIDATION_ERROR', message: expect.any(String), fields: [{ field: 'origin', code: 'AIRPORT_NOT_SUPPORTED', message: expect.any(String) }] }`.
- Constraint sem entrada em `CONSTRAINT_ERROR_CODES` → `code` cai no fallback
  (`constraintKey.toUpperCase()`).
- Múltiplos campos inválidos ao mesmo tempo → `fields` com uma entrada por campo.

**`all-exceptions.filter.spec.ts`** (mock de `ArgumentsHost`/`Response`)
- `BadRequestException` estruturada (a que `validationExceptionFactory` produz) → envelope
  repassa `code`/`fields`/`message` como estão, status 400.
- `HttpException` genérica sem `code` (ex. `NotFoundException` padrão do Nest) → envelope
  genérico `{ error: { code: 'NOT_FOUND', message } }`, status da exceção original.
- Erro não-`HttpException` (`new Error('boom')`) → envelope `{ error: { code: 'INTERNAL_ERROR', message: <mensagem genérica, não a mensagem interna do erro> } }`, status 500.

**`search.e2e-spec.ts`** (integração real — `Test.createTestingModule({ imports: [AppModule] }).compile()` + `app.init()` + `supertest`, `mock-suppliers` real via `docker compose up -d`, `parametros-tecnicos.md` item 13)
- `beforeAll`/`beforeEach`: `POST http://localhost:4000/admin/reset` (estado limpo, sem overrides
  de execuções anteriores).
- **Caminho feliz:** `POST /search` com body válido → 200, `status` em `'complete' | 'partial'`,
  `quotes` não vazio (rota/data determinística do catálogo do mock garante resultado), `suppliers`
  com as 3 chaves.
- **AC5, medição real:** antes do teste, `POST http://localhost:4000/admin/force-slow/supplier-b`
  (8s, acima do teto). Mede `Date.now()` antes/depois de `POST /search` via `supertest` → tempo
  medido **≤ 6000ms** (com margem pequena e documentada, ex. `≤ 6200ms`, para absorver overhead de
  execução da suíte, não do endpoint) e `suppliers['supplier-b'] === 'timeout'`. `afterEach`:
  `POST /admin/reset` (não deixa efeito colateral, mesma exigência já usada como padrão em
  DSM-13).
- **400 sem chamar fornecedor:** `POST /admin/stats`, guarda `totalCalls`; `POST /search` com body
  inválido (ex. `origin` ausente) → 400, envelope `{ error: { code: 'VALIDATION_ERROR', fields: [...] } }`;
  `GET /admin/stats` de novo → `totalCalls` **inalterado**, prova objetivamente que nenhum
  fornecedor foi chamado (cumpre a AC literalmente, não só por inspeção de código).
- `afterAll`: `POST /admin/reset` + `app.close()`.

Fora do escopo de teste desta story (fica para o bônus DSM-13): cenários combinados de múltiplos
fornecedores falhando ao mesmo tempo, e variações mais profundas de `/admin/force-dirty` já
cobertas indiretamente pelos testes de normalização (DSM-1/2/3) — esta story cobre o mínimo exigido
pelas próprias ACs da DSM-5 (parcial simples, timeout simples, validação, tempo end-to-end).
