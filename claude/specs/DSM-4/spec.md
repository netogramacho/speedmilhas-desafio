# DSM-4 — Agregação paralela com timeout global e resultado parcial

## Contexto

User story: `claude/specs/DSM-4/user-story.md`.

O serviço de busca precisa consultar os três fornecedores (`SupplierAClient`/`SupplierBClient`/
`SupplierCClient`, já prontos e testados nas DSM-1/2/3) **em paralelo**, respeitando um teto de
tempo total de resposta (`SEARCH_TOTAL_TIMEOUT_MS`, default `6000ms`), e devolver um resultado
agregado bem formado mesmo quando um ou mais fornecedores falham, demoram além do timeout
individual (`5000ms`, DSM-1/2/3) ou nunca respondem dentro do teto global. Os três clients já
garantem, individualmente, que `getQuotes` **nunca lança** — sempre resolve para
`SupplierQuoteResult` (`{ ok: true, quotes }` ou `{ ok: false, failure }`). Esta story é a camada
que junta os três resultados, aplica o corte de tempo global como rede de segurança adicional, e
produz a lista de cotações ordenada + o status de cada fornecedor.

A base reaproveitada sem alteração: `SupplierAClient`/`SupplierBClient`/`SupplierCClient` e seus
módulos (DSM-1/2/3), o contrato `Quote`/`SupplierId`/`SupplierQuoteQuery`/`SupplierQuoteResult`/
`SupplierFailure`/`SupplierFailureReason` em `api/src/suppliers/types.ts` (**não** alterado por
esta story), `ConfigModule` global e `validate-env.ts` (estendido com uma nova env var, ver
abaixo).

**Fora de escopo (mantido conforme a story):** o endpoint HTTP `POST /search` em si (DSM-5); a UI
que consome esse resultado (DSM-9); retry ou circuit breaker (bônus, DSM-12); qualquer mudança nos
clients de DSM-1/2/3 (nenhuma alteração nesses arquivos). O rótulo de status geral da busca
(`complete`/`partial`/`empty`) também fica fora — nasce na DSM-5, que é quem monta a resposta HTTP
a partir do que esta story devolve.

**Nota sobre este processo:** as 5 decisões de arquitetura desta story que tinham mais de uma
abordagem razoável — granularidade do status por fornecedor, o que fazer com a chamada em voo
quando o timer global corta, se um status geral da busca pertence a esta story, critério de
desempate na ordenação, e escopo de teste — foram levadas ao desenvolvedor nesta conversa. As
decisões abaixo refletem exatamente as respostas dele.

## Arquitetura decidida

Decisões tomadas com o desenvolvedor nesta conversa:

- **Status por fornecedor — 3 estados, não 5:** o resultado agregado expõe
  `status: 'ok' | 'timeout' | 'failed'` por fornecedor, colapsando `http_error`/`unknown_error`/
  `rate_limited` (as três razões de falha "de verdade" de `SupplierFailureReason`) em `'failed'`.
  `'timeout'` continua separado de `'failed'` porque a AC2 da story exige distinguir
  explicitamente "não respondeu a tempo" de "falhou" na resposta. O `SupplierFailureReason`
  completo (`suppliers/types.ts`, não alterado) continua existindo e sendo logado — só não é
  reexposto no contrato de agregação; quem quiser o motivo detalhado (para diagnóstico/observability)
  lê o log estruturado da chamada, não o resultado agregado. Isso mantém o contrato consumido por
  DSM-5/frontend simples (3 estados, sem exigir que quem lê conheça `SupplierFailureReason`).
- **Corte pelo timer global (6s) com chamada em voo:** quando o timer de `SEARCH_TOTAL_TIMEOUT_MS`
  vence a corrida contra uma chamada de fornecedor ainda pendente, essa chamada **não é
  cancelada** — ela segue rodando em background; quando finalmente resolver (`getQuotes` sempre
  resolve, nunca lança), o resultado tardio é apenas logado (`outcome=late-arrival`) e descartado,
  sem afetar a resposta já devolvida. Nenhuma mudança nos clients de DSM-1/2/3 — a "corrida" é
  inteiramente responsabilidade desta story, implementada com `Promise.race` entre a Promise do
  client e um timer. Justificativa aceita do desenvolvedor: como o timeout individual (`5000ms`) é
  ≤ o teto global (`6000ms`, config default), o cenário em que uma chamada ainda está em voo
  quando o timer global dispara é raro na config atual (o próprio timeout individual do fornecedor
  já teria classificado a chamada como `timeout` antes disso, dentro do orçamento de 5s). O corte
  global continua implementado como rede de segurança teórica — protege contra client travado,
  configuração futura com `SUPPLIER_TIMEOUT_MS` maior que `SEARCH_TOTAL_TIMEOUT_MS`, ou qualquer
  chamada que não honre o timeout individual como esperado — não como o caminho principal de
  timeout no cenário descrito na AC2 (fornecedor B forçado a 8s com config default já produz
  `reason: 'timeout'` no próprio `SupplierBClient`, aos 5s, bem dentro do teto de 6s).
