# Review — DSM-11 — Reservar uma cotação direto na lista de resultados da busca

## Veredito geral

**Aprovado.** A implementação segue a spec com fidelidade alta — inclusive nos pontos mais
sensíveis (derivação de `quoteId`, máquina de estados do hook, tratamento de idempotência via
composição com o contrato do backend, separação hook/i18n). Não encontrei achados bloqueantes.
Lint, typecheck e toda a suíte de testes passam. Registro apenas achados cosméticos/informativos
abaixo, nenhum impede a entrega.

Observação de escopo: o commit `653bc46` mistura DSM-10 e DSM-11 (arquivos entrelaçados,
conforme já avisado no prompt). Esta revisão cobre exclusivamente os critérios de aceite da
DSM-11 — `web/lib/orders/*`, `web/hooks/use-order-reservation.ts`,
`web/components/search/QuoteCard.tsx` e as chaves `orders.*` de `pt-BR.json`. Não reavaliei os
achados de estilo já cobertos por `claude/specs/DSM-10/review.md`.

## Critérios de aceite

| # | Critério | Status |
|---|---|---|
| 1 | Ação "Reservar" no próprio card, sem navegação | **Atendido** — botão dentro do `<li>` de `QuoteCard.tsx:53-61`, sem `next/navigation`. `SearchResultsPanel.tsx` confirma que `QuoteList`/`QuoteCard` renderizam tanto em `success` quanto em `partial` (linhas 24-25 e 27-37). |
| 2 | Formulário inline pede nome + CPF, associado visualmente ao card | **Atendido** — mesmo `<li>` expande (`QuoteCard.tsx:70-142`), sem modal, campos `Nome completo`/`CPF` com `id`/`htmlFor` únicos por `quoteId`. |
| 3 | Cliente gera `idempotencyKey` e chama `POST /orders` com o shape exato | **Atendido** — `use-order-reservation.ts:105-118` monta `{ quoteId, idempotencyKey, passenger: { name, document }, quote }` exatamente como especificado; `quoteId` via `buildQuoteId` (`carrier-miles-taxesBrl`); `quote` é a própria `SearchResponseQuote` do card (shape idêntico ao esperado por `CreateOrderInput.quote`). |
| 4 | Nome/CPF vazios/incompletos não disparam a chamada, validação visível | **Atendido e testado** — `confirm()` valida localmente (`use-order-reservation.ts:90-103`) e retorna antes de `createOrder` se houver `fieldErrors`; coberto em `use-order-reservation.spec.ts:72-97` e `QuoteCard.spec.tsx:74-84`. |
| 5 | Sucesso → card mostra "reservado" + id, ação de reservar some | **Atendido e testado** — bloco `status === 'reserved'` (`QuoteCard.tsx:63-68`) esconde por completo botão/formulário; `QuoteCard.spec.tsx:86-110`. |
| 6 | Reenvio com a mesma `idempotencyKey` não gera pedido duplicado nem erro visível | **Atendido por composição, coerente com o contrato real do backend** — confirmei em `api/src/infrastructure/orders/orders.repository.ts:23-71` que `createOrGetExisting` sempre devolve `201`/o mesmo registro em caso de colisão de `idempotencyKey` (via `catch` de `unique constraint` + `findUnique`), e o hook trata qualquer sucesso de forma idêntica, sem branch de "já existia" (`use-order-reservation.ts:119-121`). O `idempotencyKeyRef` só é reaproveitado entre retries e só é zerado em `cancel()` (`use-order-reservation.ts:41-47`), conforme decisão nº4 da spec. |
| 7 | Erro de `POST /orders` → mensagem associada ao card, dados mantidos, resto da lista intacto | **Atendido e testado** — estado 100% local ao hook de cada `QuoteCard` (nenhum estado de `useSearch`/`SearchResultsPanel` é tocado); `name`/`document` nunca são limpos em nenhum caminho de erro (`use-order-reservation.ts:122-153`); testado em `use-order-reservation.spec.ts:166-197` e `QuoteCard.spec.tsx:112-130`. |

## Achados

Nenhum achado bloqueante. As quatro observações de baixa severidade/cosméticas abaixo foram
corrigidas após a revisão (commit seguinte a este `review.md`):

