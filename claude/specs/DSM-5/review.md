# Review — DSM-5 — Endpoint `POST /search`

**Commit revisado:** `99e350d` ("feat(DSM-5): endpoint POST /search e reorganiza api/src em camadas")

## Veredito geral

**Aprovado com ressalvas.** A implementação cobre corretamente a arquitetura decidida na spec
(controller único, `ValidationPipe` global via `APP_PIPE`, `AllExceptionsFilter` via `APP_FILTER`,
mapper puro, catálogo estático de aeroportos, status `complete`/`partial`, chaves completas de
`SupplierId` em `suppliers`), lint e os 93 testes (17 suítes, incluindo o e2e contra o
`mock-suppliers` real) passam. A reorganização retroativa de `api/src` por camadas
(`domain/infrastructure/presentation/common`) foi executada corretamente: nenhum arquivo órfão nas
pastas antigas, nenhuma referência residual a `src/search/`/`src/suppliers/`, e os diffs dos
arquivos movidos (`search-aggregator.service.ts`, os três `*.client.ts`, `search.module.ts`) mudam
apenas caminhos de import — comportamento idêntico, confirmado por teste.

Encontrei, porém, um bug funcional real e reproduzível no mapeamento de erro de validação (achado
1 abaixo): para qualquer campo ausente/vazio/tipo errado, o `code` retornado ao cliente quase nunca
é `FIELD_REQUIRED` (o que a própria spec documenta e o `CONSTRAINT_ERROR_CODES` foi desenhado para
produzir) — em vez disso, sai um código semanticamente errado (`AIRPORT_NOT_SUPPORTED`,
`ORIGIN_EQUALS_DESTINATION` ou `INVALID_DATE`, dependendo do campo). Isso não quebra a letra da AC4
(a resposta ainda é 400, o campo (`field`) apontado ainda está correto, e a mensagem ainda é
compreensível), mas viola o contrato de `code` estável documentado na spec e no item 15 de
`parametros-tecnicos.md`, e é exatamente o tipo de coisa que a DSM-9 (frontend) usaria para decidir
que mensagem mostrar. Rebaixei para "aprovado com ressalvas" em vez de reprovado porque nenhuma das
5 ACs literais da user story é tecnicamente quebrada por isso — mas é um bug real que deveria ser
corrigido antes de considerar a story fechada, não só um "nice to have".

## Critérios de aceite

| # | Critério | Status |
|---|---|---|
| AC1 | Body válido → 200, cotações agregadas + status por fornecedor (`suppliers`) | **Atendido** — confirmado por `search-response.mapper.spec.ts`, `search.controller.spec.ts` e e2e (`caminho feliz`) e por chamada manual real (`curl`, ver achados). |
| AC2 | Todos os fornecedores OK → `status: 'complete'` | **Atendido** — `search-response.mapper.spec.ts` ("3 outcomes ok"), confirmado também via `curl` manual (`status:"complete"` com os 3 `ok`). |
| AC3 | Ao menos um falhou/timeout, ao menos um OK → `status: 'partial'`, cotações que chegaram | **Atendido** — coberto em `search-response.mapper.spec.ts` ("1 outcome não-ok") e no e2e (`AC5`, que força `supplier-b` lento e checa `suppliers['supplier-b'] === 'timeout'`, ainda com `status` sendo `'complete'|'partial'` e `quotes` presentes). Não há um teste e2e dedicado só a "status partial explícito com quotes não vazias" (o teste de e2e de "caminho feliz" aceita `'complete'|'partial'` genericamente) — cobertura de unidade supre isso, é uma lacuna pequena de integração, não de unidade. |
| AC4 | Body inválido → 400, mensagem indicando campo inválido, nenhum fornecedor chamado | **Parcial** — o "nenhum fornecedor chamado" está muito bem coberto (e2e mede `totalCalls` do mock antes/depois). O "mensagem indicando qual campo é inválido" funciona no sentido de apontar o `field` correto, mas o `code`/mensagem específica frequentemente descreve a constraint errada quando o campo está ausente/vazio/com tipo errado — ver achado 1. |
| AC5 | Tempo de resposta end-to-end nunca ultrapassa 6s | **Atendido** — testado de verdade via `search.e2e-spec.ts` (`force-slow` de 8s no `supplier-b`, medição real de `Date.now()` antes/depois do `POST /search` via `supertest`, `<= 6200ms` com margem documentada para overhead de suíte). |

## Achados

### 1. [Alto] `code` de erro de validação errado para campo ausente/vazio/tipo incorreto — quebra o contrato documentado de código estável

