# DSM-9 — Estados de UI para busca: carregando, sucesso, parcial, erro e vazio

## Contexto

User story: `claude/specs/DSM-9/user-story.md`.

`POST /search` (DSM-5, `api/src/presentation/search/`) já existe e responde com
`{ status: 'complete' | 'partial', quotes: [{ miles, taxesBrl, carrier }], suppliers: Record<SupplierId, 'ok'|'timeout'|'failed'> }`
(`api/src/presentation/search/dto/search-response.dto.ts`), sempre HTTP 200 para entrada válida —
mesmo quando os 3 fornecedores falham (`quotes: []`, `status: 'partial'`, os 3 `suppliers`
não-`ok`). O backend deliberadamente não expõe um terceiro valor de `status` para esse caso
extremo (`claude/specs/DSM-5/spec.md`, "Arquitetura decidida") — cabe a esta story (DSM-9)
inspecionar `quotes`/`suppliers` para decidir se mostra o aviso neutro de parcial ou a tela de
erro. `web/` hoje é só o esqueleto do Next.js 16 (`app/page.tsx`, `app/layout.tsx`), sem nenhum
framework de teste, sem `next-intl` instalado.

**Decisões tomadas pelo desenvolvedor (sessão principal, repassadas pelo coordenador, ver
histórico da conversa — `AskUserQuestion` não estava disponível nesta sessão do agente, os 4
pontos abaixo foram escalados antes de qualquer linha desta spec ser escrita):**

1. **Framework de teste no `web/`:** Vitest + Testing Library (`@testing-library/react`,
   `@testing-library/jest-dom`, `@testing-library/user-event`).
2. **Campos origem/destino do formulário:** `<select>` com as 8 opções fixas — duplica
   `SUPPORTED_AIRPORTS` no front, mesmo precedente de hardcode já usado pela DSM-5
   (`api/src/presentation/search/supported-airports.ts`).
3. **Setup do `next-intl`:** simplificado, sem roteamento de locale — `NextIntlClientProvider`
   estático com `pt-BR` fixo no `RootLayout`, sem middleware nem segmento `[locale]`.
4. **Caso de borda `status: 'partial'` com `quotes: []` mas nem todos os fornecedores falharam:**
   tratado como estado **parcial com 0 respostas/cotações** — mostra a mensagem "não encontramos
   cotações para esse destino" junto do aviso neutro de quais fornecedores faltaram, **não** entra
   no estado de erro total.

**Ponto não escalado — decidido por este agente com um default razoável, documentado abaixo:**
comportamento do botão "tentar novamente" e do que acontece com resultados antigos ao rebuscar
(ver "Arquitetura decidida", itens "Retry" e "Limpeza de resultados ao rebuscar").

## Arquitetura decidida

- **Separação hook/componente (`parametros-tecnicos.md`, item 17):** toda a lógica de busca
  (chamar `POST /search`, mapear a resposta para um estado de UI, guardar os últimos parâmetros
  para retry) fica em `web/hooks/use-search.ts`. Os componentes (`.tsx`) só leem o estado devolvido
  pelo hook e renderizam — nenhum componente chama `fetch` diretamente.
