# DSM-6 — Modelagem de dados para pedidos e idempotência (Prisma)

## Contexto

User story: `claude/specs/DSM-6/user-story.md`.

O RF2 do desafio (`README.md`, "RF2 — Reserva idempotente") exige que duas requisições
simultâneas de `POST /orders` com a mesma `idempotencyKey` — inclusive contra duas instâncias
diferentes da API sem estado compartilhado em memória — gerem uma única reserva. Essa garantia só
pode vir do banco. Hoje `api/prisma/schema.prisma` não tem nenhum model (é literalmente o ponto de
partida do desafio: "modelar o banco é parte do desafio"), e não existe nenhuma integração do
Prisma com o NestJS no projeto (nenhum `PrismaService`/`PrismaModule`, `DATABASE_URL` não é
validada em `validate-env.ts`).

Esta story entrega exatamente essa base: o schema Prisma com a constraint de unicidade no banco
(não em código), o enum de estado do pedido, e a infraestrutura mínima para o client gerado ser
injetável via DI do Nest — pré-requisito direto para a DSM-7 (endpoint `POST /orders`) e a DSM-8
(teste de concorrência real).

**Fora de escopo (mantido conforme a story):** o controller/DTO e a lógica de negócio do endpoint
`POST /orders` (DSM-7); o teste automatizado de concorrência real disparando requisições HTTP
(DSM-8); validar se `quoteId` referencia uma cotação real de uma busca anterior (a DSM-5 não
persiste cotações — gap já registrado na story da DSM-7, não desta).

**Nota sobre este processo:** as 8 decisões de arquitetura desta story que tinham mais de uma
abordagem razoável foram levadas ao desenvolvedor nesta conversa (estados do enum, estrutura dos
dados do passageiro, campos mínimos do passageiro, snapshot de preço vs. só `quoteId`, local do
`PrismaService`/`PrismaModule`, convenção de nomes no Postgres, geração do `id`, e o hardening de
fingerprint de payload). As decisões abaixo refletem exatamente as respostas dele.

**Revisão 1:** depois da primeira versão deste spec, o desenvolvedor revisou a decisão sobre os
dados do passageiro (item 2) — trocou campos escalares no `Order` por um model `Passenger`
separado, para deixar o schema mais claro para quem avaliar o desafio.

**Revisão 2 (esta versão):** com a DSM-6 já implementada sobre a Revisão 1 (schema aplicado,
migration `20260817164038_init_order` gerada, `PrismaService`/`PrismaModule` criados, testes
passando — tudo ainda não commitado), o desenvolvedor pediu mais duas mudanças depois de revisar a
implementação:
1. **Geração do `id` volta a ser pelo banco** (`gen_random_uuid()`), não mais pelo Prisma Client —
   reverte a decisão 7 original. `gen_random_uuid()` é nativo do PostgreSQL desde a versão 13 (não
   depende de habilitar a extensão `pgcrypto` manualmente); `postgres:18-alpine`
   (`docker-compose.yml`) já tem a função disponível sem nenhum passo extra — o receio original
   que motivou "gerar pelo client" não se sustenta.
2. **A direção da FK entre `Order` e `Passenger` é invertida:** agora é `Order.passengerId` (não
   mais `Passenger.orderId`) — `Order` referencia `Passenger`, não o inverso. Como a migration
   anterior nunca foi commitada, ela é descartada e regerada do zero a partir do schema corrigido,
   sem necessidade de preservar histórico.
As demais decisões (2 estados no enum, `quoteId` opaco sem snapshot, `PrismaService` já nesta
story, nomes default do Prisma sem `@@map`, sem fingerprint de payload) continuam como estavam.

## Arquitetura decidida

- **Enum de status com 2 estados, `PENDING`/`CONFIRMED`** — estritamente o que a AC da DSM-6 pede,
  sem um terceiro estado `FAILED`. `PENDING` diferencia "reserva já em andamento por outra
  requisição concorrente" (linha já inserida no banco); `CONFIRMED` é "reserva concluída".
