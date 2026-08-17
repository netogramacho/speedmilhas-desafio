# DSM-3 — Cliente HTTP e normalizador do Fornecedor C (payload sujo sem erro HTTP)

## Contexto

User story: `claude/specs/DSM-3/user-story.md`.

O serviço de busca precisa consultar o Fornecedor C (`POST /supplier-c/v2/quotes` no
`mock-suppliers`, porta 4000) e converter a resposta (`{ data: [{ price_miles, fee,
airline_code }] }`) para o mesmo formato interno único de cotação já usado pelos Fornecedores A
(DSM-1) e B (DSM-2). A particularidade do fornecedor C é que ele **nunca retorna erro HTTP para
sujeira de dado** — em 10% das respostas, o payload vem malformado com status 200: `data: []`,
um campo `null` num item, ou `price_miles` como string. Isso muda onde a validação precisa
acontecer: para A/B, qualquer formato inesperado podia virar `unknown_error` só por estar dentro
do `try/catch` do client (DSM-1, `spec.md:42-45`); para C, a validação **tem que ser item a
item, dentro do normalizador**, porque o requisito é isolar o item ruim sem descartar a resposta
inteira nem os itens bons ao lado dele.

A base comum já está pronta e é reaproveitada sem alteração: `SuppliersHttpModule` (`HttpModule`
do `@nestjs/axios`, timeout via `SUPPLIER_TIMEOUT_MS`), `ConfigModule` global, o contrato
`SupplierQuoteResult`/`SupplierFailure`/`Quote`/`CarrierName` em `api/src/suppliers/types.ts`, e
o padrão de client com `try/catch` cobrindo chamada + normalização e `Logger` built-in por
chamada (DSM-1/DSM-2).

**Fora de escopo (mantido conforme a story):** parse tolerante de `price_miles` string (ex.:
`Number("17500")`) — decisão explícita desta spec é **descartar**, não corrigir (ver seção
"Arquitetura decidida"). Agregação com os outros fornecedores, ordenação final, endpoint HTTP
`POST /search` (DSM-4/DSM-5). Retry automático (o fornecedor C não tem comportamento de rate
limit nem justificativa de retry — só A/A-like erro 500/timeout, mesma política sem retry da
DSM-1).

**Nota sobre este processo:** as 4 decisões de arquitetura desta story que tinham mais de uma
abordagem razoável — parse de `price_miles` string, local do mapeamento IATA→nome de companhia,
tratamento de `airline_code` fora do catálogo conhecido, e forma de contabilizar itens
descartados — foram levadas ao desenvolvedor via pergunta interativa (`AskUserQuestion`), cada
uma com as opções mapeadas e uma recomendação. O desenvolvedor confirmou as 4 recomendações,
exatamente como estão registradas na seção "Arquitetura decidida" abaixo: descartar
`price_miles` string sem parse tolerante; mapeamento IATA local a `supplier-c.normalizer.ts` (não
compartilhado em `suppliers/types.ts`); passthrough do código cru para `airline_code`
desconhecido; e contabilização de itens descartados só via log, sem estender o contrato
`SupplierQuoteResult`.

## Arquitetura decidida

- **Cliente HTTP:** mesmo `SuppliersHttpModule` de DSM-1/DSM-2, sem nenhuma alteração — só que
  aqui a chamada é `httpService.post()` em vez de `get()`, já que o fornecedor C é `POST` com
  body JSON (`{ origin, destination, date }`, mesmos nomes de campo da query — o único dos três
  fornecedores que não precisa de tradução de nome de parâmetro).
- **Sem retry automático:** mesma política geral de A (DSM-1) — 500/timeout do fornecedor C não
  tenta de novo. O README não descreve rate limit para C (é o mais rápido e não tem `FAILURE_RATE`
  no comportamento padrão — só via `/admin/force-fail`), então não há motivo de negócio para uma
  exceção como a do 429 do fornecedor B.
- **Validação item a item dentro do normalizador, sem lançar exceção:** diferente de A/B (que só
  mapeiam campo a campo, confiando no shape), `normalizeSupplierC` valida cada item com um type
  guard (`isValidRawItem`) antes de mapear. Item inválido é descartado com `logger.warn`
  (motivo específico) e **não interrompe o loop** — é exatamente o requisito da AC4/AC5 da story
  (isolar o item ruim, resultado final vazio só quando *todos* vierem inválidos, nunca uma
  exceção). Isso é uma diferença arquitetural real em relação a A/B, não só troca de nomes de
  campo — é a razão de a DSM-3 ser "o cenário mais insidioso" citado na própria story.
