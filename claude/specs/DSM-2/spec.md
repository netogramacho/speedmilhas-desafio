# DSM-2 — Cliente HTTP e normalizador do Fornecedor B (rate limit e 429)

## Contexto

User story: `claude/specs/DSM-2/user-story.md`.

O serviço de busca precisa consultar o Fornecedor B (`GET /supplier-b/search` no
`mock-suppliers`, porta 4000) e converter a resposta aninhada (`{ dados: [{ pontos, taxa: {
valor, moeda }, cia }] }`) para o mesmo formato interno único de cotação já usado pelo Fornecedor
A (DSM-1), sem nunca lançar exceção não tratada — nem em erro 500, nem em timeout, nem em 429. A
DSM-1 já deixou pronta e reaproveitável a base comum: `SuppliersHttpModule` (`HttpModule` do
`@nestjs/axios`, timeout via `SUPPLIER_TIMEOUT_MS`), `ConfigModule` global com `validate-env.ts`,
o contrato `SupplierQuoteResult`/`SupplierFailure` em `api/src/suppliers/types.ts`, e o padrão de
client (`try/catch` cobrindo chamada + normalização, `Logger` built-in por chamada). Esta story
estende esse contrato compartilhado com uma nova razão de falha (`rate_limited`) e adiciona ao
client do fornecedor B a única exceção à política geral de "sem retry automático": um retry único
e orçado, específico do 429.

Diferente do fornecedor A, o fornecedor B é o mais lento (latência 1-5s) e o mais instável (20% de
erro 500) — é o que mais ameaça o teto global de 6s do RF1 (DSM-4), por isso a prioridade alta da
story e o cuidado extra com orçamento de tempo no tratamento do 429.

**Fora de escopo (mantido conforme a story):** limitador de taxa de saída (throttling) para nunca
estourar os 5 req/s do fornecedor B — isso é o bônus "circuit breaker" (DSM-12); aqui só se trata
a resposta 429 quando ela acontece. Agregação com os outros fornecedores, ordenação final,
endpoint HTTP `POST /search` (DSM-4/DSM-5).

**Nota sobre `DECISIONS.md`:** por pedido explícito do desenvolvedor nesta conversa, esta story
**não** altera `DECISIONS.md` — é um arquivo de resposta pessoal do desenvolvedor para a
entrevista, preenchido por ele, não pelos agentes. As decisões desta story (classificação
`rate_limited`, timeout do retry, tratamento de moeda != BRL) ficam registradas apenas aqui na
spec e em comentário no código (`supplier-b.normalizer.ts`), conforme a própria AC5 da user story
permite ("comentário/DECISIONS.md").

## Arquitetura decidida

Decisões tomadas com o desenvolvedor nesta conversa (as 3 que não estavam fixadas em
`claude/config/parametros-tecnicos.md`):

- **Classificação da falha de rate limit:** novo `reason: 'rate_limited'` no union compartilhado
  `SupplierFailureReason` (`'timeout' | 'http_error' | 'unknown_error' | 'rate_limited'`), em vez
  de reaproveitar `'http_error'` com `httpStatus: 429`. É uma extensão aditiva do contrato da
  DSM-1 (`api/src/suppliers/types.ts`) — quem consome `SupplierQuoteResult` (DSM-4/5 e,
  futuramente, o frontend) diferencia "fornecedor sobrecarregado" de "fornecedor com erro" sem
  precisar inspecionar `httpStatus` manualmente.
- **Timeout da chamada de retry:** clampado ao orçamento restante do timeout individual da
  primeira tentativa (`SUPPLIER_TIMEOUT_MS - elapsed - waitMs`), passado como override por
  request (`{ timeout: remainingMs }`) — não um timeout novo e independente de 5000ms. Garante que
  1ª tentativa + espera do `Retry-After` + retry nunca ultrapassem, no total, o orçamento
  individual de `SUPPLIER_TIMEOUT_MS` já fixado para o fornecedor.
- **Item com `moeda` diferente de `BRL`:** descartado individualmente (com log de warning),
  mantendo os demais itens válidos da mesma resposta — nunca somado como se fosse BRL, e sem
  conversão (não há fonte de câmbio disponível no projeto). Registrado em comentário no código
  (`supplier-b.normalizer.ts`), não em `DECISIONS.md` (ver nota acima) — o mock real não gera esse
  caso hoje (`moeda: 'BRL'` hardcoded em `mock-suppliers/src/index.js:321`), é um tratamento
  puramente defensivo.