**Arquivo:** `api/src/common/validation/validation-exception-factory.ts:40-43` (função `flattenErrors`,
`const [constraintKey, message] = Object.entries(error.constraints)[0]`), combinado com a ordem de
decorators em `api/src/presentation/search/dto/search-request.dto.ts:19-37`.

**Cenário concreto (reproduzido via `curl` real e via `class-validator` `validate()` isolado):**

```
POST /search  { "destination": "GIG", "date": "2026-08-15" }   // origin ausente
```

Resposta real:
```json
{"error":{"code":"VALIDATION_ERROR","message":"Requisição inválida.","fields":[
  {"field":"origin","code":"AIRPORT_NOT_SUPPORTED",
   "message":"origin must be one of the following values: GRU, GIG, BSB, SSA, REC, POA, CNF, FOR"}
]}}
```

O código correto documentado na spec (tabela "Casos de borda e riscos tratados": "Campo
obrigatório ausente ... `code: 'FIELD_REQUIRED'`") seria `FIELD_REQUIRED`, não
`AIRPORT_NOT_SUPPORTED`. A mensagem também é enganosa — sugere que o aeroporto foi digitado errado
quando, na verdade, o campo nem foi enviado.

**Causa raiz:** quando `origin` é `undefined`, todos os validadores do campo disparam ao mesmo
tempo (`@IsString`, `@IsNotEmpty`, `@IsIn`), então `error.constraints` do `class-validator` acaba
com 3 chaves simultâneas. Depurei a ordem real do objeto (`class-validator` `validate()` puro, sem
Nest):
```
origin: {"isIn": "...", "isNotEmpty": "...", "isString": "..."}
destination: {"isDifferentFrom": "...", "isIn": "...", "isNotEmpty": "...", "isString": "..."}
date: {"isValidCalendarDate": "...", "matches": "...", "isNotEmpty": "...", "isString": "..."}
```
A ordem das chaves é a ordem de execução dos decorators do `class-validator`, que é o **inverso**
da ordem declarada no DTO (decorators aplicam de baixo para cima) — ou seja, o decorator mais
"específico"/custom (`@IsIn`, `@Validate(IsDifferentFrom)`, `@Validate(IsValidCalendarDate)`, o
último na leitura de cima para baixo do código) sempre vence a corrida e aparece primeiro no objeto
de constraints. `flattenErrors` pega `Object.entries(error.constraints)[0]` — ou seja, sempre pega
o decorator mais específico, nunca o mais genérico (`isNotEmpty`/`isString`), mesmo quando o valor
está simplesmente ausente. O mesmo problema se repete para `destination` ausente
(`ORIGIN_EQUALS_DESTINATION`, porque `IsDifferentFrom` também dispara com `undefined !==
undefined`... na real seria `undefined !== "GRU"` se origin estiver presente, então `true !==` só
falha quando os dois são `undefined`; testei com `destination` ausente e `origin` presente e o
resultado também não é `FIELD_REQUIRED`) e `date` ausente (`INVALID_DATE`, pois
`IsValidCalendarDate.validate` retorna `false` para `typeof value !== 'string'`, disparando antes
de `isNotEmpty` aparecer primeiro no objeto).

**Por que os testes não pegaram isso:** `validation-exception-factory.spec.ts:6-14` constrói
`ValidationError` manualmente com **um único** par `{ constraintKey: message }` por campo — nunca
exercita o caso real de múltiplas constraints simultâneas no mesmo campo, que é exatamente o
cenário de "campo ausente" na prática. `search-request.dto.spec.ts:29-41` só confere
`constraints.isNotEmpty` **existe** no objeto (`toHaveProperty`), não que ele é o escolhido pelo
`flattenErrors`. O e2e (`search.e2e-spec.ts:92-116`, teste "400 sem chamar fornecedor") só confere
`fields.some(f => f.field === 'origin')`, nunca o `code` do campo.

**Sugestão objetiva:** não depender da ordem de inserção do objeto `constraints`. Definir uma lista
de prioridade explícita de constraint keys (ex.: `isNotEmpty`/`isString` sempre vencem antes de
`isIn`/`isDifferentFrom`/`isValidCalendarDate`/`matches`, já que "campo ausente" é logicamente
anterior a "campo com valor inválido") e escolher a chave de maior prioridade presente em
`error.constraints`, em vez de `Object.entries(...)[0]`. Alternativa mais simples: reordenar os
decorators no DTO não resolve de forma confiável (a ordem de execução dos decorators de
`class-validator` não é um contrato estável para depender). Adicionar um teste que roda
`SearchRequestDto` real (via `plainToInstance` + `validate()`, como já faz
`search-request.dto.spec.ts`) através de `validationExceptionFactory` de ponta a ponta, para campo
ausente, tipo errado e valor inválido, junto com um teste e2e que valida o `code` (não só o
`field`) do cenário de campo ausente.

### 2. [Cosmético] Nenhum teste automatizado para `forbidNonWhitelisted` (campos extras no body)

**Arquivo:** `api/src/presentation/search/search.e2e-spec.ts` (nenhum teste cobre este caso);
comportamento real confirmado manualmente via `curl` (`POST /search` com `foo: "bar"` extra →
`400`, `code: "WHITELISTVALIDATION"`, `message: "property foo should not exist"`).

A spec lista esse caso na tabela "Casos de borda e riscos tratados" e no plano de teste de
`search-request.dto.spec.ts` diz explicitamente que ele "é coberto no teste de integração,
`forbidNonWhitelisted`" — mas `search.e2e-spec.ts` não tem nenhum teste para isso. O comportamento
em si está correto (confirmado manualmente), mas não há uma rede de segurança automatizada: se
algum dia `forbidNonWhitelisted: true` for removido/alterado em `app.module.ts` por engano, nenhum
teste do projeto detectaria a regressão.

**Sugestão objetiva:** adicionar um teste e2e (`POST /search` com um campo extra não declarado no
DTO → 400, `code: 'VALIDATION_ERROR'`) em `search.e2e-spec.ts`, coerente com o que a própria spec
já previa.

### 3. [Cosmético] `SearchResponseDto['suppliers']` tipado como `Record<SupplierId, ...>` mas construído incrementalmente sem garantia estática das 3 chaves

**Arquivo:** `api/src/presentation/search/search-response.mapper.ts:20-28`.

O `reduce` que monta `suppliers` a partir de `result.outcomes` confia implicitamente que
`AggregatedSearchResult.outcomes` sempre tem exatamente os 3 `SupplierOutcome` (um por
`SupplierId`) — o que é garantido pelo contrato da DSM-4, mas não há nenhuma checagem/teste que
falhe explicitamente se um outcome estiver faltando (o objeto resultante teria só 1 ou 2 chaves,
tecnicamente incompatível em runtime com o tipo `Record<SupplierId, ...>` declarado, embora o
TypeScript não detecte isso porque o cast `as Record<...>` no acumulador inicial silencia o
compilador). Não é um bug hoje (a DSM-4 sempre entrega os 3), é um risco baixo de acoplamento
implícito não validado — se a DSM-4 algum dia mudar para permitir outcomes parciais, este mapper
não avisaria.

**Sugestão objetiva:** não bloqueante; se quiser blindar, um teste explícito garantindo que a saída
sempre tem as 3 chaves mesmo que `result.outcomes` venha com menos de 3 itens (hoje o comportamento
seria silenciosamente devolver um objeto incompleto).

## Testes

- `cd api && npm run lint` → **passou** (0 erros, 3 warnings em `search.e2e-spec.ts` — uso de
  `app.getHttpServer()` tipado como `any` pelo supertest, `@typescript-eslint/no-unsafe-argument`;
  não bloqueante, é limitação de tipos do supertest, não do código da story).
- `cd api && npm test` (com `docker compose up -d` ativo, Postgres + `mock-suppliers` saudáveis) →
  **passou**: 17 suítes, 93 testes, 0 falhas (inclui o log de `ERROR [AllExceptionsFilter]` que
  aparece no output — é o próprio teste de `all-exceptions.filter.spec.ts` exercitando
  deliberadamente um erro não tratado, não uma falha real).
- Verificação manual adicional (fora da suíte, via API rodando localmente e via `class-validator`
  isolado) confirmou o achado 1 (`code` errado para campo ausente) e o comportamento correto (não
  testado automaticamente) do achado 2 (`forbidNonWhitelisted`).
- Gaps de cobertura: ver achados 1 (teste de `code` real via DTO + factory combinados, e teste e2e
  checando `code`, não só `field`) e 2 (teste e2e de campo extra no body).

## Veredito

**Aprovado com ressalvas.** 0 achados bloqueantes (nenhuma AC é tecnicamente quebrada), 1 achado de
severidade alta (bug real de `code` de validação incorreto para campos ausentes/inválidos, achado
1) que deveria ser corrigido antes de fechar a story, e 2 achados cosméticos (gaps de cobertura de
teste e um risco de acoplamento implícito de baixo risco).