- **Sem parse tolerante de `price_miles` string** (decisão confirmada pelo desenvolvedor): a AC
  exige descartar; a story permite explicitamente considerar parse tolerante desde que
  documentado. Decisão: `"17500"` é descartado, não convertido para `17500`. Motivo: não há como
  distinguir, só pela AC, um `price_miles` "string mas confiável" de um dado realmente corrompido
  nesse ponto (ex.: `"17.500"`, `"17500 milhas"`, `""`); descartar é a leitura mais segura do
  requisito "dados inválidos não cheguem ao usuário como se fossem uma cotação real" (descrição
  da story). Documentado em comentário no topo de `supplier-c.normalizer.ts` — não em
  `DECISIONS.md` (mesma decisão de não tocar nesse arquivo já tomada e mantida na DSM-2, é
  preenchimento pessoal do desenvolvedor para a entrevista).
- **Mapeamento IATA → nome da companhia** (decisão confirmada pelo desenvolvedor): tabela local
  `IATA_TO_CARRIER` (`LA`→`LATAM`, `G3`→`GOL`, `AD`→`AZUL`) dentro de
  `supplier-c.normalizer.ts`, usando o mesmo tipo `CarrierName` já compartilhado em
  `suppliers/types.ts` (não duplica o catálogo, só adiciona a tradução específica do formato cru
  do fornecedor C). Fica local ao normalizador de C, não em `suppliers/types.ts` — nenhum outro
  fornecedor usa código IATA hoje, e criar um módulo compartilhado para uma tabela de 3 entradas
  usada por um único arquivo seria antecipar reuso que não existe (YAGNI); se um quarto
  fornecedor aparecer com o mesmo formato, a extração vira uma refatoração pequena e localizada.
- **`airline_code` fora do catálogo conhecido (nem `LA`, `G3` nem `AD`)** (decisão confirmada pelo
  desenvolvedor): não descartado — mapeado como passthrough do próprio código cru
  (`carrier: item.airline_code`), com `logger.warn`. É a mesma política já usada por A/B para
  `carrier`/`cia` desconhecidos (DSM-1 `supplier-a.normalizer.ts:27-29`, DSM-2
  `supplier-b.normalizer.ts:41-43`): não perder uma cotação só porque a companhia é
  nova/não mapeada. Diferença aqui: como não há nome por extenso para mapear, o "passthrough" é
  o próprio código IATA cru, não um nome de companhia — aceitável porque o mock só gera
  `LA`/`G3`/`AD` hoje (`CARRIERS`, `mock-suppliers/src/index.js:33-37`); é tratamento puramente
  defensivo, documentado em comentário, mesmo padrão da decisão de moeda da DSM-2.
- **Contabilização/log de itens descartados** (decisão confirmada pelo desenvolvedor): só
  logging, sem estender o contrato compartilhado `SupplierQuoteResult`. `normalizeSupplierC` loga
  um `logger.warn` por item descartado (com o motivo específico: `price_miles` inválido, `fee`
  inválido, ou item nulo/malformado). O `SupplierCClient` calcula
  `discarded = raw.data.length - quotes.length` e inclui no log de resumo da chamada
  (`quotes=N discarded=M`), seguindo o mesmo formato de log de uma linha por chamada já usado em
  A/B. Decisão de não estender `SupplierQuoteResult` com um campo tipo `discardedCount`: mantém o
  contrato simétrico com A/B (que também descartam itens — moeda != BRL em B — sem expor
  contagem no contrato, só em log), e a AC desta story pede "contabilizado/logado", que o log de
  resumo já satisfaz sem mudar o formato consumido por DSM-4/5. Se o produto quiser mostrar essa
  métrica ao usuário/admin depois, é uma extensão aditiva pontual, não um retrabalho.
