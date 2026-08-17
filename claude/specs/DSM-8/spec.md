# DSM-8 — Teste automatizado de concorrência real entre duas instâncias (RF4)

## Contexto

User story: `claude/specs/DSM-8/user-story.md`.

A DSM-7 (working tree, ainda não commitada) já entrega `POST /orders`
(`api/src/presentation/orders/`, `api/src/infrastructure/orders/`) com idempotência garantida por
constraint única no banco (`Order.idempotencyKey @unique`, `claude/specs/DSM-6/spec.md`) e já tem
um teste de concorrência **dentro do mesmo processo** (`api/src/presentation/orders/
orders.e2e-spec.ts`, AC3: duas chamadas `supertest` via `Promise.all` contra o mesmo
`INestApplication`, `orders.e2e-spec.ts:150-184`). A própria DSM-7 deixou explícito, na sua última
linha (`orders.e2e-spec.ts:753-755`), que o cenário de **duas instâncias reais em portas
diferentes** é desta story (DSM-8), não dela — mesma garantia de banco, mas ainda sem prova
automatizada formal com dois processos Node de verdade.

O corpo de `POST /orders` já exige, desde a Revisão 2 da DSM-7, também um campo `quote: { miles,
taxesBrl, carrier }`, além de `passenger`/`idempotencyKey`/`quoteId` (`claude/specs/DSM-7/
spec.md`, "Contratos de dados") — o `validBody` desta spec inclui `quote` desde o início, senão a
requisição cai em 400 de validação antes mesmo de testar concorrência.

**Decisões tomadas pelo desenvolvedor via `AskUserQuestion` (sessão principal, repassadas pelo
coordenador)** — os cinco pontos abaixo tinham mais de uma abordagem razoável e foram escalados
antes de qualquer linha desta spec ser escrita:

1. **Como subir os processos:** `npm run start` (`nest start`, sem `--watch`) via
   `child_process.spawn` — sem build prévio (`nest build` + `node dist/main.js`), sem deixar
   watcher pendurado.
2. **Portas:** dedicadas só a este teste — `3100`/`3101` — **não** reaproveitar `3000`/`3010`
   (README, `PORT=3010 npm run start:dev`), para não colidir com uma instância manual do
   desenvolvedor rodando em paralelo.
3. **Health check:** poll HTTP genérico contra uma rota já existente, com retry/timeout, tolerando
   `ECONNREFUSED` até o timeout esgotar; qualquer resposta HTTP (mesmo 400/404) já conta como
   "processo no ar". Sem endpoint `/health` novo, sem parsear `stdout`.
4. **AC5 ("5x sem flaky"):** 5 rodadas do par de requisições concorrentes **dentro do mesmo boot**
   (`beforeAll` sobe as duas instâncias uma vez só; cada rodada usa uma `idempotencyKey` distinta)
   — não 5 boots completos, não validação manual fora do teste.
5. **Local do arquivo:** junto dos demais `*.e2e-spec.ts` de pedidos, em
   `api/src/presentation/orders/`, rodando automaticamente com `cd api && npm test` (AC1 literal)
   — não um script/pasta separada.

