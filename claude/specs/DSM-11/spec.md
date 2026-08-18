# DSM-11 — Reservar uma cotação direto na lista de resultados da busca

## Contexto

User story: `claude/specs/DSM-11/user-story.md`.

Hoje `web/` (DSM-9/DSM-10, parte ainda não commitada) já entrega a tela de busca completa —
`SearchForm` → `useSearch` → `SearchResultsPanel` → `QuoteList` → `QuoteCard` (um `<li>` por
cotação, já com destaque de "melhor oferta", `web/components/search/QuoteCard.tsx`) — mas nenhum
caminho da UI chama `POST /orders`. O backend (`POST /orders`, DSM-6/7/8, já commitado como
contrato fechado) espera:

```
POST /orders
{ quoteId, idempotencyKey, passenger: { name, document }, quote: { miles, taxesBrl, carrier } }
```

e responde 201 com `{ id, status: 'PENDING'|'CONFIRMED', quoteId, quote, passenger, createdAt }`,
ou 400 no envelope `{ error: { code: 'VALIDATION_ERROR', message, fields: [{ field, code,
message }] } }` (`AllExceptionsFilter` + `validationExceptionFactory`,
`api/src/common/validation/`). A própria spec da DSM-7 (Revisão 2, snapshot de cotação) já
registrou o achado que fecha a lacuna mais importante desta story: **`quoteId` nunca é validado
contra uma busca real** — o backend só checa presença/formato (`@IsString`/`@IsNotEmpty`) e persiste
os dados de verdade da cotação via o campo `quote` (snapshot completo), não via `quoteId`. Isso é o
que permite a decisão abaixo sobre como o front produz um `quoteId`.

`SearchResponseQuote` (`web/lib/search/api.ts`, contrato de `POST /search`, DSM-5) continua sendo
só `{ miles, taxesBrl, carrier }` — sem nenhum identificador — e não muda nesta story.

**Decisões tomadas pelo desenvolvedor (via coordenador — `AskUserQuestion` não estava disponível
nesta sessão do agente, os pontos abaixo foram escalados antes de qualquer linha desta spec ser
escrita):**

1. **`quoteId`** — string opaca derivada do conteúdo da cotação (`carrier`+`miles`+`taxesBrl`),
   mesmo padrão já usado na key de `QuoteList`. Sem mudança em `SearchUiState`/`types.ts`/
   `derive-ui-state.ts` (DSM-9, já commitados) — não precisa de nenhum campo de estado novo vindo
   da busca.
2. **UI de captura de dados do passageiro** — expandir o próprio `QuoteCard` inline (accordion),
   sem modal.
3. **Estado de reserva por cotação** — hook próprio por card (`useOrderReservation`), instanciado
   dentro de cada `QuoteCard`, sem estado centralizado na `SearchPage`/`useSearch`.
4. **`idempotencyKey`** — gerada uma única vez ao primeiro clique em "Confirmar reserva",
   reutilizada em qualquer reenvio subsequente (inclusive "Tentar novamente" após erro) até a
   reserva ter sucesso.
5. **Validação de CPF no cliente** — replica o algoritmo completo do backend (formato 11 dígitos +
   dígito verificador módulo 11 + rejeição de sequência repetida, `IsValidCpf`,
   `api/src/presentation/orders/dto/validators/is-valid-cpf.validator.ts`), duplicando a lógica
   entre `api/` e `web/` deliberadamente, para dar feedback imediato sem round-trip.
6. **Tratamento de erro 400 do backend** — mapear o `code` de cada campo (`INVALID_CPF`,
   `FIELD_REQUIRED`, `INVALID_QUOTE_VALUE`) para uma mensagem específica no card, não uma mensagem
   genérica única.

## Arquitetura decidida

- **`buildQuoteId` — função pura, `web/lib/orders/quote-id.ts`.** `` `${carrier}-${miles}-${taxesBrl}` ``,
  chamada uma vez por `QuoteCard` (via `useMemo` dentro do hook). Não é global/session-unique — duas
  cotações com exatamente o mesmo `carrier`/`miles`/`taxesBrl` produzem o mesmo `quoteId` (risco
  aceito na decisão nº1, sem efeito real porque o backend nunca usa `quoteId` para lookup). **Não
  reaproveitado como `key` do `<li>` em `QuoteList.tsx`** — a key ali já inclui `index` para evitar
  colisão de reconciliação do React entre itens idênticos em posições diferentes (commit
  `cbc5250`); são dois usos diferentes de "identificador de cotação" com requisitos diferentes
  (React key precisa ser única na lista renderizada; `quoteId` de negócio não precisa). `QuoteList.tsx`
  não é alterado por esta story.