- **Sem status geral da busca nesta story:** a função de agregação devolve só
  `{ quotes, outcomes }` — lista de outcomes por fornecedor (sempre 3 entradas, uma por
  `SupplierId`) + cotações agregadas já ordenadas. Nenhum campo tipo
  `status: 'complete' | 'partial' | 'empty'`. Esse rótulo é derivado de `outcomes` na DSM-5 (que
  tem o contexto do endpoint HTTP para decidir o formato da resposta ao cliente).
- **Desempate na ordenação:** ordenação primária por `miles` ascendente (AC5); em empate de
  `miles`, desempate por `taxesBrl` ascendente (favorece o menor custo total ao usuário). Critério
  de comparação: `a.miles - b.miles || a.taxesBrl - b.taxesBrl`.
- **Escopo de testes — só unitário:** clients mockados via DI (mesmo padrão de DSM-1/2/3,
  `Test.createTestingModule` com `useValue`), e fake timers do Jest para simular a passagem do
  timer de `SEARCH_TOTAL_TIMEOUT_MS` sem depender de espera real em milissegundos. Teste de
  integração contra o `mock-suppliers` real via docker compose (medindo tempo de verdade, forçando
  slow/fail com `/admin/force-slow` e `/admin/force-fail`) fica para DSM-5/DSM-13, fora do escopo
  desta story.

Decisões já fixadas em `parametros-tecnicos.md`, reaproveitadas sem mudança:

- **Sem lib de resiliência** (nada de `p-timeout`/`cockatiel`/etc.) — corrida contra o timer
  implementada na mão com `Promise.race` + `setTimeout`, item 3 de `parametros-tecnicos.md`.
- **`Promise.all` sobre as três chamadas já "corridas" individualmente contra o timer** — como
  cada chamada corrida (`raceAgainstDeadline`) nunca rejeita (o client nunca lança, e o timer só
  resolve um marcador, nunca rejeita), um `Promise.all` simples é suficiente; não é necessário
  `Promise.allSettled`.
- **Estrutura de módulos:** novo módulo `search/` (`api/src/search/`), conforme a organização por
  domínio já prevista em `parametros-tecnicos.md`, item 10 (`search/ # DSM-4/5 — agregação +
  endpoint POST /search`). Esta story cria só o serviço de agregação, sem controller — o
  controller HTTP é da DSM-5, no mesmo módulo.