Decisões já fixadas em `parametros-tecnicos.md` e na DSM-1, reaproveitadas sem mudança:

- **Cliente HTTP:** mesmo `SuppliersHttpModule` da DSM-1 (`@nestjs/axios`, `baseURL` e timeout
  default via `ConfigService`), sem nenhuma alteração nele — o override de timeout do retry é
  feito por request, direto na chamada do `SupplierBClient`, não no módulo.
  - **Retry do 429:** vive inteiramente dentro de `SupplierBClient` (não em interceptor
  compartilhado) — retry único, só para 429 do fornecedor B, nunca generalizado para outros
  fornecedores nem outros códigos de erro (`parametros-tecnicos.md`, item 2). Espera
  `min(Retry-After, orçamento restante)`, tenta mais uma vez; se não sobrar orçamento (`<= 0ms`)
  no momento do 429, ou se a espera consumir o orçamento inteiro, trata como falha sem tentar de
  novo.
- **Sem retry automático** para erro 500/timeout do fornecedor B — mesma política da DSM-1.
- **Logging:** `Logger` built-in do `@nestjs/common`, mesmo padrão da DSM-1 (um log por chamada
  com outcome/reason/latência; aqui também loga explicitamente quando um retry foi tentado e o
  resultado dele).
- **`cia` já vem por extenso** (`LATAM`/`GOL`/`AZUL`, mesmo catálogo do fornecedor A) — não precisa
  de tabela de tradução como o fornecedor C vai precisar (DSM-3).

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/src/suppliers/supplier-b/supplier-b.types.ts` | Tipos do payload cru do fornecedor B (`SupplierBRawResponse`, `SupplierBRawItem`) — não vazam para fora do client/normalizer. |
| `api/src/suppliers/supplier-b/supplier-b.normalizer.ts` | Função pura `normalizeSupplierB(raw: SupplierBRawResponse): Quote[]` — mapeia `pontos`→`miles`, `taxa.valor`→`taxesBrl` (só quando `taxa.moeda === 'BRL'`), `cia`→`carrier` (passthrough), tag `supplier: 'supplier-b'`. Descarta (com log de warning) item cuja `taxa.moeda !== 'BRL'`, mantendo os demais itens válidos da mesma resposta — decisão comentada no topo do arquivo (descartar, não converter, por falta de fonte de câmbio). Loga warning se `cia` não for um dos valores conhecidos (`LATAM`/`GOL`/`AZUL`), sem descartar o item — mesmo padrão de `supplier-a.normalizer.ts`. |
| `api/src/suppliers/supplier-b/supplier-b.client.ts` | `SupplierBClient` (`@Injectable`): método `getQuotes(query: SupplierQuoteQuery): Promise<SupplierQuoteResult>`. Monta `GET /supplier-b/search` com `params: { from, to, day }` (nomes do fornecedor B). Trata 429 com retry único orçado (ver "Contratos de dados" abaixo); demais erros (500, timeout, desconhecido) sem retry. Injeta `ConfigService` para ler `SUPPLIER_TIMEOUT_MS` e calcular o orçamento restante. Nunca lança. |
| `api/src/suppliers/supplier-b/supplier-b.module.ts` | `SupplierBModule`: importa `SuppliersHttpModule` e `ConfigModule`, provê e exporta `SupplierBClient`. |
| `api/src/suppliers/supplier-b/supplier-b.normalizer.spec.ts` | Testes unitários do normalizador (função pura, sem mocks de rede). |
| `api/src/suppliers/supplier-b/supplier-b.client.spec.ts` | Testes unitários do client, mockando `HttpService` via DI, incluindo os cenários de retry (429 → sucesso, 429 → falha, 429 sem orçamento). |

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `api/src/suppliers/types.ts` | Estender `SupplierFailureReason` com `'rate_limited'`; atualizar o comentário de `SupplierFailure.httpStatus` (presente quando `reason` é `'http_error'` **ou** `'rate_limited'`, valendo `429` neste último caso). |
| `api/src/app.module.ts` | Importar `SupplierBModule` (ao lado do `SupplierAModule` já importado na DSM-1). |

`DECISIONS.md` **não** é alterado por esta story (decisão do desenvolvedor) — ver nota no
"Contexto".

## Contratos de dados

```ts
// api/src/suppliers/types.ts (trecho alterado)

