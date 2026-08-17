# Review — DSM-4: Agregação paralela com timeout global e resultado parcial

**Commit revisado:** `bd651e8` — "feat(DSM-4): agrega fornecedores em paralelo com teto de 6s e resultado parcial"

## Veredito geral

**Aprovado.** A implementação segue a spec de perto: contrato de 3 estados (`ok`/`timeout`/
`failed`), corrida contra o timer global via `Promise.race` sem cancelar a chamada em voo (só
loga `outcome=late-arrival` e descarta), ausência de campo de status geral (`{ quotes, outcomes }`
apenas), desempate de ordenação por `taxesBrl` ascendente, e escopo de teste 100% unitário com
fake timers — tudo conforme as 5 decisões de arquitetura fechadas na spec. Não há alteração em
`api/src/suppliers/types.ts` nem em `DECISIONS.md`, como exigido. Lint, typecheck e toda a suíte
de testes passam. Um achado não bloqueante (timer não limpo em `raceAgainstDeadline`) vale a pena
corrigir, mas não compromete a aceitação da story.

## Critérios de aceite

| # | Critério | Status | Observação |
|---|---|---|---|
| AC1 | Três chamadas em paralelo, tempo ≈ o da mais lenta | Atendido | `getQuotes(query)` das três é chamado como argumento de expressão antes de qualquer `await`, mesma tick. Testado por `search-aggregator.service.spec.ts:84-94` (assert de chamada síncrona dos 3 mocks). Medição de tempo real fica para DSM-5/13, conforme escopo da spec. |
| AC2 | Fornecedor B a 8s → resposta em ≤6s, B como timeout, A/C presentes | Atendido (nível unitário) | Dois caminhos cobertos: timeout individual do client (`reason: 'timeout'`, spec explica que é o caminho real dado `SUPPLIER_TIMEOUT_MS=5000 < SEARCH_TOTAL_TIMEOUT_MS=6000`) e corte pelo timer global simulado com fake timers (`search-aggregator.service.spec.ts:154-190`), incluindo verificação de que o late-arrival é apenas logado e não altera o resultado já devolvido. Teste de integração real via `/admin/force-slow` fica para DSM-5/13, conforme escopo. |
| AC3 | Fornecedor falha 100% → resposta 200, cotações dos que responderam, fornecedor marcado "falhou" explicitamente | Atendido (parcial por natureza do escopo) | `status: 'failed'` sempre presente em `outcomes` (nunca omitido), testado em `search-aggregator.service.spec.ts:117-134`. O código HTTP 200 em si é responsabilidade da DSM-5 (fora de escopo desta story, conforme spec). |
| AC4 | Todos falham/timeout → resposta bem formada, lista vazia, 3 marcados | Atendido | `search-aggregator.service.spec.ts:192-207`. |
| AC5 | Ordenação por menor `miles` | Atendido | Inclui desempate por `taxesBrl` ascendente, testado em `sort-quotes.spec.ts:27-35` e `search-aggregator.service.spec.ts:209-225`. |
| AC6 | Tempo ≤6s consistente em múltiplas execuções (não só na média) | Atendido pelo design | Corte por deadline absoluto (`setTimeout(deadlineMs)` iniciado no começo de cada `raceAgainstDeadline`), determinístico por execução. Medição real de carga fica para DSM-5/13, conforme escopo explícito da spec. |

## Achados

### Não bloqueante — timer de `raceAgainstDeadline` nunca é limpo

**Arquivo:** `api/src/search/race-against-deadline.ts:16-18`

```ts
const timeout = new Promise<typeof GLOBAL_TIMEOUT_MARKER>((resolve) => {
  setTimeout(() => resolve(GLOBAL_TIMEOUT_MARKER), deadlineMs);
});
```

O `setTimeout` nunca é cancelado com `clearTimeout`, mesmo quando `promise` vence a corrida antes
do deadline (caso comum — a maioria das chamadas aos fornecedores deve resolver bem antes de 6s).
Isso não é um bug funcional (o `Promise.race` já resolveu; o `resolve()` tardio do timer é um
no-op), mas em produção cada chamada a `search()` cria 3 timers de até `SEARCH_TOTAL_TIMEOUT_MS`
(6s) que ficam pendentes no event loop mesmo depois da resposta já ter sido devolvida ao cliente
HTTP — desperdício de recursos sob carga (RF2 prevê múltiplas instâncias/requisições concorrentes)
e, a rigor, atrasa o encerramento gracioso do processo se isso for relevante em algum ponto do
pipeline de deploy. A spec não exige explicitamente `clearTimeout`, mas é uma prática padrão
esperada em código que "corre" uma Promise contra um timer.

**Sugestão:** capturar o `timeoutId` retornado por `setTimeout` e chamar `clearTimeout(timeoutId)`
quando `promise` resolver primeiro (ex.: com um `Promise.race` entre `promise.then(v => { clearTimeout(id); return v; })`
e o timer, ou envolvendo o timer numa função que também seja cancelável a partir de fora).