- **Arquitetura limpa (item 16):** a lógica pura de agregação (ordenação, classificação de
  status, a corrida genérica contra o timer) fica em funções puras sem import de `@nestjs/*`/
  `axios`; só o serviço orquestrador (`SearchAggregatorService`) é infraestrutura (Nest DI, injeta
  os três clients + `ConfigService`, faz logging).

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/src/search/types.ts` | Contrato de agregação: `SupplierOutcomeStatus`, `SupplierOutcome`, `AggregatedSearchResult`. Importa `Quote`/`SupplierId` de `../suppliers/types.ts`, mas não os altera. |
| `api/src/search/sort-quotes.ts` | Função pura `sortQuotes(quotes: Quote[]): Quote[]` — ordena por `miles` ascendente, desempate por `taxesBrl` ascendente; não muta o array recebido. |
| `api/src/search/race-against-deadline.ts` | Função pura genérica `raceAgainstDeadline<T>(promise, deadlineMs, onLateArrival?)` — corre a Promise do fornecedor contra um `setTimeout(deadlineMs)`; se o timer vencer, devolve o marcador `GLOBAL_TIMEOUT_MARKER` e, se `onLateArrival` foi passado, anexa um `.then()` na Promise original para logar o resultado tardio quando ela resolver (sem cancelar nada). Sem import de `@nestjs/*`. |
| `api/src/search/search-aggregator.service.ts` | `SearchAggregatorService` (`@Injectable`): injeta `SupplierAClient`/`SupplierBClient`/`SupplierCClient`/`ConfigService`. Método `search(query: SupplierQuoteQuery): Promise<AggregatedSearchResult>` — dispara as três chamadas em paralelo, corre cada uma contra `SEARCH_TOTAL_TIMEOUT_MS`, classifica cada resultado em `SupplierOutcome`, agrega e ordena as cotações dos fornecedores `ok`, loga um resumo por fornecedor e o resultado tardio (se houver). Nunca lança. |
| `api/src/search/search.module.ts` | `SearchModule`: importa `SupplierAModule`/`SupplierBModule`/`SupplierCModule`/`ConfigModule`, provê e exporta `SearchAggregatorService`. |
| `api/src/search/sort-quotes.spec.ts` | Testes unitários da ordenação (função pura). |
| `api/src/search/race-against-deadline.spec.ts` | Testes unitários da corrida contra o timer (fake timers do Jest). |
| `api/src/search/search-aggregator.service.spec.ts` | Testes unitários do serviço de agregação, mockando os três clients via DI + fake timers para o cenário de corte pelo timer global. |

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `api/src/common/config/validate-env.ts` | Adicionar `SEARCH_TOTAL_TIMEOUT_MS` a `ValidatedEnv` e a `validateEnv`: mesmo padrão de `SUPPLIER_TIMEOUT_MS` (normaliza para número positivo, default `6000`, erro claro no boot se inválido). |
| `api/.env.example` | Adicionar `SEARCH_TOTAL_TIMEOUT_MS=6000`. |
| `api/src/app.module.ts` | Importar `SearchModule` (ao lado de `SupplierAModule`/`SupplierBModule`/`SupplierCModule` já importados). |

`api/src/suppliers/types.ts` **não** é alterado — o contrato de `Quote`/`SupplierQuoteResult`/
`SupplierFailureReason` já é suficiente; a simplificação para 3 estados vive só no novo contrato
de `search/types.ts`, que é quem a DSM-4 introduz. `DECISIONS.md` não é tocado (mesma decisão já
registrada e mantida desde a DSM-2).

## Contratos de dados

```ts
// api/src/search/types.ts

import { Quote, SupplierId } from '../suppliers/types';

/**
 * Status simplificado por fornecedor para a resposta agregada — 3 estados, não os 4 de
 * `SupplierFailureReason` (`suppliers/types.ts`). `http_error`/`unknown_error`/`rate_limited`
 * colapsam em `'failed'`; `'timeout'` fica separado porque a busca precisa distinguir
 * explicitamente "não respondeu a tempo" de "falhou" (user-story AC2/AC3). O motivo detalhado
 * original continua existindo e sendo logado pelo client (DSM-1/2/3) e por esta agregação — só
 * não é reexposto neste contrato.
 */
export type SupplierOutcomeStatus = 'ok' | 'timeout' | 'failed';

export interface SupplierOutcome {
  supplier: SupplierId;
  status: SupplierOutcomeStatus;
  /** Quantidade de cotações contribuídas por este fornecedor; 0 quando status !== 'ok'. */
  quotesCount: number;
}

/**
 * Resultado da agregação paralela dos três fornecedores (DSM-4). Não inclui um status geral da
 * busca (`complete`/`partial`/`empty`) — esse rótulo é derivado de `outcomes` na DSM-5, que monta
 * a resposta HTTP.
 */
export interface AggregatedSearchResult {
  /** Cotações de todos os fornecedores com status 'ok', ordenadas por miles asc, taxesBrl asc no empate. */
  quotes: Quote[];
  /** Sempre 3 entradas, uma por SupplierId, na ordem supplier-a/supplier-b/supplier-c. */
  outcomes: SupplierOutcome[];
}
```

```ts
// api/src/search/sort-quotes.ts (assinatura)

/**
 * Ordena cotações por miles ascendente; em empate, por taxesBrl ascendente (menor custo total).
 * Função pura: não muta o array recebido.
 */
export function sortQuotes(quotes: Quote[]): Quote[];
```

```ts
// api/src/search/race-against-deadline.ts

export const GLOBAL_TIMEOUT_MARKER: unique symbol;

/**
 * Corre `promise` contra um timer de `deadlineMs`. Se `promise` resolver primeiro, devolve o
 * valor dela. Se o timer vencer primeiro, devolve `GLOBAL_TIMEOUT_MARKER` — sem cancelar
 * `promise`, que continua rodando em background. Se `onLateArrival` foi passado e o timer venceu,
 * é chamado com o valor de `promise` quando ela eventualmente resolver (nunca chamado se
 * `promise` venceu a corrida). `promise` nunca deve rejeitar (contrato de `getQuotes` das
 * DSM-1/2/3) — esta função não trata rejeição.
 */