- **Hook próprio por card (decisão nº3), sem prop drilling.** `useOrderReservation(quote:
  SearchResponseQuote)` é chamado dentro do próprio `QuoteCard` — `QuoteList`/`SearchResultsPanel`/
  `SearchPage`/`useSearch` não mudam. Cada card tem seu próprio ciclo de vida de reserva,
  desmontado/remontado junto com a lista quando uma nova busca substitui o resultado anterior
  (mesmo comportamento "sem stale" já decidido pela DSM-9) — sem necessidade de um id
  globalmente estável entre buscas diferentes.
- **Máquina de estados do hook, não uma union discriminada por `switch` (diferente de
  `SearchUiState`).** O formulário de nome/CPF precisa sobreviver a transições
  `editing → submitting → error → editing…`, então o estado é um objeto único com um campo
  `status` mais os dados do formulário sempre presentes, em vez de uma union onde cada variante
  carrega campos diferentes — evita ter que "resgatar" `name`/`document` de uma variante antiga ao
  transitar para outra.

  ```ts
  // web/lib/orders/types.ts
  export type OrderReservationStatus = 'idle' | 'editing' | 'submitting' | 'error' | 'reserved';

  export interface OrderFieldErrors {
    name?: 'required';
    document?: 'required' | 'invalidCpf';
  }

  export interface OrderReservationState {
    status: OrderReservationStatus;
    name: string;
    document: string;
    fieldErrors: OrderFieldErrors;
    errorCode?: string;   // só relevante quando status === 'error' — código para a UI traduzir
    orderId?: string;     // só relevante quando status === 'reserved'
  }
  ```

- **`idempotencyKey` gerada lazy, guardada em `useRef` (não em `state`) — decisão nº4.**
  `crypto.randomUUID()` (nativo, Node ≥ 20/browsers modernos, sem dependência nova) é chamado
  dentro de `confirm()` só na primeira vez que o ref está `null`; chamadas seguintes de `confirm()`
  (retry manual após erro) reusam o mesmo valor. Fica fora de `state` de propósito — não deve
  disparar re-render nem ser exposta na UI. **Reset do ref para `null` só acontece em `cancel()`**
  (usuário fecha o formulário sem concluir — nesse ponto nada foi enviado ao backend ainda com
  sucesso, então uma futura reabertura é, por definição, uma nova tentativa de reserva; default
  deste agente, não escalado, mesmo espírito dos "pontos não escalados" já registrados na DSM-9).
- **Duplicidade (AC6) é resolvida pela composição de duas decisões já tomadas, sem código
  especial de "detectar duplicata" no frontend:** (a) a mesma `idempotencyKey` é reenviada em
  qualquer retry (decisão nº4); (b) o backend (DSM-7, "Arquitetura decidida" — HTTP status sempre
  201, mesmo corpo, tanto para criação nova quanto para reenvio da mesma chave) devolve sempre 201
  com o mesmo `order.id`. O `.then()` de `confirm()` trata **qualquer** 201 como sucesso
  (`status: 'reserved', orderId: order.id`), sem branch condicional para "já existia" — não há
  necessidade de o front distinguir os dois casos, o contrato do backend já os torna
  indistinguíveis por desenho.
- **Erros de `POST /orders` — dois destinos diferentes na UI, conforme o `field` retornado
  (decisão nº6):** `fields` com `field === 'passenger.name'` ou `field === 'passenger.document'`
  são absorvidos como erro **inline do campo** (`fieldErrors`, mesmo padrão visual de
  `SearchForm`) e o estado volta para `'editing'`, não `'error'` — mesmo raciocínio da AC4 (erro de
  validação de campo não é uma falha "de card", é uma correção que o usuário pode fazer ali mesmo.
  Isso cobre principalmente o caso defensivo de o algoritmo de CPF do cliente divergir do backend).
  Qualquer outro erro (rede, 5xx, `fields` com outro campo — ex. um bug hipotético em
  `quote`/`quoteId`, que o usuário não consegue corrigir digitando) vira o estado `'error'` — banner
  no card com mensagem mapeada a partir de um `errorCode`, e o formulário continua visível com
  `name`/`document` preenchidos (AC7).
- **Camada de tradução do erro fica fora do hook.** `useOrderReservation` guarda só `errorCode`
  (string), nunca uma mensagem já traduzida — mesma separação hook/i18n que `useSearch` já usa
  (o hook não importa `next-intl`). `web/lib/orders/error-messages.ts` (função pura,
  `resolveOrderErrorMessageKey(code) → chave de tradução`) e `web/lib/orders/field-error-messages.ts`
  (`resolveFieldErrorMessageKey(field, code) → chave`) ficam fora do hook; `QuoteCard.tsx` (que já
  usa `useTranslations`) é quem chama essas funções e resolve a chave para texto.
