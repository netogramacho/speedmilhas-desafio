# Review — DSM-8: Teste automatizado de concorrência real entre duas instâncias (RF4)

## Veredito geral

**Aprovado.**

A implementação (commit `aa2b111`, único arquivo de produto: `api/src/presentation/orders/
orders-two-instances.e2e-spec.ts`) segue a spec técnica com fidelidade — arquitetura, contratos de
dados, nomes de constantes, estratégia de subida/health check/limpeza de processos e critérios de
asserção batem ponto a ponto com `claude/specs/DSM-8/spec.md`. Não há alteração de código de
produção nem do `orders.e2e-spec.ts` existente, como prometido. Rodei os testes de fato (não confiei
só na leitura do código) e o comportamento observado confirma as alegações: os dois processos reais
sobem em portas próprias, a concorrência é genuína (dois processos de SO distintos via
`Promise.all`), a idempotência é verificada corretamente, e não há flakiness nem vazamento de
processo/porta em execuções repetidas.

## Critérios de aceite (user story)

| # | Critério | Status |
|---|---|---|
| AC1 | `cd api && npm test` sobe a aplicação real e o Postgres real, sem mockar persistência/controller | **Atendido** — `spawnInstance` usa `child_process.spawn('npm', ['run','start'], ...)`, sem `Test.createTestingModule`; `PrismaClient` real via `PrismaPg` contra o Postgres do `docker-compose`. Confirmado rodando o arquivo isolado e a suíte completa (200/200 passando). |
| AC2 | Duas requisições `POST /orders` disparadas de forma efetivamente concorrente (`Promise.all`), não sequencial | **Atendido** — `Promise.all([axios.post(...PORT_A...), axios.post(...PORT_B...)])` contra dois processos de SO diferentes em cada uma das 5 rodadas. |
| AC3 | Teste falha explicitamente se os ids divergirem ou houver mais de um registro no banco | **Atendido** — `expect(resB.data.id).toBe(resA.data.id)` e `expect(await prisma.order.count({ where: { idempotencyKey } })).toBe(1)`, ambos `expect` reais (falham o teste, não um `console.warn` silencioso). |
| AC4 | Cenário de duas instâncias em portas diferentes coberto (não apenas duas chamadas no mesmo processo) | **Atendido** — `PORT_A=3100`/`PORT_B=3101`, dois `ChildProcess` de SO reais e distintos, não `supertest` contra o mesmo `INestApplication`. `DECISIONS.md` corretamente **não** foi tocado, coerente com a decisão já registrada na spec de que a automação é 100% viável aqui (sem limitação a documentar). |
| AC5 | 5 rodadas seguidas, sem flaky, sem depender de timing coincidental | **Atendido** — `for` gera 5 casos `it` independentes (`rodada 1/5` .. `rodada 5/5`) dentro do mesmo `beforeAll`. Rodei o arquivo isolado 4 vezes seguidas (`npm test -- orders-two-instances`): 5/5 passando em todas as execuções, sem exceção. Health check com timeout explícito (`30000ms`) evita depender de sorte de timing. |

Todos os cinco critérios de aceite estão cobertos por comportamento real observado, não apenas por
nome de função parecido.

## Aderência à spec técnica

- Constantes, `validBody`, `spawnInstance`, `waitUntilReady`, `killInstance` batem com os
  contratos de dados descritos em `spec.md` (nomes, valores default, comportamento).
- `killInstance` implementado é, na prática, **mais robusto** que a descrição textual da spec: usa
  `child.exitCode !== null || child.signalCode !== null` para detectar processo já finalizado (mais
  correto que checar só `child.killed`, que só reflete kill disparado pelo próprio processo pai) e
  encapsula tudo numa única `Promise` com `once('exit', ...)` + `setTimeout` de fallback para
  `SIGKILL`, com `timer.unref()` para não segurar o event loop do Jest. Não é desvio, é refinamento
  dentro do espírito do que a spec pedia.