- **Guarda contra item `null`/não-objeto dentro do array**, além dos 3 modos de sujeira
  documentados no README: o mock só corrompe o item de índice 0 (`corrupt()`,
  `mock-suppliers/src/index.js:333-340`), nunca envia `null` como elemento do array. Ainda assim,
  `isValidRawItem` testa `item == null || typeof item !== 'object'` antes de acessar qualquer
  campo — sem essa guarda, um item `null` faria `item.price_miles` lançar `TypeError` **dentro do
  loop do normalizador**, o que quebraria a resposta inteira em vez de descartar só aquele item
  (o problema central que a AC4 pede para evitar). É tratamento defensivo além do que o mock atual
  gera, mas é exatamente o tipo de robustez que a story pede para o "cenário mais insidioso".

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/src/suppliers/supplier-c/supplier-c.types.ts` | Tipos do payload cru do fornecedor C. Campos tipados como `unknown` (não `number`/`string`), porque o próprio contrato de dados admite sujeira — o normalizador é quem valida o tipo real em runtime, o TypeScript não pode confiar no shape declarado aqui. |
| `api/src/suppliers/supplier-c/supplier-c.normalizer.ts` | Função pura `normalizeSupplierC(raw: SupplierCRawResponse, logger?: Logger): Quote[]`. Valida cada item com `isValidRawItem` (type guard local); item inválido é descartado com `logger.warn` e o loop continua. Item válido: `price_miles`→`miles`, `fee`→`taxesBrl`, `airline_code`→`carrier` via `IATA_TO_CARRIER` (passthrough do código cru + warning se não mapeado), tag `supplier: 'supplier-c'`. |
| `api/src/suppliers/supplier-c/supplier-c.client.ts` | `SupplierCClient` (`@Injectable`): método `getQuotes(query: SupplierQuoteQuery): Promise<SupplierQuoteResult>`. `POST /supplier-c/v2/quotes` com body `{ origin, destination, date }`, via `HttpService.post` (`firstValueFrom`). `try/catch` cobrindo chamada + normalização (mesmo padrão de A). Loga `quotes=N discarded=M latencyMs=Z` em sucesso. Nunca lança. |
| `api/src/suppliers/supplier-c/supplier-c.module.ts` | `SupplierCModule`: importa `SuppliersHttpModule`, provê e exporta `SupplierCClient` — mesmo shape do `SupplierAModule` (não precisa de `ConfigService`, não há orçamento de retry a calcular). |
| `api/src/suppliers/supplier-c/supplier-c.normalizer.spec.ts` | Testes unitários do normalizador (função pura, sem mock de rede) — cobre item limpo, os 3 modos de sujeira do README, item `null` no array, e "todos os itens inválidos". |
| `api/src/suppliers/supplier-c/supplier-c.client.spec.ts` | Testes unitários do client, mockando `HttpService` via DI, sem chamada de rede real. |

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `api/src/app.module.ts` | Importar e registrar `SupplierCModule` (ao lado de `SupplierAModule`/`SupplierBModule` já importados). |

`api/src/suppliers/types.ts` **não** é alterado — o contrato compartilhado (`Quote`,
`SupplierFailureReason`, `SupplierQuoteResult`) já cobre tudo que o fornecedor C precisa; não há
nova razão de falha (sem rate limit/retry para C) nem novo campo de contrato (contagem de
descarte fica só em log, ver "Arquitetura decidida"). `DECISIONS.md` **não** é alterado por esta
story, mesma decisão já registrada na DSM-2.

## Contratos de dados

```ts
// api/src/suppliers/supplier-c/supplier-c.types.ts

/**
 * Payload cru do Fornecedor C. Campos como `unknown`, não `number`/`string`: o próprio contrato
 * do fornecedor admite sujeira em runtime (README, "10% das respostas vêm sujas") — tipar como
 * `number` aqui seria mentir para o compilador. `normalizeSupplierC` é quem valida o tipo real.
 */
export interface SupplierCRawItem {
  price_miles: unknown;
  fee: unknown;
  airline_code: unknown;
}

export interface SupplierCRawResponse {
  data: SupplierCRawItem[];
}
```

```ts
// api/src/suppliers/supplier-c/supplier-c.normalizer.ts (assinatura)