- **Cliente HTTP de `POST /orders` no mesmo molde de `web/lib/search/api.ts` (`searchQuotes`),
  mas com um tipo de erro mais rico** — `web/lib/orders/api.ts` exporta `createOrder` e
  `CreateOrderError`, que carrega `code`/`fields` extraídos do envelope de erro (`searchQuotes`
  não precisava disso porque a DSM-9 só distingue "deu certo" de "deu erro", sem inspecionar o
  corpo do erro). Falha de rede (`fetch` rejeita antes de qualquer resposta) propaga o erro
  original, sem encapsular — o hook decide `errorCode: 'NETWORK_ERROR'` só nesse caminho
  (`catch` que recebe algo que não é `CreateOrderError`).
- **Validação de CPF client-side duplicada deliberadamente (decisão nº5).** `web/lib/orders/cpf.ts`
  exporta `isValidCpf(value: string): boolean`, réplica funcional (mesmos casos de borda: 11
  dígitos, dígito verificador módulo 11, sequência repetida rejeitada) de
  `api/src/presentation/orders/dto/validators/is-valid-cpf.validator.ts` — função pura, sem
  `class-validator`, sem decorator (o `web/` não usa DTOs de classe). Testada com os mesmos vetores
  de teste do validador do backend (inclusive o CPF de exemplo já usado na spec da DSM-7,
  `52998224725`).
- **Sem máscara no campo de CPF (mesma convenção da DSM-7 para o backend), mas com strip
  automático de não-dígitos na digitação** — decisão de baixo impacto deste agente, não escalada:
  `setDocument` remove qualquer caractere não numérico do valor antes de guardar no estado, então
  colar um CPF formatado (`529.982.247-25`) funciona sem exigir que o usuário edite manualmente; o
  valor guardado e enviado ao backend é sempre só dígitos, sem mudar o contrato.
- **IDs de DOM únicos por card.** Como `QuoteCard` pode renderizar N vezes simultaneamente na
  mesma tela (uma lista inteira de cotações), os `id`/`htmlFor` dos campos do formulário usam o
  `quoteId` do próprio card (`` `passenger-name-${quoteId}` ``, `` `passenger-document-${quoteId}` ``)
  para não colidir com os de outros cards abertos ao mesmo tempo — por isso `quoteId` é exposto no
  retorno do hook, não só usado internamente.

## Componentes

### Novos arquivos — lógica/dados (sem JSX, sem `'use client'`)

| Arquivo | Responsabilidade |
|---|---|
| `web/lib/orders/types.ts` | `OrderReservationStatus`, `OrderFieldErrors`, `OrderReservationState` (ver "Arquitetura decidida"); `CreateOrderInput` e `OrderResponseBody` (espelham `CreateOrderRequestDto`/`OrderResponseDto` da DSM-7); `OrderErrorField` (`{ field: string; code: string; message: string }`, espelha `ValidationErrorField`). |
| `web/lib/orders/quote-id.ts` | `buildQuoteId(quote: SearchResponseQuote): string` — `` `${carrier}-${miles}-${taxesBrl}` ``. |
| `web/lib/orders/cpf.ts` | `isValidCpf(value: string): boolean` — réplica do algoritmo do backend, ver "Arquitetura decidida". |
| `web/lib/orders/api.ts` | `createOrder(input: CreateOrderInput): Promise<OrderResponseBody>` — `fetch(POST \`${NEXT_PUBLIC_API_URL}/orders\`)`; `!response.ok` → parseia o envelope de erro (`{ error: { code, message, fields? } }`, tolera corpo não-JSON) e lança `CreateOrderError`; `fetch` rejeitar → propaga como está, sem encapsular. Único arquivo que sabe a URL de `/orders`. |
| `web/lib/orders/error-messages.ts` | `resolveOrderErrorMessageKey(code: string \| undefined): string` — mapa `INVALID_CPF`/`FIELD_REQUIRED`/`INVALID_QUOTE_VALUE`/`NETWORK_ERROR` → chave de `orders.errors.*`; qualquer código fora do mapa (inclusive `undefined`, `'INTERNAL_ERROR'`, `'VALIDATION_ERROR'` genérico sem campo reconhecido) cai em `orders.errors.generic`. |
| `web/lib/orders/field-error-messages.ts` | `resolveFieldErrorMessageKey(field: 'name' \| 'document', code: 'required' \| 'invalidCpf'): string` → chave de `orders.form.errors.*`. |

### Novo arquivo — hook