- **Dados do passageiro em um model `Passenger` separado, relação 1:1 com `Order`**, com nome
  completo + documento (CPF) como campos mínimos. Nome sozinho não identifica unicamente o
  passageiro; email/telefone não são pedidos por nenhum requisito do desafio.
  - **Direção da FK — `Order.passengerId`, não `Passenger.orderId`.** *(Revisão 2 — inverte a
    direção da Revisão 1, decisão técnica deste agente, baixo impacto, não levada de volta ao
    desenvolvedor por pedido explícito dele.)* `Order.passengerId String @unique` +
    `@relation(fields: [passengerId], references: [id], onDelete: Restrict)`: o FK sai de `Order`
    e aponta para `Passenger`.
    - **Efeito colateral positivo desta direção:** como `Order.passengerId` é uma coluna
      obrigatória (não anulável) do `Order`, o próprio banco agora impede a existência de um
      `Order` sem `Passenger` associado — todo `Order` precisa referenciar um `Passenger` válido
      já no `INSERT`. Isso elimina o risco que a Revisão 1 documentava ("`Order` criado sem
      `Passenger` correspondente" só era evitável por disciplina de aplicação, não pelo schema).
    - **`onDelete: Restrict`** (explícito, não o default implícito): tentar apagar um `Passenger`
      enquanto algum `Order` ainda referencia seu `id` falha por violação de FK — não existe,
      nesta direção, uma forma de a exclusão de um `Order` arrastar automaticamente a exclusão do
      `Passenger` associado (cascade só se propaga no sentido "linha referenciada → linha que
      referencia", nunca o inverso); o preço dessa direção é que apagar um `Order` deixa o
      `Passenger` correspondente órfão no banco (ver "Casos de borda e riscos tratados") — aceito
      porque este desafio não tem nenhum fluxo de exclusão de pedido (fora de escopo do RF2).
    - **Escrita aninhada do Prisma continua funcionando e continua sendo a forma recomendada de
      criar os dois registros juntos:** `prisma.order.create({ data: { ..., passenger: { create:
      { name, document } } } })` não muda de sintaxe nessa direção — o Prisma resolve a ordem real
      das duas instruções `INSERT` (cria `Passenger` primeiro, obtém o `id`, depois cria `Order`
      com `passengerId` preenchido) dentro de uma única transação implícita, então **não é
      necessário** o código de aplicação (DSM-7) criar o `Passenger` manualmente antes do `Order`
      — o call site fica idêntico ao da Revisão 1, só o schema/migration por trás muda.
- **`id` gerado pelo Postgres (`gen_random_uuid()`), não pelo Prisma Client.** *(Revisão 2, reverte
  a decisão 7 original.)* Campo `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
  em ambos os models — coluna de tipo nativo `uuid`, não `text`/`varchar`. Não depende de nenhuma
  extensão (`gen_random_uuid()` é função built-in do PostgreSQL desde a versão 13; `postgres:18-alpine`
  do `docker-compose.yml` já a tem disponível sem `CREATE EXTENSION`).
- **`quoteId` como string opaca, sem relação/FK e sem snapshot de preço.** O `Order` não guarda
  `miles`/`taxesBrl`/`carrier`. Decisão explícita do desenvolvedor para ficar estritamente dentro
  do escopo da AC da DSM-6 ("guarda ... `quoteId`, dados do passageiro, e o resultado da reserva —
  ex.: id gerado, status" — o "resultado da reserva" já é coberto por `id` + `status`, sem exigir
  snapshot de preço). Consistente com a DSM-7 já declarar fora de escopo validar `quoteId` contra
  uma cotação real.
- **`PrismaService`/`PrismaModule` construídos já nesta story**, em `infrastructure/prisma/` —
  infraestrutura genérica (mesmo papel que `SuppliersHttpModule` tem para HTTP,
  `api/src/infrastructure/suppliers/suppliers-http.module.ts`), não específica de `orders`. Sem
  isso o client gerado (AC4 da story) fica exposto mas inutilizável via DI em qualquer lugar;
  `validate-env.ts:18` já reserva a validação de `DATABASE_URL` para "quando o Prisma for tocado
  (DSM-6+)". Não conflita com o "fora de escopo" da story, que exclui controller/DTO/lógica de
  negócio do endpoint `POST /orders`, não infraestrutura de conexão genérica. `PrismaModule` é
  `@Global()` — evita reimportar em cada módulo de feature que precisar do `PrismaService` (mesmo
  padrão comum em projetos Nest+Prisma; decisão técnica de baixo impacto deste agente, não levada
  ao desenvolvedor).
- **Nomes de tabela/coluna no Postgres seguem o default do Prisma**, sem `@@map`/`@map` — tabelas
  `Order`/`Passenger`, colunas em camelCase (`idempotencyKey`, `passengerId`, `createdAt` etc.).
- **Sem fingerprint/hash do payload da requisição.** Reenviar a mesma `idempotencyKey` com um
  `quoteId`/passageiro diferente do que foi usado na primeira chamada não é detectado nem
  rejeitado pelo schema — a segunda chamada recebe de volta silenciosamente a resposta da
  primeira. É hardening real de um design de idempotência, mas escopo adicional não pedido pela
  RF2/AC da DSM-6; documentado como risco conhecido, não implementado (ver "Casos de borda e
  riscos tratados").

Decisões já fixadas em `parametros-tecnicos.md`, reaproveitadas sem mudança:

- **Mecanismo de idempotência — constraint única no banco + catch de conflito, não advisory
  lock** (item 4). A coluna `idempotencyKey` (em `Order`) tem `@unique` no Prisma; uma segunda
  inserção concorrente com a mesma chave falha na constraint (erro Prisma `P2002`), não em uma
  checagem prévia de código (que teria uma janela de corrida entre o "checar" e o "inserir"). A
  lógica de capturar esse erro e devolver a resposta da primeira reserva é da DSM-7; esta story só
  garante que a constraint existe no nível do banco.
- **Estrutura de módulos em camadas** (item 10): `PrismaService`/`PrismaModule` (infraestrutura,
  wiring de DI) ficam em `infrastructure/prisma/`; nenhum arquivo de domínio puro é necessário
  nesta story (não há regra de negócio pura a extrair — só schema + wiring de infraestrutura).
- **`@nestjs/config` / `ConfigService`** (item 6): `DATABASE_URL` passa a ser validada em
  `validate-env.ts`, no mesmo padrão de `SUPPLIERS_BASE_URL`.

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/prisma/schema.prisma` (editado, ver "Contratos de dados") | Adiciona `enum OrderStatus`, `model Order` (com `passengerId @unique`, FK para `Passenger`) e `model Passenger` — mantém `generator`/`datasource` existentes intactos. |
| `api/prisma/migrations/<novo-timestamp>_init_order/migration.sql` | Gerado do zero por `prisma migrate dev` (a migration anterior, `20260817164038_init_order`, é descartada — nunca foi commitada, não precisa preservar histórico). Cria as tabelas `Order` e `Passenger`, o tipo `OrderStatus`, `id` como `uuid` com default `gen_random_uuid()` nos dois models, o índice único de `Order.idempotencyKey`, o índice único de `Order.passengerId`, e o FK `Order.passengerId → Passenger.id` com `ON DELETE RESTRICT`. |
| `api/src/infrastructure/prisma/prisma.service.ts` | `PrismaService` (`@Injectable`), `extends PrismaClient implements OnModuleInit, OnModuleDestroy`. Constrói o client com o driver adapter `PrismaPg` (`@prisma/adapter-pg`, padrão do Prisma 7 — `api/src/generated/prisma/client.ts:29-30`), lendo `DATABASE_URL` via `ConfigService`. `onModuleInit` chama `this.$connect()`; `onModuleDestroy` chama `this.$disconnect()` (não deixa a conexão aberta ao encerrar a aplicação, relevante para os testes de integração da DSM-8 que sobem/derrubam a app repetidamente). |
| `api/src/infrastructure/prisma/prisma.module.ts` | `PrismaModule` (`@Global()`): importa `ConfigModule`, provê e exporta `PrismaService`. Registrado uma única vez em `AppModule`; qualquer módulo de feature futuro (`OrdersModule`, DSM-7) injeta `PrismaService` sem precisar reimportar `PrismaModule`. |
| `api/src/infrastructure/prisma/prisma.service.spec.ts` | Teste unitário do ciclo de vida (`onModuleInit`/`onModuleDestroy` chamam `$connect`/`$disconnect`) e da construção do adapter com a `DATABASE_URL` do `ConfigService` — mocka `PrismaClient`/`PrismaPg`, sem banco real. |
| `api/src/infrastructure/prisma/order-schema.e2e-spec.ts` | Teste de integração real (Postgres do `docker-compose`, sem mock) que prova a AC1/AC2/AC3 da DSM-6 diretamente na camada Prisma, sem depender do endpoint HTTP (DSM-7 ainda não existe) — ver "Plano de testes". |

Nenhum arquivo de tipo de domínio (`domain/orders/`) é necessário — `Order`/`Passenger` não têm
regra de negócio pura a extrair nesta story; os tipos já vêm do client Prisma gerado
(`Prisma.OrderGetPayload<{ include: { passenger: true } }>`, etc.), consumidos diretamente por
quem precisar (DSM-7).

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `api/src/common/config/validate-env.ts` | Adicionar `DATABASE_URL` a `ValidatedEnv` e a `validateEnv`: mesmo padrão de `SUPPLIERS_BASE_URL` (string obrigatória, não vazia; erro claro no boot se ausente — cumpre o comentário já deixado na linha 18 do arquivo, "fica para quando o Prisma for tocado, DSM-6+"). |
| `api/src/app.module.ts` | Importar `PrismaModule` (`infrastructure/prisma/prisma.module.ts`) em `imports`, ao lado dos módulos já registrados. |

`api/src/domain/orders/` **não** é criado nesta story — não há regra de negócio pura para
extrair ainda (a lógica de conflito/idempotência de aplicação é da DSM-7).
`api/src/infrastructure/orders/`, `api/src/presentation/orders/` também ficam para a DSM-7.
`DECISIONS.md` não é tocado por esta story.

## Contratos de dados

```prisma
// api/prisma/schema.prisma

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

/// Estado do pedido — diferencia "reserva já em andamento por outra requisição concorrente"
/// (PENDING) de "reserva concluída" (CONFIRMED). Só os 2 estados exigidos pela AC da DSM-6.
enum OrderStatus {
  PENDING
  CONFIRMED
}

/// Um pedido de reserva (RF2). idempotencyKey é @unique no nível do banco — é essa constraint,
/// não validação em código, que garante que duas requisições concorrentes com a mesma chave
/// (inclusive entre instâncias diferentes da API) nunca criam dois registros. passengerId é
/// obrigatório e @unique: garante, também no nível do banco, que todo Order tem exatamente um
/// Passenger, e que um Passenger nunca é compartilhado por dois Order.
model Order {
  id             String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  quoteId        String
  idempotencyKey String      @unique
  status         OrderStatus @default(PENDING)
  passengerId    String      @unique @db.Uuid
  passenger      Passenger   @relation(fields: [passengerId], references: [id], onDelete: Restrict)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}

/// Dados do passageiro (nome + CPF), em tabela própria. O FK fica em Order (Order.passengerId),
/// não aqui — ver "Arquitetura decidida" para a justificativa da direção. onDelete: Restrict em
/// Order impede apagar um Passenger enquanto algum Order ainda o referencia.
model Passenger {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  document  String
  order     Order?
  createdAt DateTime @default(now())
}
```

Campos e seus papéis, em relação à AC2 da DSM-6 ("guarda os dados mínimos para responder de forma
idêntica a requisições repetidas"):

| Campo | Papel |
|---|---|
| `Order.id` | Identificador único do pedido — devolvido na resposta de `POST /orders` (DSM-7), idêntico em reenvios da mesma `idempotencyKey`. Gerado pelo Postgres (`gen_random_uuid()`), tipo nativo `uuid`. |
| `Order.quoteId` | Referência opaca à cotação escolhida — string, sem FK/validação de existência (fora de escopo, ver "Contexto"). |
| `Order.idempotencyKey` | `@unique` — a garantia de banco exigida pela AC1. |
| `Order.status` | `PENDING` (default, na criação) ou `CONFIRMED` — AC3. |
| `Order.passengerId` | FK `@unique`, obrigatório, para `Passenger.id` — garante 1:1 no nível do banco e que todo `Order` sempre tem um `Passenger` associado (coluna não anulável). |
| `Order.createdAt`, `Order.updatedAt` | Auditoria padrão, não exigidos literalmente pela AC mas de custo zero e úteis para depuração/teste (ex.: confirmar que só uma linha foi criada por `idempotencyKey`, mesmo sob corrida). |
| `Passenger.name`, `Passenger.document` | Dados mínimos do passageiro (nome completo + CPF) — AC2. |
| `Passenger.id` | Gerado pelo Postgres (`gen_random_uuid()`), tipo nativo `uuid` — referenciado por `Order.passengerId`. |
| `Passenger.order` | Campo de relação virtual (sem coluna própria) — permite navegar de `Passenger` para o `Order` que o referencia, quando precisar (ex.: `include: { order: true }`). |
| `Passenger.createdAt` | Auditoria; sem `updatedAt` — dado do passageiro não é editado após a criação neste escopo (decisão técnica de baixo impacto, simetria mínima em vez de campo sem uso). |

```ts
// api/src/infrastructure/prisma/prisma.service.ts (assinatura)

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit(): Promise<void>; // this.$connect()
  async onModuleDestroy(): Promise<void>; // this.$disconnect()
}
```

```ts
// api/src/infrastructure/prisma/prisma.module.ts (assinatura)

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`validate-env.ts` — trecho adicionado (mesmo padrão de `SUPPLIERS_BASE_URL`, `validate-env.ts:20-26`):

```ts
const databaseUrl = config.DATABASE_URL;
if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
  throw new Error('Missing required env var DATABASE_URL (see api/.env.example)');
}
```

`ValidatedEnv` ganha `DATABASE_URL: string`.

## Sequência de implementação

- [ ] Apagar a migration anterior não commitada (`api/prisma/migrations/20260817164038_init_order/`)
      — nunca foi commitada, não precisa preservar histórico (Revisão 2).
- [ ] Editar `api/prisma/schema.prisma`: `enum OrderStatus`, `model Order` (com `passengerId`
      referenciando `Passenger`, `id`/`passengerId` como `@db.Uuid`) e `model Passenger`
      (conteúdo exato acima), mantendo `generator`/`datasource` como estão.
- [ ] Rodar `cd api && npx prisma migrate dev --name init_order` contra o Postgres do
      `docker-compose` (`docker compose up -d` de pé antes, `parametros-tecnicos.md` item 13) —
      gera uma nova migration do zero e aplica no banco local (duas tabelas, `id` via
      `gen_random_uuid()`, FK `Order.passengerId → Passenger.id` com `ON DELETE RESTRICT`).
- [ ] Rodar `npm run prisma:generate` (AC4 da story) — confirma que o client gerado expõe
      `prisma.order` e `prisma.passenger` sem erro.
- [ ] Estender `api/src/common/config/validate-env.ts`: adicionar `DATABASE_URL` a `ValidatedEnv`
      e a `validateEnv`.
- [ ] Criar/ajustar `api/src/infrastructure/prisma/prisma.service.ts` (`PrismaService`).
- [ ] Criar/ajustar `api/src/infrastructure/prisma/prisma.module.ts` (`PrismaModule`, `@Global()`).
- [ ] Registrar `PrismaModule` em `api/src/app.module.ts`.
- [ ] Ajustar `prisma.service.spec.ts` se necessário (comportamento de ciclo de vida não muda com
      esta revisão).
- [ ] Reescrever `order-schema.e2e-spec.ts` para a nova direção de FK e geração de `id` — ver
      "Plano de testes" (os testes de 1:1 e de exclusão mudam de comportamento esperado).
- [ ] Rodar `npm run lint` e `npm test` em `api/` (com `docker compose up -d` ativo) antes de
      considerar a story pronta.
- [ ] **Não** alterar `DECISIONS.md` nesta story.
- [ ] Commit: `feat(DSM-6): schema Prisma de pedidos com idempotencyKey único no banco`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Duas inserções concorrentes com a mesma `idempotencyKey` (AC1, RF2) | `@unique` em `Order.idempotencyKey` vira um índice único no Postgres — a segunda inserção falha na constraint do banco (erro `P2002`), não em uma checagem prévia de código (que teria uma janela de corrida entre o "checar" e o "inserir"). A lógica de capturar esse erro e devolver a resposta da primeira reserva é da DSM-7; esta story garante que a constraint existe. |
| Duas instâncias da API apontando para o mesmo Postgres (RF2, AC4 da DSM-7) | A garantia vem inteiramente do banco (constraint), não de nenhum estado em memória do processo Nest — `PrismaService` não guarda cache/estado de idempotência, só a conexão. Funciona igual com 1 ou N instâncias. |
| `Order` criado sem `Passenger` correspondente | **Eliminado pelo schema nesta direção de FK** (Revisão 2): `Order.passengerId` é obrigatório (`String`, não `String?`) — o Postgres rejeita qualquer `INSERT` em `Order` sem um `passengerId` válido apontando para um `Passenger` existente. A escrita aninhada do Prisma (`prisma.order.create({ data: { ..., passenger: { create: {...} } } })`) continua sendo a forma recomendada de criar os dois juntos numa única transação (DSM-7). |
| Um `Passenger` fica órfão (sem nenhum `Order` referenciando) depois que o `Order` associado é removido | **Risco aceito, específico desta direção de FK.** Como o FK está em `Order → Passenger`, apagar um `Order` nunca aciona uma exclusão automática do `Passenger` (cascade só se propaga no sentido "linha referenciada → linha que referencia", nunca o inverso). Baixo impacto: este desafio não tem nenhum fluxo de exclusão de pedido (fora do RF2); se precisar no futuro, é lógica de aplicação explícita (apagar `Order` e depois `Passenger` na mesma transação), não algo que o schema resolve sozinho. |
| Tentativa de apagar um `Passenger` enquanto algum `Order` ainda o referencia | `onDelete: Restrict` (explícito no `@relation` de `Order`) — o Postgres rejeita a exclusão do `Passenger` com violação de FK enquanto a referência existir. Precisa apagar o `Order` primeiro; só depois o `Passenger` correspondente pode ser removido. |
| `POST /orders` reenviado com a mesma `idempotencyKey` mas `quoteId`/passageiro diferentes do envio original | **Risco conhecido, não tratado nesta story** (decisão explícita do desenvolvedor, pergunta 8 da rodada original) — o schema não guarda fingerprint/hash do payload original, então a segunda chamada recebe de volta silenciosamente os dados da primeira, sem sinalizar o mismatch. Se isso importar depois, é um campo aditivo (`requestFingerprint String?` em `Order`) + lógica de comparação em DSM-7, sem quebrar o schema atual. |
| Pedido que fica preso em `PENDING` para sempre (ex.: processo cai depois de inserir a linha mas antes de confirmar) | **Fora do escopo do enum desta story** (decisão explícita do desenvolvedor, pergunta 1 da rodada original — só 2 estados, sem `FAILED`). Se esse caminho se provar necessário na DSM-7, adicionar um terceiro valor ao `enum OrderStatus` é uma migration aditiva (`ALTER TYPE ... ADD VALUE`), não uma mudança destrutiva no schema atual. |
| `id` gerado por processo diferente em instâncias diferentes colidindo | `gen_random_uuid()` do Postgres é aleatório (v4), colisão astronomicamente improvável — não é o campo que garante idempotência (`idempotencyKey` é); não precisa de coordenação entre instâncias, e é o próprio banco (não cada processo Node) quem gera o valor. Vale para `Order.id` e `Passenger.id`. |
| Extensão `pgcrypto` para geração de UUID | **Não é necessária.** `gen_random_uuid()` é função nativa do PostgreSQL desde a versão 13 (deixou de depender da extensão `pgcrypto` nessa versão); `postgres:18-alpine` do `docker-compose.yml` já a expõe sem nenhum passo de setup adicional (Revisão 2 — reverte o receio da decisão original, que assumia incorretamente uma dependência de extensão). |
| `DATABASE_URL` ausente/mal formada no ambiente | `validateEnv` falha rápido no boot da aplicação com mensagem clara, mesmo padrão já usado para `SUPPLIERS_BASE_URL` — em vez de um erro de conexão obscuro do driver adapter em algum ponto posterior. |
| Conexão do Prisma não fechada ao encerrar a aplicação (relevante para testes que sobem/derrubam `AppModule` repetidamente, DSM-8) | `PrismaService.onModuleDestroy` chama `this.$disconnect()` — evita vazar conexões abertas entre execuções de teste (`Test.createTestingModule` + `app.close()`). |
| Nomes de tabela/coluna exigindo aspas em SQL cru (`"Order"`, `"Passenger"`, `"idempotencyKey"`) por não usar `@@map`/`@map` | Aceito conscientemente (decisão explícita do desenvolvedor, pergunta 6 da rodada original) — só relevante para quem rodar SQL manual fora do Prisma; toda leitura/escrita da aplicação passa pelo Prisma Client, que já lida com o case-sensitivity. |
| `PrismaModule` global demais, escondendo de onde vem `PrismaService` | Decisão técnica deste agente (baixo impacto): mesmo padrão comum em projetos Nest+Prisma — só um lugar (`app.module.ts`) precisa saber que `PrismaModule` existe; qualquer módulo de feature futuro só declara a dependência via injeção de `PrismaService` no construtor, sem reimportar o módulo. |

## Plano de testes

**`prisma.service.spec.ts`** (unitário, sem banco real — mocka `@prisma/adapter-pg` e a classe
`PrismaClient` gerada) — inalterado por esta revisão:
- `onModuleInit()` chama `this.$connect()` exatamente uma vez.
- `onModuleDestroy()` chama `this.$disconnect()` exatamente uma vez.
- O adapter (`PrismaPg`) é construído com `connectionString` igual ao valor devolvido por
  `configService.get('DATABASE_URL')` — confirma que a env var certa é usada, não uma hardcoded.

**`order-schema.e2e-spec.ts`** (integração real — `Test.createTestingModule({ imports:
[PrismaModule, ConfigModule.forRoot({...})] }).compile()` + `app.init()`, Postgres real via
`docker compose up -d`, sem mock; usa `PrismaService` diretamente, sem precisar do endpoint HTTP
da DSM-7). Convenção de teste: `Order.idempotencyKey` de teste sempre prefixado `'e2e-'`;
`Passenger.document` de teste sempre prefixado `'e2e-'` — usados para limpeza seletiva.
- **AC1 (constraint no banco, não em código):** criar um `Order` com `passenger` aninhado
  (`prismaService.order.create({ data: { quoteId, idempotencyKey: 'e2e-key-1', passenger: {
  create: { name, document: 'e2e-doc-1' } } } })`) → sucesso. Tentar criar um segundo `Order` com
  a mesma `idempotencyKey` (`passenger` aninhado com dados quaisquer) → a chamada rejeita com um
  erro do Prisma cujo `code` é `'P2002'` (violação de unique constraint em `idempotencyKey`), não
  um erro de validação de aplicação — prova que a garantia é do banco.
- **Concorrência real na própria camada Prisma (antecipa o que a DSM-8 vai provar via HTTP):**
  disparar duas chamadas de `prismaService.order.create({ data: { ..., idempotencyKey: 'e2e-key-2',
  passenger: { create: {...} } } })` com a mesma `idempotencyKey` simultaneamente via
  `Promise.allSettled` → exatamente uma resolve, a outra rejeita com `code: 'P2002'`; ao final,
  `prismaService.order.count({ where: { idempotencyKey: 'e2e-key-2' } })` é `1`, e
  `prismaService.passenger.count({ where: { document: 'e2e-doc-2' } })` também é `1` (a escrita
  aninhada não deixa `Passenger` órfão nem duplicado mesmo na tentativa que falhou — o Prisma só
  efetiva a criação do `Passenger` se a transação inteira, incluindo o `Order`, for bem-sucedida).
- **AC2 (dados mínimos persistidos, via `Passenger` relacionado):** criar um `Order` com
  `quoteId`, `idempotencyKey`, e `passenger: { create: { name, document } } }` → ler de volta com
  `prismaService.order.findUnique({ where: { id }, include: { passenger: true } })`; os campos de
  `order.quoteId` e `order.passenger.name`/`order.passenger.document` batem exatamente com o que
  foi inserido.
- **1:1 garantida no banco (`Order.passengerId` único):** criar um `Passenger` avulso
  (`prismaService.passenger.create`), depois um `Order` referenciando-o via `passengerId` (sem
  nested create desta vez, para isolar o teste) → sucesso. Tentar criar um segundo `Order` com o
  **mesmo** `passengerId` → rejeita com `code: 'P2002'` (unique constraint em
  `Order.passengerId`) — prova a cardinalidade 1:1 no nível do banco, não só por convenção de
  código.
- **`onDelete: Restrict` impede apagar um `Passenger` em uso:** com um `Order` e seu `Passenger`
  criados, `prismaService.passenger.delete({ where: { id: passengerId } })` → rejeita com um erro
  de violação de FK (Prisma `code: 'P2003'`); o `Passenger` continua existindo
  (`prismaService.passenger.findUnique({ where: { id: passengerId } })` não é `null`).
- **Ordem correta de limpeza confirma o comportamento acima:** apagar o `Order` primeiro
  (`prismaService.order.delete({ where: { id: orderId } })`) → sucesso, sem violar nenhum FK;
  **depois** apagar o `Passenger` (agora sem nenhum `Order` referenciando) → sucesso. Confirma que
  a direção do FK exige essa ordem (`Order` antes de `Passenger`), diferente de uma exclusão em
  cascata automática.
- **AC3 (estado explícito):** `Order` criado sem `status` explícito → `status` é `'PENDING'`
  (default do schema). Atualizar (`update`) para `status: 'CONFIRMED'` → persiste e é lido de
  volta como `'CONFIRMED'`.
- **AC4 (client gerado expõe o model):** implícito em todos os testes acima usarem
  `prismaService.order.*`/`prismaService.passenger.*` — se o client não expusesse os models, os
  testes nem compilariam (TypeScript) nem rodariam.
- **`id` é `uuid` gerado pelo banco:** após criar um `Order`/`Passenger` sem passar `id`
  explicitamente, o `id` devolvido casa com o formato de UUID (regex) — confirma que
  `gen_random_uuid()` está de fato gerando o valor (não `undefined`/erro de coluna obrigatória sem
  default).
- `afterEach`: **ordem importa** — primeiro `prismaService.order.deleteMany({ where: {
  idempotencyKey: { startsWith: 'e2e-' } } })` (remove os `Order` de teste, o que é sempre seguro
  independente de `Passenger`), **depois**
  `prismaService.passenger.deleteMany({ where: { document: { startsWith: 'e2e-' } } })` (remove os
  `Passenger` de teste, agora órfãos e livres do `onDelete: Restrict`). Inverter essa ordem faria a
  limpeza falhar por violação de FK. Não deixa efeito colateral entre execuções.
- `afterAll`: `app.close()`.

Fora do escopo de teste desta story (fica para DSM-7/DSM-8): qualquer teste que passe pelo
endpoint HTTP `POST /orders`, pela lógica de capturar o erro `P2002` e devolver a resposta da
primeira reserva, ou pelo cenário de duas instâncias da API em portas diferentes — esta story
prova a garantia no nível do schema/Prisma, não no nível do contrato HTTP.