1. **Resolvido — risco de corrida em duplo clique físico não tinha teste de regressão dedicado.**
   `web/hooks/use-order-reservation.ts:85-88` — o guard de `confirm()` (`state.status !== 'editing' && state.status !== 'error'`) lê `state` do closure da última renderização. Dois cliques físicos disparados antes do primeiro `setState`/re-render "commitar" veem ambos `status === 'editing'` e ambos chamam `createOrder` (com a mesma `idempotencyKey`, já que o `ref` é setado de forma síncrona antes do primeiro `await`). Isso já estava **explicitamente aceito na spec** ("Casos de borda e riscos tratados" — "mesmo que ocorresse uma corrida, a mesma `idempotencyKey` garante no máximo um pedido real no backend"). Adicionado o teste `use-order-reservation.spec.ts` "duas chamadas de confirm() na mesma janela de evento (duplo clique físico)": invoca `confirm()` duas vezes no mesmo `act()` e confirma que as duas chamadas a `createOrder` reusam a mesma `idempotencyKey`.

2. **Resolvido — `errorCode` não era limpo explicitamente ao sair dos estados `'error'`/tentativa anterior via `confirm()`.** `web/hooks/use-order-reservation.ts:111` agora zera `errorCode: undefined` junto com `fieldErrors: {}` na transição para `'submitting'`.

3. **Resolvido — `name` enviado ao backend não era trimado, embora a validação local usasse `.trim()` para decidir se estava vazio.** `confirm()` agora envia `state.name.trim()` em `passenger.name`. Adicionado o teste "confirm() trima espaços do nome antes de enviar" em `use-order-reservation.spec.ts`.

4. **Resolvido — acessibilidade: sem `aria-invalid`/`aria-describedby` ligando os campos aos erros inline, nem `inputMode="numeric"` no campo de CPF.** `QuoteCard.tsx` agora define `aria-invalid`/`aria-describedby` (apontando para o `id` do parágrafo de erro) nos dois campos, e `inputMode="numeric"` no campo de CPF.

Nenhum desses quatro pontos comprometia os critérios de aceite ou introduzia um bug funcional
observável pelo usuário dentro do escopo da story — foram corrigidos por higiene/qualidade.

## Conferências adicionais realizadas

- **Algoritmo de CPF** (`web/lib/orders/cpf.ts`) comparado linha a linha com
  `api/src/presentation/orders/dto/validators/is-valid-cpf.validator.ts` — idêntico (mesmo padrão
  de regex, mesmo cálculo de dígito verificador, mesma rejeição de sequência repetida).
- **Mapeamento de códigos de erro** (`web/lib/orders/error-messages.ts`,
  `use-order-reservation.ts:124-141`) comparado com
  `api/src/common/validation/constraint-error-codes.ts` e
  `validation-exception-factory.ts` — os códigos `FIELD_REQUIRED`/`INVALID_CPF`/
  `INVALID_QUOTE_VALUE` e os nomes de campo (`passenger.name`, `passenger.document`) batem
  exatamente com o que o backend realmente produz para os DTOs `CreateOrderRequestDto`/
  `PassengerDto`/`QuoteDto`.
- **Decisão nº1 (`quoteId` opaco derivado do conteúdo)** — confirmado que não é reaproveitado como
  `key` de `QuoteList.tsx` (arquivo não foi alterado por esta story, key já usa `index` desde o
  commit `cbc5250`), consistente com o que a spec registra.
- **Chaves de tradução em `pt-BR.json`** — conferidas contra o bloco "Contratos de dados" da spec,
  idênticas.
- **Tipos (`web/lib/orders/types.ts`)** — conferidos contra o contrato declarado na spec, idênticos
  campo a campo.

## Testes

- `cd web && npm run lint` → **passou** (sem erros/avisos).
- `cd web && npx tsc --noEmit -p tsconfig.json` → **passou** (sem erros de tipo).
- `cd web && npm test -- --run` → **passou** — 15 arquivos de teste, 81 testes, todos verdes
  (inclui `use-order-reservation.spec.ts`, `QuoteCard.spec.tsx`, `quote-id.spec.ts`, `cpf.spec.ts`,
  `api.spec.ts`, `error-messages.spec.ts`, `field-error-messages.spec.ts`, todos criados/estendidos
  por esta story, conforme o "Plano de testes" da spec).
- Validação manual (docker/API real) descrita na spec **não foi executada nesta revisão** — não
  havia ambiente disponível na sessão de review; a cobertura automatizada (unitária + integração de
  componente com `createOrder` mockado) é suficiente para validar o comportamento contratual, mas
  fica como lacuna formal do checklist de "Sequência de implementação" da spec, que pede
  explicitamente esse passo manual com `docker compose up -d`.
- Não há gaps de cobertura relevantes nos critérios de aceite: os sete ACs têm teste automatizado
  direto (unitário no hook e/ou de componente no `QuoteCard`), como listado na tabela acima.

## Veredito

**Aprovado.** 0 achados bloqueantes; 4 achados cosméticos/informativos, todos corrigidos após a
revisão (ver "Achados" acima). Testes reconferidos após as correções: 83 testes, 15 arquivos,
lint e `tsc --noEmit` limpos.