| Arquivo | Responsabilidade |
|---|---|
| `web/hooks/use-order-reservation.ts` | `useOrderReservation(quote: SearchResponseQuote): UseOrderReservationResult`. Estado inicial `{ status: 'idle', name: '', document: '', fieldErrors: {} }`. `quoteId` calculado via `useMemo(() => buildQuoteId(quote), [quote])`. `idempotencyKeyRef` via `useRef<string \| null>(null)`. Expõe `{ quoteId, state, openForm, cancel, setName, setDocument, confirm }` — ver "Contratos de dados" para o fluxo completo de `confirm()`. |

### Arquivo alterado — apresentação (`'use client'`)

| Arquivo | Alteração |
|---|---|
| `web/components/search/QuoteCard.tsx` | Continua recebendo `{ quote, isBestOffer }` (sem mudança de props — o hook é chamado internamente). Corpo do `<li>` ganha, abaixo dos dados já existentes (milhas/companhia/taxas): se `state.status === 'idle'` → botão "Reservar" (`onClick={openForm}`); se `state.status === 'reserved'` → bloco "Reservado" com `orderId`, **sem** nenhum botão de ação (AC5); qualquer outro status (`'editing' \| 'submitting' \| 'error'`) → `<form>` inline com campos "Nome completo"/"CPF" controlados (`state.name`/`state.document`, `onChange` chama `setName`/`setDocument`), erro inline por campo via `fieldErrors` + `resolveFieldErrorMessageKey`, banner de erro (`state.status === 'error'`) via `resolveOrderErrorMessageKey(state.errorCode)`, botão de submit (`type="submit"`, `disabled` quando `submitting`, texto `form.confirm`/`form.confirming`/`form.retry` conforme o status) e botão "Cancelar" (`onClick={cancel}`, oculto/desabilitado durante `submitting`). `<form onSubmit>` chama `event.preventDefault()` e `confirm()` — nunca deixa o navegador fazer submit nativo. |

Nenhum outro componente (`QuoteList`, `SearchResultsPanel`, `SearchPage`, `SearchForm`) é alterado
por esta story. Nenhum arquivo de `api/` é alterado — contrato de `POST /orders` (DSM-7) consumido
como está.

### Arquivo alterado — i18n

| Arquivo | Alteração |
|---|---|
| `web/messages/pt-BR.json` | Adiciona a chave raiz `orders` (ver "Contratos de dados"), ao lado da já existente `search`. |

## Contratos de dados

```ts
// web/lib/orders/types.ts
export type OrderReservationStatus = 'idle' | 'editing' | 'submitting' | 'error' | 'reserved';

export interface OrderFieldErrors {
  name?: 'required';
  document?: 'required' | 'invalidCpf';
}

export interface OrderReservationState {
  status: OrderReservationStatus;
  name: string;
  document: string;
  fieldErrors: OrderFieldErrors;
  errorCode?: string;
  orderId?: string;
}

export interface OrderErrorField {
  field: string;
  code: string;
  message: string;
}

export interface CreateOrderInput {
  quoteId: string;
  idempotencyKey: string;
  passenger: { name: string; document: string };
  quote: { miles: number; taxesBrl: number; carrier: string };
}

export interface OrderResponseBody {
  id: string;
  status: 'PENDING' | 'CONFIRMED';
  quoteId: string;
  quote: { miles: number; taxesBrl: number; carrier: string };
  passenger: { name: string; document: string };
  createdAt: string;
}
```

```ts
// web/lib/orders/quote-id.ts
export function buildQuoteId(quote: SearchResponseQuote): string {
  return `${quote.carrier}-${quote.miles}-${quote.taxesBrl}`;
}
```

```ts
// web/lib/orders/cpf.ts
export function isValidCpf(value: string): boolean;
// 11 dígitos numéricos, rejeita sequência repetida (00000000000..99999999999), valida os dois
// dígitos verificadores via módulo 11 — mesmo algoritmo de
// api/src/presentation/orders/dto/validators/is-valid-cpf.validator.ts.
```