### Cosmético — nenhum outro achado relevante

Não foram encontrados desvios da spec, bugs de classificação de status, problemas de ordem de
`outcomes`, ou lacunas de cobertura de teste nos cenários descritos no plano de testes da spec.

## Verificações de arquitetura contra as decisões fechadas na spec

- **Status em 3 estados (não 5):** confirmado em `search/types.ts:15` e na classificação em
  `search-aggregator.service.ts:96-110` — `http_error`/`unknown_error`/`rate_limited` colapsam em
  `'failed'`; `'timeout'` cobre tanto o timeout individual do client quanto o corte do timer
  global. `SupplierFailureReason` original é logado via `detail=` em `logOutcome` (linha 112-121),
  não reexposto no contrato.
- **Chamada em voo não cancelada:** confirmado — `raceAgainstDeadline` nunca chama nada equivalente
  a `AbortController`/cancelamento; a promise original continua sendo aguardada via
  `promise.then(onLateArrival)` em background, e o teste de corte pelo timer global
  (`search-aggregator.service.spec.ts:154-190`) comprova explicitamente que resolver a promise
  pendente depois não muda o resultado já devolvido.
- **Sem status geral da busca:** `AggregatedSearchResult` expõe só `{ quotes, outcomes }`
  (`search/types.ts:29-34`); nenhum campo `complete`/`partial`/`empty` introduzido.
- **Desempate por `taxesBrl`:** `sort-quotes.ts:8-9` implementa exatamente
  `a.miles - b.miles || a.taxesBrl - b.taxesBrl`, como fechado na spec.
- **Escopo de teste só unitário:** confirmado — os 3 specs usam `Test.createTestingModule` com
  `useValue` para mockar os clients via DI e `jest.useFakeTimers()`/`advanceTimersByTimeAsync` para
  simular o timer global, sem espera real em milissegundos e sem dependência do `mock-suppliers`
  real.

## Verificações adicionais de infraestrutura

- `api/src/common/config/validate-env.ts`: `SEARCH_TOTAL_TIMEOUT_MS` adicionado seguindo
  exatamente o mesmo padrão de `SUPPLIER_TIMEOUT_MS` (normaliza para número positivo, default
  `6000`, erro claro no boot se inválido) — a duplicação de lógica entre os dois blocos é aceitável
  dado que a spec pediu explicitamente "mesmo padrão", sem pedir extração para helper comum.
- `api/.env.example`: `SEARCH_TOTAL_TIMEOUT_MS=6000` adicionado corretamente.
- `api/src/app.module.ts`: `SearchModule` registrado ao lado dos três módulos de fornecedor.
- `api/src/search/search.module.ts`: importa os três `SupplierXModule` + `ConfigModule`, provê e
  exporta `SearchAggregatorService` — confirmei que os três módulos de fornecedor exportam
  corretamente seus clients (`SupplierAClient`/`SupplierBClient`/`SupplierCClient`), e validei via
  um `Test.createTestingModule` ad-hoc (não commitado) que a árvore de DI real
  (`ConfigModule.forRoot({ validate: validateEnv }) + SearchModule`) resolve
  `SearchAggregatorService` sem erros — a injeção de dependências está correta ponta a ponta, não
  só no nível de mocks dos testes unitários.
- `api/src/suppliers/types.ts` e `DECISIONS.md`: confirmados intocados (`git diff bd651e8~1 bd651e8`).

## Testes

Comandos rodados a partir de `api/`:

- `npm run lint` → passou sem erros/avisos (`eslint "{src,test}/**/*.ts" --fix`).
- `npx eslint "src/search/**/*.ts"` → exit 0.
- `npx tsc --noEmit -p tsconfig.json` → exit 0, sem erros de tipo.
- `npx jest src/search --silent` → **17/17 testes passaram** (3 suítes: `sort-quotes.spec.ts`,
  `race-against-deadline.spec.ts`, `search-aggregator.service.spec.ts`).
- `npx jest --silent` (suíte completa do projeto) → **65/65 testes passaram**, 10 suítes — nada
  quebrou nos módulos de DSM-1/2/3.
- `npx jest src/search --detectOpenHandles --silent` → sem handles abertos reportados nos testes
  (o achado do timer não limpo não se manifesta como handle aberto em teste porque os testes usam
  fake timers e `jest.useRealTimers()` no `afterEach`, mas o comportamento em runtime real de
  produção é o descrito no achado acima).

Nenhum gap de cobertura de teste identificado em relação ao plano de testes da spec — todos os
cenários listados (`sort-quotes`, `race-against-deadline`, `search-aggregator.service`) têm teste
correspondente e as asserções verificam o comportamento real (não apenas nomes de função
parecidos): status por fornecedor, contagem de cotações, ordem estável de `outcomes`, não mutação
do array em `sortQuotes`, não cancelamento da chamada em voo, e resolução (nunca rejeição) de
`search()` em todos os cenários.
