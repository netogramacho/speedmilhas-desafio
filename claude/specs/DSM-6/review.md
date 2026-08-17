# Review — DSM-6 (Modelagem de dados para pedidos e idempotência — Prisma)

Commit revisado: `5f2a3a0` — "feat(DSM-6): schema Prisma de pedidos com idempotencyKey único no banco".

## Veredito geral

**Aprovado.** A implementação segue o spec (`claude/specs/DSM-6/spec.md`, Revisão 2) quase
literalmente — schema, migration, `PrismaService`/`PrismaModule`, `validate-env.ts` e
`app.module.ts` batem campo a campo com os "Contratos de dados" e a "Sequência de implementação"
do spec. Rodei a suíte completa e os testes específicos da story contra o Postgres real do
`docker-compose` (não confiei só no relato) e tudo passou. Não encontrei nenhum achado
bloqueante. Um achado cosmético/observação está listado abaixo, sem impacto nos critérios de
aceite desta story.

## Critérios de aceite (user-story.md)

| # | Critério | Status |
|---|---|---|
| 1 | `idempotencyKey` com `@unique` no nível do banco (não só validação em código) | **Atendido** — `Order.idempotencyKey String @unique` no schema; migration gera `CREATE UNIQUE INDEX "Order_idempotencyKey_key"`; provado por teste de integração real (`order-schema.e2e-spec.ts`, casos "AC1" e "concorrência real") rodando contra Postgres, com `code: 'P2002'` na segunda inserção — não é uma checagem de aplicação. |
| 2 | Model guarda `quoteId`, dados do passageiro e resultado da reserva (`id`, `status`) | **Atendido** — `Order.quoteId`, `Order.id`, `Order.status`; dados do passageiro em `Passenger.name`/`Passenger.document`, relacionado 1:1 via `Order.passengerId`. Coberto pelo teste "AC2". |
| 3 | Estado explícito `PENDING`/`CONFIRMED` diferenciando corrida vs. conclusão | **Atendido** — `enum OrderStatus { PENDING CONFIRMED }`, default `PENDING` na criação; teste "AC3" confirma default e transição para `CONFIRMED`. |
| 4 | `npm run prisma:generate` conclui sem erro e client expõe o novo model | **Atendido** — rodei `npm run prisma:generate`: `✔ Generated Prisma Client (7.9.1)` sem erro; `prisma.order`/`prisma.passenger` usados e tipados em todos os testes de `order-schema.e2e-spec.ts`, que compilam e passam. |

## Achados

### Cosmético — `Passenger.document` sem constraint de unicidade

`api/prisma/schema.prisma:198-203` (`model Passenger`).

Como `Passenger` é criado 1:1 por `Order` (sem reuso entre pedidos), a mesma pessoa física (mesmo
CPF) pode acabar com várias linhas `Passenger` distintas caso faça mais de uma reserva — não há
`@unique` em `document`. Isso é consistente com a decisão de escopo do spec (nome + documento como
"dados mínimos", sem exigência de deduplicação de passageiro entre pedidos) e não é exigido por
nenhuma AC da DSM-6/RF2, então não bloqueia a story. Registro apenas como observação para quem for
avaliar reuso de passageiro em stories futuras — não é uma correção a fazer agora.

## Aderência ao spec — pontos conferidos linha a linha

- `id` gerado por `gen_random_uuid()` do Postgres (`@default(dbgenerated("gen_random_uuid()"))
  @db.Uuid`) em ambos os models, tipo `UUID` na migration — reverte corretamente a decisão original
  conforme Revisão 2.
- Direção do FK invertida corretamente: `Order.passengerId @unique @db.Uuid` +
  `@relation(..., onDelete: Restrict)`; migration gera `Order_passengerId_fkey ... ON DELETE
  RESTRICT ON UPDATE CASCADE` — bate com "Contratos de dados" e é provado pelos testes de 1:1 e de
  `onDelete: Restrict`.
- `PrismaService`/`PrismaModule` em `api/src/infrastructure/prisma/`, com a assinatura exata do
  spec (`extends PrismaClient implements OnModuleInit, OnModuleDestroy`, adapter `PrismaPg` lendo
  `DATABASE_URL` via `ConfigService`, `$connect`/`$disconnect` no ciclo de vida). `PrismaModule` é
  `@Global()`, registrado uma única vez em `AppModule`.
- `validate-env.ts` ganhou `DATABASE_URL` no mesmo padrão de `SUPPLIERS_BASE_URL` (string
  obrigatória, não vazia, erro claro no boot) — sem alterar o comportamento de validação dos
  outros campos.
- `DECISIONS.md` não foi tocado, conforme exigido pelo spec.
- Nenhum arquivo de `domain/orders/` foi criado — correto, o spec explicitamente não pede.
- `api/prisma/schema.prisma` `generator`/`datasource` mantidos intactos.

### Observação sobre um desvio do "Plano de testes" — sinalizado e justificado pelo próprio dev

O "Plano de testes" do spec previa que a violação de `onDelete: Restrict` retornasse o erro Prisma
`P2003` ("clássico"). O teste implementado (`order-schema.e2e-spec.ts:163-168`) espera `P2039` e
traz um comentário explicando a causa (Prisma 7 + driver adapter `pg` com `relationMode
"foreignKeys"` mapeia a violação SQLSTATE 23001 do próprio Postgres para `P2039`, não `P2003`).
Confirmei rodando o teste real contra o Postgres do `docker-compose`: passa, e de fato é `P2039`
que vem do banco nessa combinação de versões. Isso não é um desvio silencioso — está documentado
no próprio teste — e o comportamento provado (a exclusão é rejeitada e o `Passenger` continua
existindo) é o que a AC exige; o código do erro específico é detalhe de implementação do driver,
não da regra de negócio. Não é um achado, é uma nota de rastreabilidade entre spec e código.

## Testes

Todos rodados localmente com `docker compose up -d` ativo (Postgres real, sem mock):

- `cd api && npx prisma migrate status` → `Database schema is up to date!` (1 migration aplicada).
- `cd api && npm run prisma:generate` → `✔ Generated Prisma Client (7.9.1)` sem erro (AC4).
- `cd api && npx tsc --noEmit -p tsconfig.json` → sem erros de compilação.
- `cd api && npm run lint` → `0 errors, 4 warnings` — os 4 warnings são pré-existentes em
  `src/presentation/search/search.e2e-spec.ts` (`@typescript-eslint/no-unsafe-argument`), não
  relacionados a este commit.
- `cd api && npm test` → **19 suítes / 118 testes, todos passaram** (inclui as 8 novas do
  `order-schema.e2e-spec.ts` e as 3 do `prisma.service.spec.ts`).
- `cd api && npx jest order-schema --verbose` (isolado) → 8/8 passaram, confirmando individualmente
  AC1 (constraint de unicidade + concorrência real via `Promise.allSettled`), AC2 (dados
  persistidos), AC3 (default `PENDING` → `CONFIRMED`), AC4 (client tipado), 1:1 via
  `passengerId @unique`, `onDelete: Restrict`, ordem de limpeza, e `id` como UUID gerado pelo
  banco.

Nenhum gap de cobertura encontrado em relação às ACs da DSM-6: cada critério tem pelo menos um
teste de integração real (sem mock) provando o comportamento no nível do banco, não só por nome de
função ou tipo TypeScript.

## Conclusão

Nenhum achado bloqueante. Um achado cosmético (ausência de unicidade em `Passenger.document`),
fora do escopo das ACs desta story e não introduzido como regressão — apenas uma observação para
avaliação futura.