```ts
// web/lib/orders/api.ts
export class CreateOrderError extends Error {
  code: string;
  fields?: OrderErrorField[];
  constructor(code: string, message: string, fields?: OrderErrorField[]);
}

export async function createOrder(input: CreateOrderInput): Promise<OrderResponseBody>;
// POST `${process.env.NEXT_PUBLIC_API_URL}/orders`, body JSON = input.
// !response.ok → tenta `response.json()` (tolera falha de parse, ex. corpo vazio/HTML de proxy);
//   monta CreateOrderError(body?.error?.code ?? 'UNKNOWN_ERROR', body?.error?.message ?? `POST
//   /orders respondeu ${response.status}`, body?.error?.fields).
// fetch rejeitar (erro de rede) → propaga a exceção original, sem encapsular.
```

```ts
// web/lib/orders/error-messages.ts
export function resolveOrderErrorMessageKey(code: string | undefined): string;
// INVALID_CPF → 'orders.errors.invalidCpf'
// FIELD_REQUIRED → 'orders.errors.fieldRequired'
// INVALID_QUOTE_VALUE → 'orders.errors.invalidQuote'
// NETWORK_ERROR → 'orders.errors.network'
// qualquer outro valor (inclusive undefined) → 'orders.errors.generic'
```

```ts
// web/lib/orders/field-error-messages.ts
export function resolveFieldErrorMessageKey(
  field: 'name' | 'document',
  code: 'required' | 'invalidCpf',
): string;
// field === 'name' → 'orders.form.errors.nameRequired'
// field === 'document', code === 'required' → 'orders.form.errors.documentRequired'
// field === 'document', code === 'invalidCpf' → 'orders.form.errors.documentInvalid'
```

```ts
// web/hooks/use-order-reservation.ts
export interface UseOrderReservationResult {
  quoteId: string;
  state: OrderReservationState;
  openForm: () => void;
  cancel: () => void;
  setName: (name: string) => void;
  setDocument: (document: string) => void;
  confirm: () => void;
}