- **Estado de UI como union discriminada própria do front (`SearchUiState`, `kind: 'idle' |
  'loading' | 'success' | 'partial' | 'empty' | 'error'`), não um espelho literal do `status` da
  API.** O `status` da API (`complete`/`partial`) não mapeia 1:1 para o que a tela precisa mostrar
  — a lógica de derivação (função pura `deriveSearchUiState`, sem import de React) mora em
  `web/lib/search/derive-ui-state.ts`, testável isoladamente sem montar hook nem componente:
  - `quotes.length === 0` **e** todos os `suppliers` não-`ok` → `{ kind: 'error' }` (AC4 — erro
    total, mesmo o backend tendo devolvido HTTP 200 com `status: 'partial'`).
  - `status === 'complete'` e `quotes.length === 0` → `{ kind: 'empty' }` (AC5 — sucesso completo,
    sem cotações para a rota/data).
  - `status === 'complete'` e `quotes.length > 0` → `{ kind: 'success', quotes }` (AC2).
  - `status === 'partial'` (qualquer `quotes.length`, desde que nem todos os fornecedores tenham
    falhado) → `{ kind: 'partial', quotes, missingSuppliers }` (AC3 e a decisão nº4 do
    desenvolvedor — inclui o caso `quotes: []` com aviso "não encontramos cotações para esse
    destino" dentro do próprio estado parcial, não um estado de erro).
  - Falha de rede (`fetch` rejeita) ou resposta HTTP não-2xx → capturado no hook (fora da função
    pura, que só recebe respostas 200 já parseadas) → `{ kind: 'error' }` direto.
- **Formulário com `<select>` para origem/destino (decisão nº2), lista duplicada em
  `web/lib/search/supported-airports.ts`.** Mesma justificativa da DSM-5 para não buscar a lista
  do mock em runtime: a busca precisa ficar disponível offline de qualquer chamada de rede
  auxiliar, e o catálogo é fixo/documentado no `README.md`. Elimina de saída a classe de erro
  "aeroporto não suportado" — o único erro 400 do backend que ainaind pode ocorrer na prática é
  `origin === destination` (não bloqueado no front, ver "Casos de borda").
- **Validação client-side controlada (não depende da UI nativa de `required` do navegador).**
  `SearchForm` mantém `errors` como estado próprio e só chama `onSubmit` se `origin`, `destination`
  e `date` estiverem todos preenchidos — senão marca os campos vazios com mensagem inline em
  pt-BR (via `next-intl`) e **não chama a API** (cumpre AC6 literalmente). Motivo de não confiar só
  no `required` nativo: mensagens de validação nativas do navegador não são inspecionáveis de forma
  confiável em `jsdom`/Testing Library, e o texto/estilo não é controlável em pt-BR.
- **`next-intl` sem roteamento (decisão nº3).** `RootLayout` (`web/app/layout.tsx`, Server
  Component) importa `web/messages/pt-BR.json` estaticamente e envolve `children` com
  `<NextIntlClientProvider locale="pt-BR" messages={messages}>` — sem `next-intl/plugin` no
  `next.config.ts`, sem `i18n/request.ts`, sem segmento `app/[locale]/`. Suficiente para o que o
  item 15 dos parâmetros técnicos exige (estrutura de chaves externalizadas, não tradução real
  multi-idioma). Todo texto visível ao usuário nesta story vem de `messages/pt-BR.json` via
  `useTranslations('search')`, nunca string solta no JSX.
- **Server/Client Component split, padrão do App Router:** `web/app/page.tsx` continua Server
  Component (só renderiza `<SearchPage />`); toda a árvore interativa (`SearchPage`, `SearchForm`,
  `SearchResultsPanel` e filhos) é Client Component (`'use client'`), pois dependem de estado e
  evento de formulário. Não há necessidade de streaming/Suspense do App Router aqui — é uma única
  tela, uma chamada sob demanda.
- **Retry (`kind: 'error'`) — default deste agente: reexecuta a última busca submetida, não exige
  reenvio manual do formulário.** O hook guarda os últimos `SearchFormValues` submetidos
  (`lastParamsRef`); `retry()` chama a mesma função interna de busca com esses parâmetros. Motivo:
  a causa mais provável de erro aqui é falha transitória de fornecedor/rede (README: fornecedor A
  5% de erro, B 20% + rate limit, C 10% sujo) — "tentar novamente" reexecutando a mesma busca é o
  comportamento mais útil na prática, e o formulário com `<select>` já elimina a maior parte dos
  erros de validação que tornariam um retry automático inútil (o único 400 residual possível,
  `origin === destination`, é raro e aceito como limitação — ver "Casos de borda").
- **Limpeza de resultados ao rebuscar — default deste agente: o estado anterior é substituído
  imediatamente por `loading` a cada nova busca (original ou retry), sem manter resultado
  "stale" visível.** Mantém o mental model simples (a AC1 já pede loading visível a cada submit) e
  evita mostrar cotações de uma busca antiga junto de um formulário já alterado para outra
  rota/data.
- **Sem SWR/React Query, `fetch` nativo (`parametros-tecnicos.md`, item 7):** `web/lib/search/api.ts`
  expõe uma função `searchQuotes` que encapsula a chamada `fetch` + `JSON.parse` + tratamento de
  `!response.ok` como exceção (`SearchRequestError`) — é o único lugar que conhece a URL da API
  (`process.env.NEXT_PUBLIC_API_URL`) e o formato bruto da resposta.

## Componentes

### Novos arquivos — lógica/dados (sem JSX, sem `'use client'`)

| Arquivo | Responsabilidade |
|---|---|
| `web/lib/search/supported-airports.ts` | `SUPPORTED_AIRPORTS` (mesmos 8 códigos IATA de `api/src/presentation/search/supported-airports.ts`, comentário citando a origem) + tipo `SupportedAirport`. |
| `web/lib/search/types.ts` | Tipos compartilhados: `SearchFormValues` (`{ origin, destination, date }`), `SupplierId`, `SupplierOutcomeStatus`, `SearchUiState` (union discriminada por `kind`). |
| `web/lib/search/api.ts` | `SearchResponseBody`/`SearchResponseQuote` (espelham `SearchResponseDto` da DSM-5); `searchQuotes(values: SearchFormValues): Promise<SearchResponseBody>` — `fetch(POST \`${NEXT_PUBLIC_API_URL}/search\`)`, lança `SearchRequestError` se `!response.ok`. Único arquivo que sabe a URL da API. |
| `web/lib/search/derive-ui-state.ts` | Função pura `deriveSearchUiState(response: SearchResponseBody): SearchUiState` — regra descrita em "Arquitetura decidida". Sem import de React. |
| `web/lib/search/supplier-labels.ts` | `SUPPLIER_ORDER: SupplierId[]` (`['supplier-a', 'supplier-b', 'supplier-c']`, ordem estável de exibição) — os rótulos exibidos (`"Fornecedor A"` etc.) vêm de `messages/pt-BR.json` (`search.suppliers.*`), não hardcoded aqui. |
| `web/hooks/use-search.ts` | `useSearch()`: `useState<SearchUiState>` (inicial `{ kind: 'idle' }`), `useRef` com os últimos `SearchFormValues`. Expõe `{ uiState, submit(values), retry() }`. `submit`/`retry` chamam uma função interna comum que seta `loading`, chama `searchQuotes`, e no `then` chama `deriveSearchUiState`; no `catch`, seta `{ kind: 'error' }` direto (sem passar pela função pura, que só trata respostas 200 já parseadas). |

### Novos arquivos — apresentação (`'use client'`, App Router)

| Arquivo | Responsabilidade |
|---|---|
| `web/components/search/SearchForm.tsx` | Formulário controlado: `<select>` origem/destino (opções de `SUPPORTED_AIRPORTS`, com opção vazia inicial desabilitada), `<input type="date">`. Estado próprio de erro por campo (`{ origin?, destination?, date? }`). `onSubmit`: valida os 3 campos antes de chamar a prop `onSubmit(values: SearchFormValues)`; se algum estiver vazio, seta erro inline e **não chama** a prop. Prop `disabled: boolean` (true quando `uiState.kind === 'loading'`) desabilita o botão de busca e os campos. |
| `web/components/search/SearchResultsPanel.tsx` | Componente "burro": recebe `state: SearchUiState` e `onRetry: () => void` como props, sem acesso ao hook. `switch (state.kind)`: `'idle'` → nada; `'loading'` → `<LoadingSkeleton />`; `'success'` → `<QuoteList quotes={state.quotes} />`; `'partial'` → `<PartialWarningBanner missingSuppliers={state.missingSuppliers} />` seguido de `<QuoteList quotes={state.quotes} />` **ou** mensagem `search.states.partialEmpty` se `state.quotes.length === 0`; `'empty'` → mensagem `search.states.empty`; `'error'` → mensagem `search.states.error` + botão que chama `onRetry`. |
| `web/components/search/QuoteList.tsx` | Renderiza `quotes: SearchResponseQuote[]` como lista (`<ul>`/`<li>`), já vem ordenada por milhas do backend (DSM-4) — não reordena. Markup estrutural mínimo com Tailwind básico (espaçamento/legibilidade); hierarquia visual "melhor oferta"/ênfase tipográfica fica para a DSM-10 (fora de escopo desta story, ver user-story DSM-10). |
| `web/components/search/PartialWarningBanner.tsx` | Recebe `missingSuppliers: SupplierId[]`. Renderiza aviso com cor neutra (não vermelha — AC3), texto `search.states.partialWarning` + lista dos nomes traduzidos (`search.suppliers.*`) dos fornecedores que faltaram. |
| `web/components/search/LoadingSkeleton.tsx` | Placeholder visual simples (3 blocos com `animate-pulse`) — suficiente para cumprir "estado de carregamento visível" da AC1; não é o objeto de refinamento visual da DSM-10. |
| `web/components/search/SearchPage.tsx` | Orquestrador `'use client'`: usa `useSearch()`, renderiza `<SearchForm onSubmit={submit} disabled={uiState.kind === 'loading'} />` e `<SearchResultsPanel state={uiState} onRetry={retry} />`. |

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `web/app/page.tsx` | Continua Server Component; corpo passa a renderizar `<SearchPage />` no lugar do texto estático atual. |
| `web/app/layout.tsx` | Importa `messages` de `../messages/pt-BR.json`; envolve `{children}` com `<NextIntlClientProvider locale="pt-BR" messages={messages}>`. |
| `web/package.json` | `dependencies`: `next-intl`. `devDependencies`: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `vite-tsconfig-paths`. Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. |

### Novos arquivos — infraestrutura de teste

| Arquivo | Responsabilidade |
|---|---|
| `web/vitest.config.ts` | `environment: 'jsdom'`, `plugins: [react(), tsconfigPaths()]`, `setupFiles: ['./vitest.setup.ts']`. Sem `globals: true` — cada `*.spec.ts(x)` importa `describe/it/expect/vi` explicitamente de `'vitest'`, evita depender de tipos globais e não exige alterar `tsconfig.json`. |
| `web/vitest.setup.ts` | `import '@testing-library/jest-dom/vitest'` — registra os matchers (`toBeInTheDocument`, etc.) no `expect` do Vitest. |
| `web/test/render-with-intl.tsx` | Helper de teste: `renderWithIntl(ui: ReactNode)` — `render()` do Testing Library envolvendo `ui` com `<NextIntlClientProvider locale="pt-BR" messages={messages}>` (mesmo `messages/pt-BR.json` de produção), usado por todo teste de componente desta story. |

Nenhum arquivo de `api/` é alterado por esta story — contrato de `POST /search` (DSM-5) consumido
como está.

## Contratos de dados

```ts
// web/lib/search/supported-airports.ts
export const SUPPORTED_AIRPORTS = [
  'GRU', 'GIG', 'BSB', 'SSA', 'REC', 'POA', 'CNF', 'FOR',
] as const;
export type SupportedAirport = (typeof SUPPORTED_AIRPORTS)[number];
```

```ts
// web/lib/search/types.ts
export type SupplierId = 'supplier-a' | 'supplier-b' | 'supplier-c';
export type SupplierOutcomeStatus = 'ok' | 'timeout' | 'failed';

export interface SearchFormValues {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD, produzido por <input type="date">
}

export type SearchUiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; quotes: SearchResponseQuote[] }
  | { kind: 'partial'; quotes: SearchResponseQuote[]; missingSuppliers: SupplierId[] }
  | { kind: 'empty' }
  | { kind: 'error' };
```

```ts
// web/lib/search/api.ts
export interface SearchResponseQuote {
  miles: number;
  taxesBrl: number;
  carrier: string;
}

export interface SearchResponseBody {
  status: 'complete' | 'partial';
  quotes: SearchResponseQuote[];
  suppliers: Record<SupplierId, SupplierOutcomeStatus>;
}

export class SearchRequestError extends Error {}

export async function searchQuotes(values: SearchFormValues): Promise<SearchResponseBody>;
// POST `${process.env.NEXT_PUBLIC_API_URL}/search`, body JSON = values.
// !response.ok → throw new SearchRequestError(`POST /search respondeu ${response.status}`).
// fetch rejeitar (erro de rede) → propaga a exceção original, sem encapsular.
```

```ts
// web/lib/search/derive-ui-state.ts
export function deriveSearchUiState(response: SearchResponseBody): SearchUiState;
// Regra completa em "Arquitetura decidida". Só chamada quando a resposta HTTP já é 200 — falha de
// rede/HTTP não-2xx é tratada no hook, antes desta função ser chamada.
```

```ts
// web/hooks/use-search.ts
export interface UseSearchResult {
  uiState: SearchUiState;
  submit: (values: SearchFormValues) => void;
  retry: () => void;
}
export function useSearch(): UseSearchResult;
```

```ts
// web/components/search/SearchForm.tsx
export interface SearchFormProps {
  onSubmit: (values: SearchFormValues) => void;
  disabled: boolean;
}
```

```ts
// web/components/search/SearchResultsPanel.tsx
export interface SearchResultsPanelProps {
  state: SearchUiState;
  onRetry: () => void;
}
```

Exemplo de resposta `partial` com `quotes: []` (decisão nº4 — nem todos falharam, mas nenhuma
cotação chegou para a rota/data):

```json
{
  "status": "partial",
  "quotes": [],
  "suppliers": { "supplier-a": "ok", "supplier-b": "timeout", "supplier-c": "ok" }
}
```

→ `deriveSearchUiState` devolve `{ kind: 'partial', quotes: [], missingSuppliers: ['supplier-b'] }`
→ `SearchResultsPanel` mostra `PartialWarningBanner` (fornecedor B faltou) + mensagem
`search.states.partialEmpty` ("não encontramos cotações para esse destino"), **não** a tela de
erro.

Exemplo de `messages/pt-BR.json` (chaves usadas por esta story):

```json
{
  "search": {
    "form": {
      "title": "Buscar cotações",
      "origin": "Origem",
      "destination": "Destino",
      "date": "Data",
      "selectPlaceholder": "Selecione",
      "submit": "Buscar",
      "submitLoading": "Buscando...",
      "errors": {
        "originRequired": "Selecione a origem.",
        "destinationRequired": "Selecione o destino.",
        "dateRequired": "Selecione a data."
      }
    },
    "states": {
      "loading": "Buscando cotações...",
      "partialWarning": "Nem todos os fornecedores responderam a tempo.",
      "partialEmpty": "Não encontramos cotações para esse destino com os fornecedores que responderam.",
      "empty": "Nenhum resultado encontrado para essa rota e data.",
      "error": "Não foi possível buscar as cotações agora.",
      "retry": "Tentar novamente"
    },
    "suppliers": {
      "supplier-a": "Fornecedor A",
      "supplier-b": "Fornecedor B",
      "supplier-c": "Fornecedor C"
    },
    "quote": {
      "miles": "{miles} milhas",
      "taxes": "+ R$ {taxes} de taxas",
      "carrier": "Companhia: {carrier}"
    }
  }
}
```

## Sequência de implementação

- [ ] Adicionar `next-intl` a `web/package.json` (`dependencies`); `vitest`,
      `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
      `@testing-library/user-event`, `vite-tsconfig-paths` a `devDependencies`; scripts `test`/
      `test:watch`; `npm install`.
- [ ] Criar `web/vitest.config.ts`, `web/vitest.setup.ts`, `web/test/render-with-intl.tsx`.
- [ ] Criar `web/messages/pt-BR.json` com as chaves de "Contratos de dados".
- [ ] Alterar `web/app/layout.tsx` para `NextIntlClientProvider` estático.
- [ ] Criar `web/lib/search/supported-airports.ts`, `web/lib/search/types.ts`,
      `web/lib/search/api.ts`, `web/lib/search/derive-ui-state.ts`,
      `web/lib/search/supplier-labels.ts`.
- [ ] Criar `web/hooks/use-search.ts`.
- [ ] Criar `web/components/search/LoadingSkeleton.tsx`, `QuoteList.tsx`,
      `PartialWarningBanner.tsx`, `SearchResultsPanel.tsx`, `SearchForm.tsx`, `SearchPage.tsx`.
- [ ] Alterar `web/app/page.tsx` para renderizar `<SearchPage />`.
- [ ] Escrever `web/lib/search/supported-airports.spec.ts`,
      `web/lib/search/derive-ui-state.spec.ts`, `web/hooks/use-search.spec.ts`,
      `web/components/search/SearchForm.spec.tsx`,
      `web/components/search/SearchResultsPanel.spec.tsx`,
      `web/components/search/SearchPage.spec.tsx` (ver "Plano de testes").
- [ ] Rodar `cd web && npm run lint` e `cd web && npm test` antes de considerar a story pronta.
- [ ] Validação manual: `docker compose up -d`, `cd api && npm run start:dev`,
      `cd web && npm run dev`, conferir os 5 estados na tela real (incluindo forçar
      `POST /admin/force-fail/supplier-a` + `force-fail/supplier-b` + `force-fail/supplier-c` no
      mock para ver o estado de erro total, e `force-slow` para ver o parcial).
- [ ] Commit: `feat(DSM-9): estados de UI da busca — carregando, sucesso, parcial, erro e vazio`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Loading visível + botão desabilitado (AC1) | `uiState.kind === 'loading'` → `SearchForm` recebe `disabled=true` (campos e botão); `SearchResultsPanel` mostra `LoadingSkeleton`. |
| `status: 'complete'` (AC2) | `deriveSearchUiState` → `{ kind: 'success' }`; nenhum aviso renderizado. |
| `status: 'partial'` com cotações (AC3) | `{ kind: 'partial', quotes, missingSuppliers }`; `PartialWarningBanner` em cor neutra, lista os fornecedores de `missingSuppliers` pelo nome traduzido. |
| Erro de rede (`fetch` rejeita) | Capturado no `catch` do hook → `{ kind: 'error' }` direto, sem passar por `deriveSearchUiState`. |
| 5xx da própria API, ou qualquer resposta não-2xx | `searchQuotes` lança `SearchRequestError`; mesmo `catch` do hook → `{ kind: 'error' }`. |
| Todas as cotações vazias com os 3 fornecedores falhos (AC4, `status: 'partial'` do backend) | `deriveSearchUiState` detecta `quotes.length === 0 && missingSuppliers.length === 3` → `{ kind: 'error' }`, distinto do parcial. |
| Sucesso mas lista vazia, todos os fornecedores `ok` (AC5) | `{ kind: 'empty' }` — mensagem "nenhum resultado encontrado", distinta de erro e de parcial. |
| `status: 'partial'`, `quotes: []`, nem todos falharam (decisão nº4, não coberto literalmente pela AC da story) | `{ kind: 'partial', quotes: [], missingSuppliers }` — mostra aviso de parcial **e** mensagem "não encontramos cotações para esse destino", não entra em erro. |
| Campo obrigatório vazio (AC6) | `SearchForm` valida antes de chamar `onSubmit`; `onSubmit`/`searchQuotes` nunca são chamados; erro inline por campo via `search.form.errors.*`. |
| `origin === destination` (ambos selecionados iguais no `<select>`) | **Não bloqueado no client** — fora do escopo literal das ACs da DSM-9 (que só cobre campo obrigatório vazio). Se ocorrer, a API responde 400; cai no mesmo fluxo de "resposta não-2xx" → `{ kind: 'error' }` genérico. Risco aceito e documentado: raro na prática (usuário precisa escolher o mesmo aeroporto nos dois `<select>`), sem mensagem específica distinguindo esse 400 de uma falha de rede — se vier a incomodar, é uma melhoria aditiva pequena (checar `origin !== destination` em `SearchForm` antes de submeter). |
| Retry após erro (AC4, "opção de tentar novamente") | Default deste agente: `retry()` reexecuta a última busca submetida (mesmos `origin`/`destination`/`date`), sem exigir reenvio manual do formulário — ver justificativa em "Arquitetura decidida". |
| Resultado antigo ao rebuscar (usuário já tem resultados e busca de novo) | Default deste agente: `loading` substitui imediatamente qualquer estado anterior, nada de resultado "stale" visível durante a nova busca. |
| `NEXT_PUBLIC_API_URL` ausente/mal configurada | Fora do escopo desta story tratar como um estado de UI dedicado — `fetch` para uma URL `undefined`/inválida cai no mesmo `catch` de erro de rede do hook (`{ kind: 'error' }`); é um erro de configuração de ambiente, não um estado de negócio a distinguir na tela. |
| CORS entre `web` (3001) e `api` (3000) | Já resolvido — `api/src/main.ts:14` (`app.enableCors()`), nada a fazer nesta story. |
| Ordenação das cotações por milhas | Não reordenado no front — `QuoteList` confia na ordem que já vem de `SearchAggregatorService` (DSM-4, ordenado por milhas asc, `taxesBrl` asc no empate). |

## Plano de testes

Todos os testes usam Vitest + Testing Library (decisão nº1), colocados junto do arquivo testado
(`*.spec.ts`/`*.spec.tsx`), sem chamada de rede real — `searchQuotes`/`useSearch` são mockados nas
camadas que os consomem (item 17: componente mocka o hook, não a chamada de rede diretamente).

**`web/lib/search/supported-airports.spec.ts`**
- `SUPPORTED_AIRPORTS` tem exatamente os 8 códigos do README, sem duplicata (mesmo teste de
  sanidade da contraparte em `api/src/presentation/search/supported-airports.spec.ts`).

**`web/lib/search/derive-ui-state.spec.ts`** (função pura, sem mock)
- `status: 'complete'`, `quotes` não vazio → `{ kind: 'success', quotes }`.
- `status: 'complete'`, `quotes: []` → `{ kind: 'empty' }`.
- `status: 'partial'`, `quotes` não vazio, 1 fornecedor não-`ok` → `{ kind: 'partial', quotes,
  missingSuppliers: [aquele fornecedor] }`.
- `status: 'partial'`, `quotes: []`, todos os 3 `suppliers` não-`ok` → `{ kind: 'error' }`.
- `status: 'partial'`, `quotes: []`, só 1 ou 2 `suppliers` não-`ok` (decisão nº4) →
  `{ kind: 'partial', quotes: [], missingSuppliers }`, **não** `{ kind: 'error' }`.

**`web/hooks/use-search.spec.ts`** (`renderHook` de `@testing-library/react`, `vi.mock` de
`web/lib/search/api.ts`)
- Estado inicial: `{ kind: 'idle' }`.
- `submit(values)`: estado passa por `{ kind: 'loading' }` antes de resolver; ao resolver com um
  `SearchResponseBody` mockado, aplica `deriveSearchUiState` (mock de `searchQuotes` resolvendo,
  verificar estado final coerente com um caso `success`).
- `submit(values)` cujo `searchQuotes` mockado rejeita → estado final `{ kind: 'error' }`.
- `retry()` sem nenhuma busca anterior → não chama `searchQuotes` (não há `lastParams`).
- `submit(values)` seguido de `retry()` → `searchQuotes` chamado duas vezes, ambas com o mesmo
  `values`.

**`web/components/search/SearchForm.spec.tsx`** (`renderWithIntl` + `userEvent`)
- Submeter com os 3 campos preenchidos → `onSubmit` chamado uma vez com os valores exatos.
- Submeter com `origin` vazio → `onSubmit` **não** chamado; mensagem de erro
  (`search.form.errors.originRequired`) visível na tela.
- Mesma asserção para `destination` e `date` vazios, isoladamente.
- `disabled=true` → botão de busca e os 3 campos ficam desabilitados.

**`web/components/search/SearchResultsPanel.spec.tsx`** (`renderWithIntl`, sem mock de hook —
componente recebe `state` direto por prop)
- `{ kind: 'idle' }` → nada renderizado (sem lista, sem mensagens).
- `{ kind: 'loading' }` → skeleton visível.
- `{ kind: 'success', quotes }` → lista com as cotações, sem nenhum aviso de parcial.
- `{ kind: 'partial', quotes, missingSuppliers }` → aviso de parcial visível **e** lista com as
  cotações.
- `{ kind: 'partial', quotes: [], missingSuppliers }` → aviso de parcial visível **e** mensagem
  "não encontramos cotações para esse destino", sem lista.
- `{ kind: 'empty' }` → mensagem de "nenhum resultado encontrado", sem aviso de parcial, sem lista.
- `{ kind: 'error' }` → mensagem de erro + botão "tentar novamente"; clicar no botão chama
  `onRetry`.

**`web/components/search/SearchPage.spec.tsx`** (`renderWithIntl`, `vi.mock('@/hooks/use-search')`)
- Hook mockado devolvendo `{ uiState: { kind: 'idle' }, submit: vi.fn(), retry: vi.fn() }` →
  submeter o formulário chama `submit` com os valores do formulário.
- Hook mockado com `uiState: { kind: 'loading' }` → `SearchForm` recebe `disabled=true`.
- Hook mockado com `uiState: { kind: 'error' }` → clicar em "tentar novamente" chama `retry`.

Fora do escopo de teste desta story: qualquer asserção de estilo/CSS específico (Tailwind,
hierarquia visual "melhor oferta") — isso é a DSM-10; teste end-to-end de UI real (Playwright/
Cypress) não foi pedido pelo desafio, só a validação manual listada em "Sequência de
implementação".