export function raceAgainstDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  onLateArrival?: (result: T) => void,
): Promise<T | typeof GLOBAL_TIMEOUT_MARKER>;
```

```ts
// api/src/search/search-aggregator.service.ts (assinatura)

@Injectable()
export class SearchAggregatorService {
  constructor(
    private readonly supplierA: SupplierAClient,
    private readonly supplierB: SupplierBClient,
    private readonly supplierC: SupplierCClient,
    private readonly configService: ConfigService,
  ) {}

  async search(query: SupplierQuoteQuery): Promise<AggregatedSearchResult>;
}
```

**Classificação de outcome** (dado o resultado corrido de cada fornecedor — `SupplierQuoteResult`
ou `GLOBAL_TIMEOUT_MARKER`):
- Resultado é `GLOBAL_TIMEOUT_MARKER` (timer global venceu) → `status: 'timeout'`,
  `quotesCount: 0`.
- Resultado é `{ ok: true, quotes }` → `status: 'ok'`, `quotesCount: quotes.length`.
- Resultado é `{ ok: false, failure }` com `failure.reason === 'timeout'` (timeout individual do
  próprio client, DSM-1/2/3) → `status: 'timeout'`, `quotesCount: 0`.
- Resultado é `{ ok: false, failure }` com `failure.reason` em `'http_error' | 'unknown_error' |
  'rate_limited'` → `status: 'failed'`, `quotesCount: 0`.

**Fluxo de `search(query)`:**
1. Lê `deadlineMs = configService.get<number>('SEARCH_TOTAL_TIMEOUT_MS')`.
2. Dispara as três chamadas na mesma tick (`supplierA.getQuotes(query)`,
   `supplierB.getQuotes(query)`, `supplierC.getQuotes(query)`) — paralelo real, não sequencial
   (AC1).
3. Para cada uma, aplica `raceAgainstDeadline(promise, deadlineMs, onLateArrival)`, com
   `onLateArrival` logando `outcome=late-arrival` quando a chamada tardia resolver.
4. `Promise.all` sobre as três corridas (nenhuma rejeita — ver "Arquitetura decidida").
5. Para cada resultado, classifica o `SupplierOutcome` (regra acima), acumula as `quotes` dos
   outcomes `ok`, loga um resumo por fornecedor (`supplier=X outcome=Y quotesCount=N` e, quando
   houver falha, `detail=<SupplierFailureReason original>` só para diagnóstico).
6. Devolve `{ quotes: sortQuotes(allQuotes), outcomes }` — `outcomes` sempre com 3 entradas, na
   ordem `supplier-a`/`supplier-b`/`supplier-c` (ordem fixa do array de chamadas, preservada por
   `Promise.all`).

## Sequência de implementação

- [ ] Estender `api/src/common/config/validate-env.ts`: adicionar `SEARCH_TOTAL_TIMEOUT_MS` a
      `ValidatedEnv` e a `validateEnv` (número positivo, default `6000`, mesmo padrão de
      `SUPPLIER_TIMEOUT_MS`).
- [ ] Adicionar `SEARCH_TOTAL_TIMEOUT_MS=6000` em `api/.env.example`.
- [ ] Criar `api/src/search/types.ts` (`SupplierOutcomeStatus`, `SupplierOutcome`,
      `AggregatedSearchResult`).
- [ ] Criar `api/src/search/sort-quotes.ts` (função pura de ordenação com desempate por
      `taxesBrl`).
- [ ] Criar `api/src/search/race-against-deadline.ts` (`raceAgainstDeadline` +
      `GLOBAL_TIMEOUT_MARKER`, sem import de `@nestjs/*`).
- [ ] Criar `api/src/search/search-aggregator.service.ts` (`SearchAggregatorService.search`):
      dispara as três chamadas em paralelo, corre cada uma contra o timer global, classifica
      outcomes, agrega e ordena cotações, loga resumo e late-arrival.
- [ ] Criar `api/src/search/search.module.ts` (`SearchModule`, importa `SupplierAModule`/
      `SupplierBModule`/`SupplierCModule`/`ConfigModule`).
- [ ] Registrar `SearchModule` em `api/src/app.module.ts`.
- [ ] Escrever `sort-quotes.spec.ts` (função pura).
- [ ] Escrever `race-against-deadline.spec.ts` (fake timers do Jest: promessa vence antes do
      timer, timer vence antes da promessa + late-arrival logado, sem cancelar a promessa
      original).
- [ ] Escrever `search-aggregator.service.spec.ts` (mock dos três clients via DI + fake timers —
      ver "Plano de testes").
- [ ] Rodar `npm run lint` e `npm test` em `api/` antes de considerar a story pronta.
- [ ] **Não** alterar `DECISIONS.md` nesta story (mesma decisão já registrada desde a DSM-2).
- [ ] Commit: `feat(DSM-4): agregação paralela com timeout global e resultado parcial`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Os três fornecedores respondem dentro do tempo normal (AC1) | As três chamadas disparam na mesma tick (`Promise.all` sobre chamadas já iniciadas, não `await` sequencial); tempo total ≈ o da mais lenta, não a soma. |
| Fornecedor B forçado a 8s (`/admin/force-slow/supplier-b`), config default (`SUPPLIER_TIMEOUT_MS=5000` < `SEARCH_TOTAL_TIMEOUT_MS=6000`) (AC2) | Na prática, o próprio `SupplierBClient` já classifica como `reason: 'timeout'` aos 5s (dentro do teto de 6s) — o outcome vira `'timeout'` pelo caminho do timeout individual, não pelo corte do timer global. Resposta completa em ≤6s, com A/C presentes. |
| Cenário hipotético em que uma chamada continua em voo quando o timer global (6s) dispara (client travado, ou config com `SUPPLIER_TIMEOUT_MS` > `SEARCH_TOTAL_TIMEOUT_MS`) | `raceAgainstDeadline` marca esse fornecedor como `'timeout'` imediatamente ao vencer a corrida; a chamada original **não é cancelada**, segue em background; quando resolver, é logada como `outcome=late-arrival` e descartada — não afeta a resposta já devolvida. Nenhuma mudança nos clients de DSM-1/2/3. |
| Um fornecedor falha 100% (`/admin/force-fail`) (AC3) | `getQuotes` devolve `{ ok: false, failure }`; outcome vira `status: 'failed'`, presente explicitamente em `outcomes` (nunca omitido silenciosamente) — resposta ainda é bem formada, cotações dos outros fornecedores presentes. |
| Todos os fornecedores falham ou estouram timeout (AC4) | `quotes: []`, os 3 outcomes com `status` em `'timeout'`/`'failed'` — `search()` nunca lança; resultado bem formado, decisão sobre erro 500 vs. 200 fica para a DSM-5. |
| Empate em `miles` na ordenação (AC5) | Desempate por `taxesBrl` ascendente — favorece a cotação de menor custo total ao usuário. |
| Teste de carga com `/admin/force-slow` medido em múltiplas execuções (AC6) | O corte é por deadline absoluto (`setTimeout(deadlineMs)` iniciado no começo de `search()`), não por média/estimativa — determinístico por execução, não dependente de timing coincidental. |
| Fornecedor com 0 cotações válidas mas sem erro (ex.: fornecedor C com `data: []` após sujeira, DSM-3) | `{ ok: true, quotes: [] }` → outcome `status: 'ok'`, `quotesCount: 0` — não é `'failed'`; sucesso vazio é diferente de falha (mesma distinção já usada dentro de cada client). |
| `SEARCH_TOTAL_TIMEOUT_MS` ausente/inválido no ambiente | `validateEnv` normaliza para o default `6000` (ausente) ou lança erro claro no boot (valor inválido) — mesmo padrão de `SUPPLIER_TIMEOUT_MS`. |
| Duas instâncias da API em paralelo (RF2) | `SearchAggregatorService` é stateless (sem estado compartilhado em memória entre requisições) — não afeta esta story. |
| Ordem de `outcomes` na resposta | Sempre as 3 entradas, na ordem fixa `supplier-a`/`supplier-b`/`supplier-c` (ordem do array de chamadas em `search()`, preservada por `Promise.all` independente de qual resolveu primeiro) — contrato estável para quem consumir (DSM-5/frontend). |
| Status geral da busca (`complete`/`partial`/`empty`) | Deliberadamente **fora do escopo** desta story — `AggregatedSearchResult` não tem esse campo; nasce na DSM-5. |

## Plano de testes

Todos os testes desta story são unitários (`*.spec.ts`, colocados junto do arquivo testado). Os
três clients são mockados via DI (`Test.createTestingModule` com `useValue`, mesmo padrão de
DSM-1/2/3) — sem chamada de rede real. O timer de `SEARCH_TOTAL_TIMEOUT_MS` é simulado com fake
timers do Jest (`jest.useFakeTimers()` + avanço explícito), não espera real em milissegundos
(`parametros-tecnicos.md`, item 11; decisão do desenvolvedor para esta story).

**`sort-quotes.spec.ts`**
- Ordena por `miles` ascendente com cotações de milhas distintas.
- Em empate de `miles`, desempata por `taxesBrl` ascendente.
- Array vazio → `[]`.
- Não muta o array recebido como argumento (compara referência/conteúdo antes e depois).

**`race-against-deadline.spec.ts`** (fake timers)
- Promise resolve antes do deadline → `raceAgainstDeadline` devolve o valor da Promise;
  `onLateArrival` nunca é chamado.
- Deadline vence antes da Promise resolver → devolve `GLOBAL_TIMEOUT_MARKER` imediatamente ao
  avançar o timer; quando a Promise original resolve depois (avanço adicional/`flushPromises`),
  `onLateArrival` é chamado com o valor dela — confirma que a Promise não foi cancelada.
- Sem `onLateArrival` passado e deadline vence → não lança, comportamento idêntico ao caso acima
  sem o callback.

**`search-aggregator.service.spec.ts`** (mock dos 3 clients via DI + fake timers)
- **Paralelismo (AC1):** os três `getQuotes` são chamados antes de qualquer um resolver (assert
  de que os três mocks foram chamados de forma síncrona/na mesma tick de `search()`, não em
  sequência aguardando um por vez).
- **Sucesso nos três:** `search()` devolve `quotes` com os itens dos três fornecedores,
  `sortQuotes` aplicado, e `outcomes` com os 3 `status: 'ok'` e `quotesCount` correspondente.
- **Um fornecedor com falha classificada (`ok: false`, `reason: 'http_error'` ou
  `'unknown_error'` ou `'rate_limited'`)`:** outcome desse fornecedor vira `status: 'failed'`,
  `quotesCount: 0`; `quotes` final não inclui nada dele; os outros dois fornecedores presentes
  normalmente.
- **Um fornecedor com `reason: 'timeout'` (timeout individual do próprio client, sem envolver o
  timer global):** outcome vira `status: 'timeout'`, sem que o timer de `SEARCH_TOTAL_TIMEOUT_MS`
  precise ser avançado — confirma que timeout individual já classificado pelo client mapeia
  corretamente sem depender da corrida global.
- **Corte pelo timer global (AC2, cenário simulado):** um mock de fornecedor cuja Promise nunca
  resolve dentro do teste (fica pendente); com fake timers, avança o relógio até
  `SEARCH_TOTAL_TIMEOUT_MS` → `search()` resolve com esse fornecedor como `status: 'timeout'`,
  sem esperar a Promise pendente. Resolve depois a Promise pendente (avanço adicional) e confirma
  via spy de log que o resultado tardio foi logado (`outcome=late-arrival`) sem alterar o
  resultado já devolvido por `search()`.
- **Todos os fornecedores falham/timeout (AC4):** `search()` devolve `{ quotes: [], outcomes:
  [...3 outcomes não-'ok'] }` — resolve normalmente, não lança.
- **Desempate por `taxesBrl` (AC5):** dois fornecedores devolvem cotações com `miles` iguais e
  `taxesBrl` diferentes; `quotes` final tem a de menor `taxesBrl` primeiro.
- **Fornecedor com sucesso vazio (`{ ok: true, quotes: [] }`):** outcome `status: 'ok'`,
  `quotesCount: 0` — não confundido com `'failed'`.
- **Ordem estável de `outcomes`:** independente de qual fornecedor resolve primeiro no mock
  (ex.: B resolve antes de A), `outcomes` sai sempre na ordem `supplier-a`/`supplier-b`/
  `supplier-c`.
- Todos os cenários: `search()` resolve (nunca rejeita) — mesmo critério mais importante já usado
  em DSM-1/2/3, agora no nível da agregação.

Fora do escopo de teste automatizado desta story (fica para DSM-5/DSM-13): teste de integração
contra o `mock-suppliers` real via docker compose, medindo tempo de resposta de verdade e
forçando slow/fail via `/admin/force-slow`/`/admin/force-fail` (AC2/AC6 "de verdade", não
simulado com fake timers); o endpoint HTTP `POST /search` e seus DTOs de entrada/saída.