export function useOrderReservation(quote: SearchResponseQuote): UseOrderReservationResult;
```

Fluxo de `confirm()` (única função com lógica não trivial do hook):

1. Ignora a chamada se `state.status` não for `'editing'` nem `'error'` (guarda contra chamada fora
   de hora; o botão de submit já fica `disabled` durante `'submitting'`, isto é defesa adicional).
2. Valida localmente: `name` vazio/só espaço → `fieldErrors.name = 'required'`; `document` vazio →
   `fieldErrors.document = 'required'`; `document` não vazio mas `!isValidCpf(document)` →
   `fieldErrors.document = 'invalidCpf'`. Se houver qualquer `fieldErrors`, seta
   `status: 'editing'` com esses erros e **retorna sem chamar `createOrder`** (cumpre AC4
   literalmente).
3. Se `idempotencyKeyRef.current` é `null`, gera `crypto.randomUUID()` e guarda no ref (decisão
   nº4 — só acontece na primeira tentativa; retries reusam o mesmo valor).
4. Seta `status: 'submitting'`, `fieldErrors: {}`.
5. Chama `createOrder({ quoteId, idempotencyKey: idempotencyKeyRef.current, passenger: { name,
   document }, quote })`.
   - Sucesso → `status: 'reserved', orderId: order.id`. Qualquer 201 é tratado como sucesso, sem
     distinguir "criado agora" de "já existia" (ver "Arquitetura decidida").
   - Falha, `error instanceof CreateOrderError`:
     - Se `error.fields` contém uma entrada com `field === 'passenger.name'` ou
       `field === 'passenger.document'`: volta para `status: 'editing'` com
       `fieldErrors.name`/`fieldErrors.document` preenchidos a partir do `code` daquela entrada
       (`FIELD_REQUIRED` → `'required'`, `INVALID_CPF` → `'invalidCpf'`).
     - Senão: `status: 'error'`, `errorCode: error.fields?.[0]?.code ?? error.code`.
   - Falha, qualquer outro erro (rede): `status: 'error'`, `errorCode: 'NETWORK_ERROR'`.
   - Em todos os casos de falha, `name`/`document` **não são limpos** — permanecem como estavam
     (AC7).

`openForm()`: se `status === 'idle'`, seta `status: 'editing'` (demais campos já vazios/default).
Ignorado em qualquer outro status.

`cancel()`: ignorado se `status === 'submitting'`. Caso contrário, zera `idempotencyKeyRef.current`
e volta ao estado inicial (`{ status: 'idle', name: '', document: '', fieldErrors: {} }`).

`setName(name)`/`setDocument(document)`: só têm efeito quando `status` é `'editing'` ou `'error'`
(campos ficam controlados/travados durante `'submitting'`). `setDocument` remove caracteres
não-numéricos do valor recebido antes de guardar. Ambos limpam o `fieldErrors` daquele campo
específico ao digitar (mesmo padrão já usado em `SearchForm.tsx`); se `status === 'error'`, editar
qualquer campo também limpa `errorCode` e volta `status` para `'editing'` (o usuário está corrigindo
algo, o banner de erro anterior não é mais relevante até o próximo `confirm()`).

Exemplo de corpo enviado por `createOrder` (gerado a partir de uma cotação
`{ miles: 18500, taxesBrl: 38.50, carrier: 'GOL' }`, após `openForm` → preencher → `confirm`):

```json
{
  "quoteId": "GOL-18500-38.5",
  "idempotencyKey": "3f7e9b1a-2c4d-4e5f-8a6b-1d2e3f4a5b6c",
  "passenger": { "name": "Maria da Silva", "document": "52998224725" },
  "quote": { "miles": 18500, "taxesBrl": 38.5, "carrier": "GOL" }
}
```

Exemplo de chaves novas em `web/messages/pt-BR.json` (adicionadas ao lado de `search`, que não
muda):

```json
{
  "orders": {
    "reserveButton": "Reservar",
    "form": {
      "name": "Nome completo",
      "document": "CPF",
      "confirm": "Confirmar reserva",
      "confirming": "Reservando...",
      "retry": "Tentar novamente",
      "cancel": "Cancelar",
      "errors": {
        "nameRequired": "Informe o nome do passageiro.",
        "documentRequired": "Informe o CPF do passageiro.",
        "documentInvalid": "Informe um CPF válido."
      }
    },
    "states": {
      "reserved": "Reservado",
      "reservedOrderId": "Pedido {orderId}"
    },
    "errors": {
      "invalidCpf": "CPF inválido.",
      "fieldRequired": "Preencha os dados corretamente.",
      "invalidQuote": "Não foi possível reservar esta cotação. Atualize a busca e tente novamente.",
      "network": "Não foi possível conectar. Verifique sua conexão e tente novamente.",
      "generic": "Não foi possível concluir a reserva agora. Tente novamente."
    }
  }
}
```

## Sequência de implementação

- [ ] Criar `web/lib/orders/types.ts`, `web/lib/orders/quote-id.ts`, `web/lib/orders/cpf.ts`.
- [ ] Criar `web/lib/orders/api.ts` (`createOrder`, `CreateOrderError`).
- [ ] Criar `web/lib/orders/error-messages.ts`, `web/lib/orders/field-error-messages.ts`.
- [ ] Adicionar a chave `orders` a `web/messages/pt-BR.json` (conteúdo em "Contratos de dados").
- [ ] Criar `web/hooks/use-order-reservation.ts`.
- [ ] Alterar `web/components/search/QuoteCard.tsx` para consumir o hook e renderizar os três
      blocos condicionais (`idle`/formulário/`reserved`) descritos em "Componentes".
- [ ] Escrever `web/lib/orders/quote-id.spec.ts`, `web/lib/orders/cpf.spec.ts`,
      `web/lib/orders/api.spec.ts`, `web/lib/orders/error-messages.spec.ts`,
      `web/lib/orders/field-error-messages.spec.ts`,
      `web/hooks/use-order-reservation.spec.ts`, e estender
      `web/components/search/QuoteCard.spec.tsx` (ver "Plano de testes").
- [ ] Rodar `cd web && npm run lint` e `cd web && npm test` antes de considerar a story pronta.
- [ ] Validação manual: `docker compose up -d`, `cd api && npm run start:dev`,
      `cd web && npm run dev`; buscar uma rota válida, reservar uma cotação com nome/CPF válidos,
      confirmar que o card mostra "Reservado" + `orderId` e some o botão de reservar; tentar
      reservar com CPF inválido/vazio e confirmar que a validação aparece sem chamar a API (checar
      aba de rede do browser); forçar um erro (ex. derrubar a API depois de abrir o formulário) e
      confirmar que o card mostra erro mantendo os dados preenchidos, e que "tentar novamente"
      depois de a API voltar funciona.
- [ ] Commit: `feat(DSM-11): reservar cotação inline no card da lista de resultados`.

## Casos de borda e riscos tratados

| Caso/risco (AC correspondente) | Tratamento decidido |
|---|---|
| Ação de reservar sem navegação (AC1) | Botão "Reservar" dentro do próprio `<li>` do `QuoteCard`, sem `next/navigation`/rota nova. |
| Formulário associado visualmente ao card, pede nome + CPF (AC2) | `QuoteCard` expande inline (`state.status !== 'idle'`) — mesmo `<li>`, sem modal (decisão nº2). |
| Cliente gera `idempotencyKey` e chama `POST /orders` com o shape exato (AC3) | `confirm()` monta `CreateOrderInput` com `quoteId` (derivado), `idempotencyKey` (gerada lazy), `passenger`, `quote` (dados da própria cotação do card) — ver fluxo em "Contratos de dados". |
| Nome/CPF vazios/incompletos não disparam a chamada (AC4) | Validação local (`isValidCpf` + checagem de vazio) roda **antes** de `createOrder` ser chamado; se falhar, `confirm()` retorna cedo, `status` permanece `'editing'` com `fieldErrors` preenchidos. |
| Sucesso → estado "reservado" com identificador, ação some (AC5) | `status: 'reserved'` esconde o botão/form por completo (bloco condicional em `QuoteCard`); `orderId` vem de `order.id` da resposta 201. |
| Reenvio acidental com a mesma `idempotencyKey` não gera segundo pedido nem erro de duplicidade visível (AC6) | Resolvido pela combinação de duas decisões (ver "Arquitetura decidida"): mesma `idempotencyKey` reusada entre retries + backend sempre devolve 201 com o mesmo `id` — o `.then()` do front trata ambos os casos de forma idêntica, sem branch de "duplicata". |
| Duplo clique no botão de confirmar | Botão `disabled` enquanto `status === 'submitting'` evita o clique físico duplo na prática; mesmo que ocorresse uma corrida, a mesma `idempotencyKey` (ref, não regenerada) garante no máximo um pedido real no backend. |
| Falha de `POST /orders` (rede, 4xx, 5xx) → erro associado ao card específico, dados mantidos, permite retry, resto da lista intacto (AC7) | Estado de erro é 100% local ao `QuoteCard`/hook daquele card — nenhum estado de `useSearch`/`SearchResultsPanel`/outros `QuoteCard`s é tocado. `name`/`document` nunca são limpos em caminho de erro. Botão de submit muda o texto para "Tentar novamente" e reusa a mesma `idempotencyKey`. |
| Erro 400 do backend em `passenger.name`/`passenger.document` (ex. o algoritmo de CPF do cliente divergir do backend, caso defensivo) | Tratado como erro de campo (`fieldErrors`), não como erro de card — volta para `'editing'`, não `'error'` (ver "Arquitetura decidida"). |
| Erro 400/500 em qualquer outro campo (`quoteId`, `quote.*`, `idempotencyKey`) — não corrigível digitando nome/CPF | Vira `status: 'error'` com banner, `errorCode` = código do primeiro `field` retornado (cai em `orders.errors.fieldRequired`/`invalidQuote`, ou `generic` se o código não for reconhecido). |
| Corpo de erro não é JSON válido (ex. proxy/502 devolvendo HTML) | `createOrder` tolera falha de `response.json()` (`.catch(() => null)`), cai no fallback `code: 'UNKNOWN_ERROR'` → `orders.errors.generic`. |
| `fetch` rejeita antes de qualquer resposta (erro de rede/DNS/CORS) | Não é `CreateOrderError` — hook mapeia direto para `errorCode: 'NETWORK_ERROR'` → `orders.errors.network`. |
| `NEXT_PUBLIC_API_URL` ausente/mal configurada | Mesmo tratamento já aceito pela DSM-9 para `POST /search` — cai no mesmo caminho de falha de rede, sem estado de UI dedicado. |
| Duas cotações idênticas (`carrier`/`miles`/`taxesBrl` iguais) na mesma lista | `buildQuoteId` produz o mesmo `quoteId` para ambas — aceito (decisão nº1); não afeta a key do React em `QuoteList` (que já usa `index` para desambiguar, sem mudança) nem a reserva em si (cada `QuoteCard` tem seu próprio hook/estado local, independente do valor de `quoteId`). |
| Cancelar o formulário sem confirmar, reabrir depois | `cancel()` descarta a `idempotencyKey` gerada (se houver) e zera os campos — reabrir é uma nova tentativa com nova chave (default deste agente, não escalado). |
| Nova busca enquanto um card tem formulário aberto/erro | `QuoteCard` é desmontado junto com a lista antiga quando `useSearch` substitui o estado por `loading` (comportamento já fixado pela DSM-9) — o estado do hook de reserva se perde junto, sem necessidade de tratamento especial. |
| IDs de DOM duplicados entre múltiplos cards abertos ao mesmo tempo | `id`/`htmlFor` dos campos usam `quoteId` do próprio card como sufixo — únicos o suficiente para o propósito (rótulo/input daquele card), mesmo que dois `quoteId` colidam entre si (caso do risco acima; nesse cenário exato os ids colidiriam também, risco residual aceito, extremamente raro de dois cards idênticos estarem com o formulário aberto ao mesmo tempo). |
| Persistência entre reloads/sessões | Fora de escopo explícito da story — nenhum estado de reserva sobrevive a um reload da página (nem o da busca, nem o de reserva), comportamento consistente com o resto da tela. |

## Plano de testes

Todos os testes usam Vitest + Testing Library, colocados junto do arquivo testado, sem chamada de
rede real (mesmo padrão da DSM-9/DSM-10).

**`web/lib/orders/quote-id.spec.ts`**
- Mesma cotação → mesmo `quoteId` em duas chamadas.
- Cotações com `carrier`/`miles`/`taxesBrl` diferentes → `quoteId` diferentes.

**`web/lib/orders/cpf.spec.ts`** (mesmos vetores do validador do backend)
- `'52998224725'` (CPF válido de exemplo já usado na spec da DSM-7) → `true`.
- CPF com dígito verificador errado → `false`.
- Menos/mais de 11 dígitos → `false`.
- Sequência repetida (`'11111111111'`, `'00000000000'`) → `false`, mesmo passando no cálculo de
  dígito verificador.
- String com caracteres não numéricos (ex. `'529.982.247-25'`) → `false` (a função não faz strip;
  quem chama, `setDocument`, já entrega só dígitos).

**`web/lib/orders/api.spec.ts`** (mocka `global.fetch` via `vi.stubGlobal`)
- Resposta 201 → `createOrder` resolve com o corpo parseado.
- Resposta 400 com envelope `{ error: { code: 'VALIDATION_ERROR', message, fields: [...] } }` →
  rejeita com `CreateOrderError` cujo `code`/`fields` batem com o corpo.
- Resposta não-2xx com corpo não-JSON → rejeita com `CreateOrderError('UNKNOWN_ERROR', ...)`, sem
  lançar exceção não tratada por causa do `.json()` falhar.
- `fetch` rejeita (erro de rede) → `createOrder` rejeita com o mesmo erro original, não um
  `CreateOrderError`.

**`web/lib/orders/error-messages.spec.ts`**
- Cada código conhecido (`INVALID_CPF`, `FIELD_REQUIRED`, `INVALID_QUOTE_VALUE`, `NETWORK_ERROR`)
  → a chave esperada.
- Código desconhecido e `undefined` → `'orders.errors.generic'`.

**`web/lib/orders/field-error-messages.spec.ts`**
- `('name', 'required')` → `'orders.form.errors.nameRequired'`.
- `('document', 'required')` → `'orders.form.errors.documentRequired'`.
- `('document', 'invalidCpf')` → `'orders.form.errors.documentInvalid'`.

**`web/hooks/use-order-reservation.spec.ts`** (`renderHook`, `vi.mock('@/lib/orders/api')`)
- Estado inicial: `status: 'idle'`.
- `openForm()` → `status: 'editing'`.
- `confirm()` com `name`/`document` vazios → `createOrder` **não** é chamado; `fieldErrors` com os
  dois campos.
- `confirm()` com `document` preenchido mas CPF inválido → `createOrder` não é chamado;
  `fieldErrors.document === 'invalidCpf'`.
- `confirm()` válido, `createOrder` mockado resolvendo → `status` passa por `'submitting'` antes de
  chegar a `'reserved'` com o `orderId` da resposta mockada.
- Duas chamadas de `confirm()` (a primeira falhando, retry depois de corrigir/repetir) →
  `createOrder` chamado duas vezes com o **mesmo** `idempotencyKey` nas duas.
- `confirm()` cujo `createOrder` rejeita com `CreateOrderError` tendo `fields` com
  `field: 'passenger.document'` → volta para `status: 'editing'` com `fieldErrors.document`
  preenchido a partir do `code` do erro, não `status: 'error'`.
- `confirm()` cujo `createOrder` rejeita com `CreateOrderError` sem `fields` relevantes (ex. código
  genérico) → `status: 'error'`, `name`/`document` preservados.
- `confirm()` cujo `createOrder` rejeita com um erro que não é `CreateOrderError` (simulando falha
  de rede) → `status: 'error'`, `errorCode: 'NETWORK_ERROR'`.
- `cancel()` a partir de `'editing'`/`'error'` → volta para `status: 'idle'`, campos zerados;
  `confirm()` chamado depois de reabrir gera uma **nova** `idempotencyKey` (diferente da usada
  antes de cancelar).
- `cancel()` chamado durante `'submitting'` → não tem efeito (estado permanece `'submitting'`).

**`web/components/search/QuoteCard.spec.tsx`** (estende o arquivo já existente da DSM-10,
`renderWithIntl`, sem mockar o hook — usa `vi.mock('@/lib/orders/api')` só nos testes que chegam a
confirmar)
- Estado inicial → botão "Reservar" visível, formulário não visível.
- Clicar em "Reservar" → campos "Nome completo"/"CPF" aparecem, botão "Reservar" some.
- Confirmar com campos vazios → mensagens de erro inline visíveis, `createOrder` não chamado.
- Preencher nome + CPF válido, confirmar, `createOrder` mockado resolvendo → após aguardar, texto
  "Reservado" e o `orderId` aparecem; botão/formulário de reserva não aparecem mais.
- Preencher nome + CPF válido, confirmar, `createOrder` mockado rejeitando com erro genérico → após
  aguardar, mensagem de erro do card aparece; os valores digitados continuam nos campos; o restante
  do card (milhas/companhia/taxas) segue visível e correto.
- Clicar em "Cancelar" a partir do formulário aberto → volta a mostrar só o botão "Reservar",
  campos limpos.

Fora do escopo de teste desta story: teste end-to-end real contra a API (Playwright/Cypress) —
mesma decisão já registrada na DSM-9, só a validação manual listada em "Sequência de
implementação".