export function normalizeSupplierC(
  raw: SupplierCRawResponse,
  logger?: Logger,
): Quote[];
```

**Validação por item** (`isValidRawItem`, type guard local — não exportado):
- `item` precisa ser um objeto não nulo (`item != null && typeof item === 'object'`) — cobre o
  caso defensivo de elemento `null`/`undefined`/primitivo dentro do array.
- `price_miles`: `typeof === 'number' && Number.isFinite(...) && > 0`. String (`"17500"`),
  `null`, `undefined`, `NaN`, `0` ou negativo → item inválido.
- `fee`: `typeof === 'number' && Number.isFinite(...) && >= 0`. `null`/string/negativo → item
  inválido. (`>= 0`, não `> 0`: taxa zero é uma cotação plausível, diferente de milhas zero.)
- `airline_code`: `typeof === 'string' && length > 0`. `null`/número/vazio → item inválido.
- Item que falha em qualquer uma das checagens acima é descartado (não entra no array de saída),
  com `logger.warn` indicando qual campo falhou.

**Mapeamento de companhia** (`IATA_TO_CARRIER`):
```ts
const IATA_TO_CARRIER: Readonly<Record<string, CarrierName>> = {
  LA: 'LATAM',
  G3: 'GOL',
  AD: 'AZUL',
};
```
- `airline_code` presente na tabela → nome por extenso.
- `airline_code` ausente da tabela (ex.: `"XX"`) → passthrough do código cru como `carrier`, com
  `logger.warn` — item **não** é descartado por isso (mesma política de A/B para companhia
  desconhecida).

**Classificação de erro** (dentro do `catch` do `SupplierCClient.getQuotes`) — idêntica à DSM-1
(sem retry, sem razão de falha nova):
- `err` é `AxiosError` com `err.code === 'ECONNABORTED'` → `reason: 'timeout'`.
- `err` é `AxiosError` com `err.response` presente → `reason: 'http_error'`,
  `httpStatus: err.response.status`.
- Qualquer outro caso (rede, erro de parsing/normalização não capturado pela validação item a
  item, exceção não-Axios) → `reason: 'unknown_error'`.
- `message` sempre `err instanceof Error ? err.message : String(err)`.

## Sequência de implementação

- [ ] Criar `api/src/suppliers/supplier-c/supplier-c.types.ts` (payload cru, campos `unknown`).
- [ ] Criar `api/src/suppliers/supplier-c/supplier-c.normalizer.ts`: `isValidRawItem` (guarda de
      objeto não nulo + 3 campos), `IATA_TO_CARRIER`, `normalizeSupplierC` com loop que descarta
      item inválido via `continue` (nunca lança), log por item descartado com motivo, comentário
      no topo explicando a decisão de não fazer parse tolerante de `price_miles` string.
- [ ] Criar `api/src/suppliers/supplier-c/supplier-c.client.ts`: `SupplierCClient.getQuotes`
      (`POST /supplier-c/v2/quotes`, body `{ origin, destination, date }` via `httpService.post`),
      `try/catch` cobrindo chamada + normalização, log de resumo (`quotes=N discarded=M
      latencyMs=Z`), classificação de erro igual à DSM-1 (`timeout`/`http_error`/`unknown_error`,
      usando `isAxiosError` de `axios`, não reimplementado).
- [ ] Criar `api/src/suppliers/supplier-c/supplier-c.module.ts` (`SupplierCModule`).
- [ ] Registrar `SupplierCModule` em `api/src/app.module.ts`.
- [ ] Escrever `supplier-c.normalizer.spec.ts` (função pura — ver "Plano de testes").
- [ ] Escrever `supplier-c.client.spec.ts` (mock de `HttpService.post` via DI).
- [ ] Rodar `npm run lint` e `npm test` em `api/` antes de considerar a story pronta.
- [ ] **Não** alterar `DECISIONS.md` nesta story (mesma decisão da DSM-2).
- [ ] Commit: `feat(DSM-3): client e normalizador do fornecedor C (payload sujo, status 200)`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| `data: []` (sujeira "empty") | `normalizeSupplierC` recebe array vazio, loop não executa, retorna `[]`; client devolve `{ ok: true, quotes: [] }` — resultado válido, não erro. |
| Item com `fee: null` (sujeira "null", sempre no índice 0) | `isValidRawItem` falha no campo `fee` (`typeof null !== 'number'`); item descartado com log, demais itens da mesma resposta mantidos. |
| Item com `price_miles` como string (sujeira "string", sempre no índice 0) | `isValidRawItem` falha no campo `price_miles`; item descartado, **sem** parse tolerante (decisão explícita, comentário no código) — demais itens mantidos. |
| Todos os itens de uma resposta inválidos | Resultado final `{ ok: true, quotes: [] }` — sucesso vazio, não falha; a busca segue com os outros fornecedores. O mock real só corrompe o item índice 0 por resposta, então esse cenário (100% inválido) é testado com payload sintético no normalizador, não reproduzível via `/admin/force-dirty` isoladamente quando há mais de 1 item. |
| Elemento `null`/primitivo dentro do array `data` (além dos 3 modos documentados) | Guarda defensiva em `isValidRawItem` (`item == null \|\| typeof item !== 'object'`) evita `TypeError` no meio do loop — item descartado como qualquer outro inválido, sem interromper a normalização dos demais. |
| `airline_code` fora de `LA`/`G3`/`AD` | Não descartado — passthrough do código cru como `carrier`, com log de warning. Puramente defensivo (mock só gera os 3 códigos hoje). |
| 500 do fornecedor C (via `/admin/force-fail/supplier-c`) | Capturado no `catch`, `reason: 'http_error'`, `httpStatus: 500`; sem retry (mesma política de A). |
| Timeout do fornecedor C (via `/admin/force-slow/supplier-c`, 8s) | Timeout nativo do axios (`ECONNABORTED`) → `reason: 'timeout'`; sem retry. |
| Erro de rede/parsing não coberto pela validação item a item (ex.: `data` ausente do payload) | Como a chamada + normalização inteiras rodam dentro do mesmo `try/catch` do client (mesmo padrão de A/DSM-1), qualquer exceção não prevista pela validação item a item ainda vira `reason: 'unknown_error'` em vez de exceção não tratada — rede de segurança adicional além da validação item a item. |
| Contabilização de itens descartados | `logger.warn` por item (motivo específico) + `logger.log` de resumo por chamada (`quotes=N discarded=M`) no client — sem estender o contrato `SupplierQuoteResult` (decisão registrada acima). |
| Duas instâncias da API em paralelo (RF2) | `SupplierCClient`/`normalizeSupplierC` são stateless — não afeta esta story. |

## Plano de testes

Todos os testes desta story são unitários (`*.spec.ts`, colocados junto do arquivo testado),
mockando `HttpService` via DI — sem chamada de rede real (`parametros-tecnicos.md`, item 11).

**`supplier-c.normalizer.spec.ts`**
- Mapeia corretamente um `data` com múltiplos itens limpos: `miles` (de `price_miles`),
  `taxesBrl` (de `fee`), `carrier` (de `airline_code` via `IATA_TO_CARRIER` — testar os 3 códigos
  `LA`/`G3`/`AD` → `LATAM`/`GOL`/`AZUL`), `supplier: 'supplier-c'`.
- `data: []` → retorna `[]` (não lança, não é erro).
- Item com `fee: null` é descartado, mantendo os demais itens válidos da mesma resposta.
- Item com `price_miles` como string (`"17500"`) é descartado **sem** ser convertido para
  número — o teste verifica que o item não aparece no resultado, não que ele aparece com o valor
  parseado.
- Item com `price_miles` zero/negativo é descartado (defensivo).
- Item `null` dentro do array `data` é descartado sem lançar exceção.
- Todos os itens de uma resposta inválidos (payload sintético com N itens, todos com algum campo
  ruim) → retorna `[]`.
- Item com `airline_code` fora do catálogo conhecido (ex.: `"XX"`) → mapeado com o código cru como
  `carrier`, não descartado.

**`supplier-c.client.spec.ts`**
- **Body correto:** dado `origin`/`destination`/`date` válidos, verifica que `httpService.post`
  foi chamado com `/supplier-c/v2/quotes` e body `{ origin, destination, date }` — exatamente os
  nomes exigidos pela AC.
- **Sucesso 200, payload limpo:** client devolve `{ ok: true, supplier: 'supplier-c', quotes:
  [...] }` com os itens normalizados.
- **Sucesso 200, `data: []`:** client devolve `{ ok: true, quotes: [] }`.
- **Sucesso 200, item sujo (`fee: null`) misturado com item válido:** client devolve `{ ok: true,
  quotes: [...] }` só com o item válido — confirma que a sujeira de um item não derruba a resposta
  nem os itens bons ao lado.
- **Sucesso 200, todos os itens sujos:** client devolve `{ ok: true, quotes: [] }` — não é
  `ok: false`, é sucesso vazio (o critério de aceite mais específico desta story).
- **Erro 500:** client devolve `{ ok: false, failure: { reason: 'http_error', httpStatus: 500,
  message } }`, sem lançar.
- **Timeout:** client devolve `{ ok: false, failure: { reason: 'timeout', ... } }`, sem lançar.
- **Erro desconhecido/rede:** `{ ok: false, failure: { reason: 'unknown_error', ... } }`.
- Todos os cenários de falha: o teste garante explicitamente que a Promise **resolve** (não
  rejeita) — mesmo critério mais importante já usado em DSM-1/DSM-2.

Fora do escopo de teste automatizado desta story (fica para DSM-4): agregação com outros
fornecedores, corrida contra o teto global de 6s, ordenação final.