export type SupplierFailureReason =
  | 'timeout'
  | 'http_error'
  | 'unknown_error'
  | 'rate_limited';

export interface SupplierFailure {
  supplier: SupplierId;
  reason: SupplierFailureReason;
  message: string;
  httpStatus?: number; // presente quando reason === 'http_error' ou 'rate_limited' (429)
}
```

```ts
// api/src/suppliers/supplier-b/supplier-b.types.ts

export interface SupplierBRawItem {
  pontos: number;
  taxa: {
    valor: number;
    moeda: string;
  };
  cia: string;
}

export interface SupplierBRawResponse {
  dados: SupplierBRawItem[];
}
```

**Normalização** (`normalizeSupplierB`):
- `pontos` → `miles`.
- `taxa.valor` → `taxesBrl`, **somente se `taxa.moeda === 'BRL'`**; caso contrário, o item inteiro
  é descartado (não entra no array de saída), com `logger.warn` indicando fornecedor, moeda
  recebida e que o item foi descartado. Comentário no topo do arquivo explica a decisão:
  descartar em vez de converter, porque não há fonte de câmbio disponível no projeto, e nunca
  somar como se fosse BRL.
- `cia` → `carrier` (passthrough); se fora de `LATAM`/`GOL`/`AZUL`, loga warning mas não descarta
  (mesma regra do fornecedor A).
- `supplier: 'supplier-b'` em todo item mapeado.
- `dados: []`, ou todos os itens descartados por moeda != BRL, resultam em `[]` — não é erro.

**Classificação de erro** (dentro do `catch` do `SupplierBClient.getQuotes`, aplicada tanto à 1ª
quanto (se acontecer) à 2ª tentativa):
- `err` é `AxiosError` com `err.response?.status === 429` → **fluxo de retry** (ver abaixo) na 1ª
  tentativa; se a 2ª tentativa também cair aqui (sem mais orçamento para retry), vira
  `reason: 'rate_limited'`, `httpStatus: 429`.
- `err` é `AxiosError` com `err.code === 'ECONNABORTED'` → `reason: 'timeout'` (timeout nativo do
  axios, seja no timeout default da 1ª tentativa ou no timeout clampado da 2ª).
- `err` é `AxiosError` com `err.response` presente e status != 429 → `reason: 'http_error'`,
  `httpStatus: err.response.status`.
- Qualquer outro caso → `reason: 'unknown_error'`.
- `message` sempre `err instanceof Error ? err.message : String(err)`, nunca frase fixa em
  português (mesma regra da DSM-1, `parametros-tecnicos.md` item 15).

**Fluxo de retry do 429** (só na 1ª tentativa; nunca uma 3ª chamada):
1. `elapsedMs = Date.now() - startedAt`; `remainingBudgetMs = SUPPLIER_TIMEOUT_MS - elapsedMs`
   (lido via `ConfigService`).
2. Se `remainingBudgetMs <= 0` → falha direta `reason: 'rate_limited'`, `httpStatus: 429`, **sem**
   tentar de novo.
3. `retryAfterMs = parseRetryAfterMs(err.response.headers['retry-after'])` — parseia inteiro em
   segundos (formato usado pelo mock); se ausente ou não numérico, usa um fallback fixo
   (`1000ms`) e loga warning (a `Retry-After` do mock real é sempre `'1'`, então este ramo é
   defensivo).
4. `waitMs = Math.min(retryAfterMs, remainingBudgetMs)`; aguarda `waitMs` (helper interno
   `sleep(ms)`, mockável em teste).
5. `retryTimeoutMs = remainingBudgetMs - waitMs`. Se `retryTimeoutMs <= 0` → falha direta
   `reason: 'rate_limited'`, sem tentar a 2ª chamada.
6. Caso contrário, tenta a 2ª chamada com `{ params, timeout: retryTimeoutMs }` (override do
   timeout default do módulo). O resultado dessa 2ª tentativa (sucesso ou qualquer uma das 4
   razões de falha) é o resultado final devolvido por `getQuotes` — nunca há uma 3ª tentativa,
   mesmo que a 2ª também seja 429.

## Sequência de implementação

- [ ] Estender `SupplierFailureReason` em `api/src/suppliers/types.ts` com `'rate_limited'` e
      atualizar o comentário de `httpStatus`.
- [ ] Criar `api/src/suppliers/supplier-b/supplier-b.types.ts` (payload cru aninhado).
- [ ] Criar `api/src/suppliers/supplier-b/supplier-b.normalizer.ts`: mapeamento `pontos`/`taxa.valor`/`cia`,
      descarte de item com `taxa.moeda !== 'BRL'` (log warning + comentário explicando a decisão de
      descartar em vez de converter), warning para `cia` desconhecida sem descartar.
- [ ] Criar `api/src/suppliers/supplier-b/supplier-b.client.ts`: `SupplierBClient.getQuotes`
      (`GET /supplier-b/search`, params `from`/`to`/`day`), com o fluxo completo de retry único do
      429 (cálculo de orçamento via `ConfigService`, parse de `Retry-After`, timeout clampado na 2ª
      tentativa, `sleep` interno mockável), e classificação de erro cobrindo `timeout`/
      `http_error`/`unknown_error`/`rate_limited`. Log por chamada (outcome, reason, latência,
      incluindo se houve retry).
- [ ] Criar `api/src/suppliers/supplier-b/supplier-b.module.ts` (`SupplierBModule`, importa
      `SuppliersHttpModule` + `ConfigModule`).
- [ ] Registrar `SupplierBModule` em `api/src/app.module.ts`.
- [ ] Escrever `supplier-b.normalizer.spec.ts` (função pura).
- [ ] Escrever `supplier-b.client.spec.ts` (mock de `HttpService` via DI, incluindo os cenários de
      retry — ver "Plano de testes").
- [ ] Rodar `npm run lint` e `npm test` em `api/` antes de considerar a story pronta.
- [ ] **Não** alterar `DECISIONS.md` nesta story (decisão do desenvolvedor — arquivo é de
      preenchimento pessoal dele, para a entrevista).
- [ ] Commit: `feat(DSM-2): client e normalizador do fornecedor B (retry 429, moeda != BRL)`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Latência > `SUPPLIER_TIMEOUT_MS` (ex.: 8s, `/admin/force-slow`) | Timeout nativo do axios (`ECONNABORTED`) na 1ª tentativa; classificado como `reason: 'timeout'`, nunca propaga exceção. Não é um caso de retry (retry só existe para 429). |
| Erro 500 do fornecedor B | Capturado no `catch`, classificado `reason: 'http_error'`, `httpStatus: 500`; **sem retry** (mesma política da DSM-1); busca segue sem esse fornecedor. |
| 429 com orçamento suficiente | Espera `min(Retry-After, orçamento restante)`, tenta 1x mais com timeout clampado ao orçamento que sobrou. Resultado da 2ª tentativa (sucesso ou qualquer falha) é o resultado final. |
| 429 com orçamento insuficiente (`remainingBudgetMs <= 0` já na 1ª tentativa, ou a espera consome o orçamento inteiro) | Falha direta `reason: 'rate_limited'`, `httpStatus: 429`, sem tentar a 2ª chamada — evita estourar o orçamento individual do fornecedor. |
| 429 na 2ª tentativa também | Sem retry adicional (regra "retry único"); falha final `reason: 'rate_limited'`. |
| 2ª tentativa falha com 500 ou timeout (não 429) | Falha final reflete a razão real da 2ª tentativa (`http_error`/`timeout`), não `rate_limited` — a classificação segue sempre o resultado da última tentativa efetivamente feita. |
| Header `Retry-After` ausente ou não numérico | Fallback fixo de `1000ms` com log de warning — defensivo; o mock real sempre envia `'1'`. |
| Item com `taxa.moeda !== 'BRL'` | Descartado individualmente (log warning), mantendo os demais itens válidos da mesma resposta — nunca somado como BRL. Se todos os itens vierem com moeda diferente, resultado é `[]` (sucesso vazio, não erro). Decisão registrada em comentário no código (`supplier-b.normalizer.ts`), não em `DECISIONS.md`. |
| `cia` fora do enum conhecido (`LATAM`/`GOL`/`AZUL`) | Não descartado; passa como veio (`string`), com log de warning — mesmo padrão do fornecedor A. |
| Duas instâncias da API em paralelo (RF2) | `SupplierBClient` é stateless (orçamento de tempo é calculado por chamada, sem estado compartilhado em memória); rate limit real é aplicado pelo mock por IP, não pela API — não afeta esta story. |
| Concorrência entre buscas simultâneas aumentando a chance real de 429 | Fora do escopo desta story (throttling de saída é a DSM-12); este client já trata corretamente cada 429 individual quando ele acontece. |
| Retry automático generalizado para outros fornecedores/códigos | Deliberadamente **não implementado** — retry é único, específico do 429 do fornecedor B (decisão já fixada em `parametros-tecnicos.md`, reforçada aqui). |

## Plano de testes

Todos os testes desta story são unitários (`*.spec.ts`, colocados junto do arquivo testado),
mockando `HttpService` via DI — sem chamada de rede real (`parametros-tecnicos.md`, item 11). O
`sleep` interno do retry é mockado/stubado nos testes (ex.: `jest.spyOn` no método privado, ou
fake timers do Jest) para não depender de espera real em milissegundos.

**`supplier-b.normalizer.spec.ts`**
- Mapeia corretamente um `dados` com múltiplos itens: `miles` (de `pontos`), `taxesBrl` (de
  `taxa.valor`, quando `taxa.moeda === 'BRL'`), `carrier` (de `cia`, passthrough), `supplier:
  'supplier-b'`.
- `dados: []` → retorna `[]` (não lança, não é erro).
- Item com `taxa.moeda !== 'BRL'` é descartado, mantendo os demais itens válidos da mesma
  resposta (não lança).
- Todos os itens com `taxa.moeda !== 'BRL'` → retorna `[]`.
- Item com `cia` fora do enum conhecido → mapeado normalmente (não descartado).

**`supplier-b.client.spec.ts`**
- **Query string correta:** verifica que `httpService.get` foi chamado com `/supplier-b/search` e
  `{ params: { from, to, day } }` — nomes exigidos pela AC.
- **Sucesso 200 (sem 429):** client devolve `{ ok: true, supplier: 'supplier-b', quotes: [...] }`
  com os itens normalizados; `httpService.get` chamado apenas 1 vez.
- **Erro 500, sem retry:** client devolve `{ ok: false, failure: { reason: 'http_error',
  httpStatus: 500, ... } }`; `httpService.get` chamado apenas 1 vez (garante que não houve
  retry).
- **Timeout, sem retry:** `err.code === 'ECONNABORTED'` → `{ ok: false, failure: { reason:
  'timeout', ... } }`; 1 chamada só.
- **429 com orçamento suficiente, retry bem-sucedido:** 1ª chamada retorna 429 com header
  `Retry-After: '1'`; 2ª chamada (mock encadeado) retorna 200 → client devolve `{ ok: true, ...
  }` com os itens da 2ª resposta; `httpService.get` chamado 2 vezes, a 2ª com `timeout` explícito
  no config (valor clampado, testado com `Date.now` mockado/controlado).
- **429 com orçamento suficiente, retry falha com 500:** resultado final `{ ok: false, failure: {
  reason: 'http_error', httpStatus: 500 } }` (não `rate_limited`) — confirma que a classificação
  reflete a última tentativa.
- **429 com orçamento suficiente, retry também 429:** resultado final `{ ok: false, failure: {
  reason: 'rate_limited', httpStatus: 429 } }`; `httpService.get` chamado exatamente 2 vezes
  (nunca uma 3ª).
- **429 sem orçamento suficiente:** simula `elapsed` já próximo/igual ao `SUPPLIER_TIMEOUT_MS` (ou
  `waitMs` consumindo o orçamento inteiro) → falha direta `reason: 'rate_limited'`; `httpService.get`
  chamado apenas 1 vez (sem 2ª tentativa).
- **`Retry-After` ausente/inválido no 429:** aplica fallback (`1000ms`), loga warning, segue o
  fluxo normal de retry.
- **Erro desconhecido/rede:** `{ ok: false, failure: { reason: 'unknown_error', ... } }`.
- Todos os cenários de falha: o teste garante explicitamente que a Promise **resolve** (não
  rejeita) — mesmo critério mais importante já usado na DSM-1.

Fora do escopo de teste automatizado desta story (fica para DSM-4): agregação com outros
fornecedores, corrida contra o teto global de 6s, ordenação final, e qualquer teste de rate limit
real contra o mock (evitado por ser dependente de timing/flaky).