A pendência de `DECISIONS.md` prevista na AC4 da user story ("se automatizar 100% não for viável...
a limitação fica registrada") **não se aplica**: a decisão confirmada acima já é a automação
completa com dois processos reais, então não há limitação a registrar — `DECISIONS.md` não é
tocado por esta story.

**Achados fechados durante a investigação, sem necessidade de escalar:**
- **Nenhuma dependência nova é necessária.** `child_process.spawn` é builtin do Node; o poll de
  prontidão e as chamadas de teste usam `axios`, já em `dependencies` do `api/package.json`
  (`api/package.json:31`) — não em `devDependencies`, mas disponível e já usado em runtime pela
  própria API (clients de fornecedor). Não há precedente de `wait-on`/`execa`/
  `start-server-and-test` no projeto, e não é preciso trazer nenhum.
- **Pré-requisito de infraestrutura inalterado:** como todo teste de integração do projeto
  (`claude/config/parametros-tecnicos.md`, item 13), este teste assume `docker compose up -d` já
  de pé e saudável — não sobe o Postgres/`mock-suppliers` sozinho. Mesmo padrão de
  `orders.e2e-spec.ts` e `order-schema.e2e-spec.ts` (nenhum dos dois inicia o `docker-compose`).

## Arquitetura decidida

- **Novo arquivo `api/src/presentation/orders/orders-two-instances.e2e-spec.ts`**, ao lado de
  `orders.e2e-spec.ts` — não altera esse arquivo, não altera nenhum código de produção. Roda
  automaticamente com `cd api && npm test` (testRegex do Jest já cobre qualquer
  `*.e2e-spec.ts`, `api/package.json:67`).
- **Um `describe` só, com um `beforeAll`/`afterEach`/`afterAll` compartilhados e 5 casos `it`
  gerados por um `for` no corpo do `describe`** (não 5 boots, não um `it` só com loop interno) —
  cada rodada aparece como um teste Jest independente no relatório (`rodada 1/5`, ..., `rodada
  5/5`), o que dá sinal explícito de qual rodada especificamente falhou, se alguma falhar — mais
  forte para provar "não é flaky por sorte" do que um `it` único com asserts em loop.
- **Subida dos processos (`beforeAll`):**
  - `spawnInstance(port)`: `child_process.spawn('npm', ['run', 'start'], { cwd: API_ROOT, env: {
    ...process.env, PORT: String(port) }, detached: true, stdio: 'pipe' })` — `cwd: API_ROOT`
    (`path.resolve(__dirname, '../../..')`, resolve para `api/`) garante que o `dotenv/config` do
    próprio `main.ts:3` (`main.ts:1-4`) carregue `api/.env` normalmente, herdando
    `DATABASE_URL`/`SUPPLIERS_BASE_URL` sem repetição nesta spec — só `PORT` é sobrescrita por
    instância. `detached: true` cria um novo grupo de processos com `npm` como líder, para permitir
    matar `npm` + o processo Nest/Node que ele eventualmente lança como uma unidade só (ver
    limpeza).
  - As duas variáveis (`childA`, `childB`) são atribuídas **no escopo do `describe`, imediatamente
    após o `spawn`** — antes de esperar o health check — para que `afterAll` consiga matar qualquer
    processo já lançado mesmo se `beforeAll` lançar no meio (ex.: a instância B nunca fica pronta).
  - Health check: `waitUntilReady(port)` faz `axios.post('http://localhost:' + port + '/orders',
    {}, { validateStatus: () => true, timeout: 2000 })` em loop (intervalo `250ms`), tratando
    qualquer resposta HTTP (aqui, `400` — corpo vazio falha validação, mas confirma que
    `ValidationPipe`/`AllExceptionsFilter` já estão respondendo) como "pronto"; erros de conexão
    (`ECONNREFUSED` e equivalentes) são engolidos e re-tentados até um timeout total de `30000ms`,
    quando então lança um erro explícito (`instância na porta ${port} não ficou pronta em
    30000ms`) — falha clara, não trava o teste indefinidamente. `POST /orders` (não outra rota) foi
    escolhido porque é a própria rota que o teste depende — confirma não só "porta aceita TCP", mas
    "o pipeline HTTP completo do endpoint sob teste está de pé", sem precisar de rota nova.
    `waitUntilReady(3100)`/`waitUntilReady(3101)` rodam em paralelo (`Promise.all`).
- **Limpeza (`afterAll`), mesmo em caso de falha de qualquer `it`:** `afterEach`/`afterAll` do Jest
  rodam mesmo que um teste anterior tenha falhado (garantia do próprio framework) — não há try/catch
  adicional necessário para isso.
  - `killInstance(child)`: se `child`/`child.pid` existir e o processo ainda não tiver saído, envia
    `SIGTERM` ao **grupo** de processos (`process.kill(-child.pid, 'SIGTERM')`, o sinal negativo do
    PID mata o grupo inteiro, não só o `npm` de topo); espera até `5000ms` pelo evento `'exit'`; se
    não sair a tempo, `SIGKILL` no mesmo grupo. Chamado para `childA` e `childB` em sequência
    (dentro de um `try`/`finally` cada, para a falha de matar um não impedir a tentativa no outro).
  - Limpeza de banco: mesmo padrão de `orders.e2e-spec.ts:63-83` — captura `passengerId`/
    `quoteSnapshotId` dos `Order` com `idempotencyKey` começando no prefixo desta spec, apaga
    `Order` primeiro (FK `onDelete: Restrict` em `Passenger`/`QuoteSnapshot`), depois
    `Passenger`/`QuoteSnapshot`. Roda em `afterEach` (por rodada, mesma convenção do arquivo
    irmão) e mais uma vez em `afterAll` como rede de segurança.
  - `prisma.$disconnect()` ao final do `afterAll`.
- **Acesso ao banco para verificação/limpeza — `PrismaClient` instanciado direto, sem `PrismaService`
  via DI.** Diferente de `orders.e2e-spec.ts`, que sobe o `AppModule` inteiro via
  `Test.createTestingModule` (`orders.e2e-spec.ts:52-61`) e pega `PrismaService` por injeção, este
  teste **não** sobe nenhum `INestApplication` no processo do Jest — as duas instâncias reais
  já são o `AppModule`, rodando como processos filhos. Reaproveitar o `AppModule` aqui duplicaria a
  conexão ao Postgres sem necessidade e é conceitualmente errado (o teste não é "mais uma instância
  da API", é quem observa as outras duas de fora). Em vez disso, o mesmo padrão de
  `PrismaService` (`infrastructure/prisma/prisma.service.ts:12-18`) é reproduzido sem o wrapper de
  DI: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`
  + `$connect()` manual no `beforeAll`. Import de `'dotenv/config'` no topo do arquivo de teste
  (mesmo padrão do `main.ts:3`) garante que `process.env.DATABASE_URL` exista no processo pai do
  Jest antes dessa instanciação.
- **Prefixo de `idempotencyKey` — `'orders-two-instances-e2e-'`, disjunto dos já usados.**
  `order-schema.e2e-spec.ts` (DSM-6) limpa tudo que começa com `'e2e-'`; `orders.e2e-spec.ts`
  (DSM-7) usa `'orders-e2e-'` (comentário explicando o motivo em `orders.e2e-spec.ts:18-25`: Jest
  roda arquivos em paralelo, um `afterEach` de outro arquivo pode apagar linhas no meio de um teste
  de concorrência deste). `'orders-two-instances-e2e-'` não é prefixo nem sufixo de nenhum dos dois
  existentes — mesma proteção, sem tocar nos outros arquivos.
- **Chamadas de teste via `axios` direto às portas `3100`/`3101` (não `supertest`).** `supertest`
  precisa de um `app.getHttpServer()`/handle Express em processo — não existe aqui, as instâncias
  são processos de SO separados, então HTTP real ponta a ponta é a única opção; `axios` (já
  dependência) com `validateStatus: () => true` evita exceção por status HTTP não-2xx, deixando os
  `expect` explícitos decidirem pass/fail.
- **`jest.setTimeout(120_000)`, no topo deste arquivo apenas** (não altera a config global do
  Jest em `api/package.json`) — cobre o pior caso de `nest start` sem build prévio (compilação
  TS a frio) duas vezes em paralelo, mais os dois timeouts de `30000ms` do health check rodando em
  paralelo, com folga.

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| `api/src/presentation/orders/orders-two-instances.e2e-spec.ts` | Único arquivo novo desta story. Sobe duas instâncias reais da API (`3100`/`3101`) como processos filhos, espera as duas ficarem prontas, dispara 5 rodadas de `POST /orders` concorrente (mesma `idempotencyKey` por rodada, via `Promise.all` contra as duas portas), confere `id` igual nas duas respostas e uma única linha no banco por rodada, e limpa processos + banco ao final (mesmo em falha). Nenhum outro arquivo é criado ou alterado — não é implementação de produto, só teste. |

Não há alteração em nenhum componente de `api/src/domain/`, `api/src/infrastructure/`,
`api/src/common/` nem no `orders.e2e-spec.ts` existente.

## Contratos de dados

```ts
// api/src/presentation/orders/orders-two-instances.e2e-spec.ts — contrato interno (não exportado,
// só a forma dos dados que o teste manipula)

import 'dotenv/config';
import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import axios from 'axios';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const PORT_A = 3100;
const PORT_B = 3101;
const API_ROOT = path.resolve(__dirname, '../../..'); // .../api
const KEY_PREFIX = 'orders-two-instances-e2e-';
const HEALTH_CHECK_TIMEOUT_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 250;
const KILL_GRACE_PERIOD_MS = 5_000;

function validBody(idempotencyKey: string): Record<string, unknown>;
// mesma forma de orders.e2e-spec.ts:31-38 — quoteId, idempotencyKey, passenger (CPF válido fixo),
// quote: { miles, taxesBrl, carrier }. Duplicado propositalmente (arquivo de e2e-spec
// autocontido, mesmo padrão já adotado no arquivo irmão — nenhum dos dois exporta `validBody`
// hoje para o outro importar).

function spawnInstance(port: number): ChildProcess;
// child_process.spawn('npm', ['run', 'start'], { cwd: API_ROOT, env: { ...process.env, PORT:
// String(port) }, detached: true, stdio: 'pipe' }).

async function waitUntilReady(port: number): Promise<void>;
// Poll de POST http://localhost:${port}/orders com corpo vazio, validateStatus: () => true;
// ECONNREFUSED/erro de conexão é re-tentado a cada HEALTH_CHECK_INTERVAL_MS; lança erro explícito
// se HEALTH_CHECK_TIMEOUT_MS esgotar sem nenhuma resposta HTTP.

async function killInstance(child: ChildProcess | undefined): Promise<void>;
// SIGTERM no grupo de processos (process.kill(-child.pid, 'SIGTERM')), espera até
// KILL_GRACE_PERIOD_MS por 'exit', SIGKILL no grupo como fallback.
```

Body de requisição usado em cada rodada (mesmo `quote` exigido pela DSM-7, Revisão 2):

```json
{
  "quoteId": "quote-abc123",
  "idempotencyKey": "orders-two-instances-e2e-round-1",
  "passenger": { "name": "Maria da Silva", "document": "52998224725" },
  "quote": { "miles": 18500, "taxesBrl": 38.5, "carrier": "GOL" }
}
```

Asserção por rodada: `resA.status === 201`, `resB.status === 201`, `resB.data.id === resA.data.id`,
`prisma.order.count({ where: { idempotencyKey } }) === 1`.

## Sequência de implementação

- [ ] Confirmar `docker compose up -d` de pé e saudável antes de rodar o teste (pré-requisito, não
      código) — mesma checagem já documentada em `parametros-tecnicos.md`, item 13.
- [ ] Criar `api/src/presentation/orders/orders-two-instances.e2e-spec.ts`:
  - [ ] Constantes de topo (`PORT_A`, `PORT_B`, `API_ROOT`, `KEY_PREFIX`,
        `HEALTH_CHECK_TIMEOUT_MS`, `HEALTH_CHECK_INTERVAL_MS`, `KILL_GRACE_PERIOD_MS`) e
        `jest.setTimeout(120_000)`.
  - [ ] `validBody(idempotencyKey)` (mesma forma de `orders.e2e-spec.ts:31-38`).
  - [ ] `spawnInstance(port)`, `waitUntilReady(port)`, `killInstance(child)` conforme "Contratos de
        dados".
  - [ ] `beforeAll`: instancia `PrismaClient` (`PrismaPg` + `DATABASE_URL` do `process.env`),
        `$connect()`; `childA = spawnInstance(PORT_A)`, `childB = spawnInstance(PORT_B)`
        (atribuídos antes de esperar prontidão); `await Promise.all([waitUntilReady(PORT_A),
        waitUntilReady(PORT_B)])`.
  - [ ] `afterEach`: limpeza de `Order`/`Passenger`/`QuoteSnapshot` por `idempotencyKey.startsWith
        (KEY_PREFIX)`, mesma ordem de `orders.e2e-spec.ts:63-83`.
  - [ ] `afterAll`: `killInstance(childA)`, `killInstance(childB)` (cada um em seu próprio
        try/finally), limpeza de banco por prefixo como rede de segurança, `prisma.$disconnect()`.
  - [ ] `for (let round = 1; round <= 5; round++) { it(...) }` gerando 5 casos `it`, cada um: monta
        `idempotencyKey = KEY_PREFIX + 'round-' + round`, dispara `Promise.all` dos dois
        `axios.post` (portas `PORT_A`/`PORT_B`), confere status 201 nas duas, `id` igual, `quote`
        igual, e `prisma.order.count(...) === 1`.
- [ ] Rodar `cd api && npm test -- orders-two-instances` isoladamente algumas vezes seguidas
      (validação local desta story, não fica automatizado em código) para confirmar ausência de
      flakiness antes de considerar a story pronta.
- [ ] Rodar `cd api && npm test` completo (suíte inteira) para confirmar que o novo arquivo não
      quebra nem colide com `orders.e2e-spec.ts`/`order-schema.e2e-spec.ts` rodando em paralelo.
- [ ] Rodar `npm run lint` em `api/` antes de considerar a story pronta.
- [ ] **Não** alterar `DECISIONS.md` — decisão já registrada acima, sem limitação a documentar.
- [ ] Commit: `test(DSM-8): concorrência real entre duas instâncias de POST /orders`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Porta `3100`/`3101` já em uso (outro processo, execução anterior que vazou) | `spawn` ainda retorna um `ChildProcess`, mas o processo morre cedo com `EADDRINUSE`; `waitUntilReady` nunca recebe resposta HTTP, expira no timeout de `30000ms` e falha com mensagem explícita citando a porta — não trava o teste, não falha por outro motivo disfarçado. |
| Instância não sobe a tempo (erro de compilação TS, `DATABASE_URL` ausente/errada, Postgres fora do ar) | Mesmo tratamento acima — timeout explícito do health check, sem depender de timing coincidental. |
| Processo filho não responde a `SIGTERM` (trava) | Fallback `SIGKILL` no mesmo grupo de processos após `KILL_GRACE_PERIOD_MS` (`5000ms`). |
| Um `it` (rodada) falha no meio do `describe` | `afterEach`/`afterAll` do Jest continuam rodando mesmo assim (garantia do framework) — processos filhos são mortos e o banco é limpo de qualquer forma. |
| `beforeAll` falha antes das duas instâncias ficarem prontas (ex.: só `childA` chegou a subir) | `childA`/`childB` são atribuídos no escopo do `describe` assim que o `spawn` retorna, antes do `await` de prontidão — `afterAll` ainda encontra a referência e tenta matar o que foi de fato lançado. |
| Processo pai do Jest é morto abruptamente (`SIGKILL`) antes do `afterAll` rodar, em CI | Risco aceito, fora do controle deste teste — mesma limitação de qualquer processo filho sob um pai morto sem chance de cleanup; não mitigado em código. |
| Colisão de prefixo de `idempotencyKey` com `orders.e2e-spec.ts`/`order-schema.e2e-spec.ts` rodando em paralelo (Jest paraleliza arquivos) | Prefixo próprio (`'orders-two-instances-e2e-'`), disjunto de `'e2e-'` e `'orders-e2e-'` já usados — mesmo raciocínio já documentado em `orders.e2e-spec.ts:18-25`. |
| `Order` órfão de `Passenger`/`QuoteSnapshot` por `onDelete: Restrict` durante a limpeza | Mesma ordem já usada em `orders.e2e-spec.ts:63-83`: captura `passengerId`/`quoteSnapshotId` antes, apaga `Order` primeiro, depois `Passenger`/`QuoteSnapshot`. |
| `axios` lançar exceção por status HTTP não-2xx durante o health check ou as chamadas de teste | `validateStatus: () => true` em todas as chamadas — status vira dado a inspecionar via `expect`, não uma exceção a capturar. |
| Duas instâncias reais, mesma `idempotencyKey`, uma captura a linha ainda `PENDING` (janela entre `INSERT` e `UPDATE` do vencedor) | Comportamento herdado da DSM-7 (`claude/specs/DSM-7/spec.md`, "Casos de borda") — aceito, sem mudança; o teste só confirma `id` igual nas duas respostas e uma única linha no banco, não exige `status` específico. |
| `docker compose` fora do ar | Não é responsabilidade deste teste subir a infra (mesmo padrão dos e2e-specs existentes) — o health check da própria API falha ao conectar no Postgres, e `waitUntilReady` expira com erro explícito. |

## Plano de testes

Este é, na prática, o único teste que a story entrega — não há unitário separado (não há lógica de
produção nova, só orquestração de teste). Cobertura dentro do próprio
`orders-two-instances.e2e-spec.ts`:

- **AC1 (sobe a aplicação real e o Postgres real, sem mock):** as duas instâncias são processos
  Node reais (`npm run start`), sem `Test.createTestingModule`; `PrismaClient` real contra o
  Postgres do `docker-compose`. Confirmado implicitamente por todo o arquivo — nenhuma camada
  mockada.
- **AC2 (concorrência de verdade, `Promise.all`, não sequencial):** as duas chamadas `axios.post`
  de cada rodada disparam dentro do mesmo `Promise.all`, contra portas TCP diferentes de processos
  diferentes.
- **AC3 (falha explícita se os ids divergirem ou houver mais de um registro):** cada rodada faz
  `expect(resB.data.id).toBe(resA.data.id)` e `expect(await prisma.order.count({ where:
  { idempotencyKey } })).toBe(1)` — falha do teste, não silêncio, se qualquer um dos dois não bater.
- **AC4 (cenário de duas instâncias em portas diferentes coberto):** `PORT_A = 3100`, `PORT_B =
  3101`, dois processos de SO distintos — não duas chamadas `supertest` no mesmo processo.
- **AC5 (roda 5x seguidas sem flaky):** 5 casos `it` gerados pelo `for`, mesmo boot
  (`beforeAll` roda uma vez), `idempotencyKey` diferente por rodada — cada rodada é um teste Jest
  independente, reportado separadamente; rodar o arquivo isoladamente algumas vezes em sequência
  (passo da "Sequência de implementação") é a validação final de ausência de flakiness antes de
  fechar a story.

Fora do escopo desta story (mantido conforme a user story): teste de carga/performance; qualquer
endpoint além de `/orders` neste arquivo.