- `afterEach`/`afterAll` replicam exatamente a ordem de limpeza de `orders.e2e-spec.ts:63-83`
  (captura `passengerId`/`quoteSnapshotId` antes de apagar `Order`, depois `Passenger`/
  `QuoteSnapshot`, respeitando `onDelete: Restrict`).
- Prefixo de `idempotencyKey` (`orders-two-instances-e2e-`) disjunto dos já usados em
  `orders.e2e-spec.ts` (`orders-e2e-`) e `order-schema.e2e-spec.ts` (`e2e-`) — confirmado rodando a
  suíte completa com os três arquivos em paralelo (Jest workers), sem nenhuma falha por colisão.
- `DECISIONS.md` não foi alterado, como a spec determinou explicitamente (a pendência da AC4 da
  user story sobre "limitação a documentar" não se aplica porque a automação é completa).
- Nenhum código de `api/src/domain/`, `api/src/infrastructure/`, `api/src/common/` ou
  `orders.e2e-spec.ts` foi tocado — confirmado via `git show aa2b111 --stat` (só o novo arquivo de
  teste + os dois `.md` da própria story).

## Achados

Nenhum achado bloqueante. Dois pontos cosméticos/observacionais, sem impacto no comportamento
verificado:

1. **Cosmético — `api/src/presentation/orders/orders-two-instances.e2e-spec.ts:37`** (`stdio:
   'pipe'` sem consumidor). Os streams `stdout`/`stderr` dos processos filhos são criados como pipe
   mas nunca são lidos (nem `.on('data', ...)`, nem redirecionados para `inherit`/`ignore`). Em
   Linux, o buffer de um pipe não lido tem limite (~64KB); se `nest start` algum dia passar a
   emitir uma quantidade de log maior que isso antes de abrir a porta (ex.: erros de compilação
   verbosos, warnings do TypeScript repetidos), o processo filho trava tentando escrever no pipe
   cheio, e `waitUntilReady` estouraria o timeout de 30s por um motivo mascarado ("não ficou pronto",
   quando na verdade travou por I/O). Hoje isso não se manifesta (build via `tsc` puro, sem webpack,
   output mínimo — confirmado em 4 execuções consecutivas sem timeout), mas é um ponto de fragilidade
   silenciosa caso o volume de log do `nest start` cresça no futuro. Sugestão: usar `stdio:
   ['ignore', 'ignore', 'ignore']` (já que o teste não inspeciona stdout/stderr) ou ao menos drenar os
   streams com um listener no-op, para eliminar de vez esse vetor de trava.

## Testes rodados

| Comando | Resultado |
|---|---|
| `cd api && npm test -- orders-two-instances` (1x) | Passou — 1 suíte, 5/5 testes |
| `cd api && npm test -- orders-two-instances` (3x seguidas, loop) | Passou nas 3 — 5/5 em cada, sem flaky |
| `cd api && npm test -- orders-two-instances` (execução extra, verificação de zombie/porta) | Passou — 5/5, sem processo ou porta remanescente em `3100`/`3101` após o término (`ss -ltn`, `ps aux`) |
| `cd api && npm test` (suíte completa) | Passou — 29 suítes, 200/200 testes, incluindo `orders.e2e-spec.ts` e `order-schema.e2e-spec.ts` rodando em paralelo sem colisão de prefixo |
| `cd api && npm run lint` | 0 erros, 22 warnings pré-existentes em `orders.e2e-spec.ts`/`search.e2e-spec.ts` (não relacionados a esta story) — **nenhum warning no arquivo novo** |

Nenhum gap de cobertura encontrado em relação aos critérios de aceite da user story ou à spec
técnica: as asserções cobrem exatamente o que `spec.md` definiu ("Asserção por rodada") e o que a
user story exige (AC1–AC5), com evidência de execução real, não apenas leitura estática do código.
