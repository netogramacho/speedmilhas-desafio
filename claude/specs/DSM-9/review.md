# Review — DSM-9: Estados de UI para busca (carregando, sucesso, parcial, erro, vazio)

Commit avaliado: `22f14d2` ("feat(DSM-9): tela de busca de cotações com estados de sucesso, falha
parcial e falha total").

## Veredito geral

**Aprovado.** Implementação aderente à spec e à user story, com testes e lint passando. A
divergência deliberada em relação à spec (props explícitas em `NextIntlClientProvider` no lugar do
plugin `next-intl`) é tecnicamente correta e foi verificada nesta review — sem ela o `next build`
quebra. Não há achados bloqueantes; há alguns achados menores (rastreabilidade da divergência,
risco cosmético de `now` congelado em build estático, e ausência de guarda contra corrida de
requisições fora de ordem) que valem nota para o desenvolvedor, mas nenhum deles compromete os
critérios de aceite.

## Critérios de aceite (user story)

| # | Critério | Status |
|---|---|---|
| 1 | Loading visível + botão desabilitado ao submeter | **Atendido** — `useSearch` seta `{ kind: 'loading' }` antes do `fetch`; `SearchForm` recebe `disabled={uiState.kind === 'loading'}`, desabilita os 3 campos e o botão; `SearchResultsPanel` mostra `LoadingSkeleton` (`role="status"`). Coberto por `use-search.spec.ts`, `SearchForm.spec.tsx`, `SearchResultsPanel.spec.tsx`, `SearchPage.spec.tsx`. |
| 2 | `status: "complete"` → lista sem aviso de dados incompletos | **Atendido** — `deriveSearchUiState` mapeia para `{ kind: 'success', quotes }`; `SearchResultsPanel` renderiza só `QuoteList`. Ordem das cotações não é reordenada no front (confia no backend, DSM-4). Coberto por teste. |
| 3 | `status: "partial"` → cotações + aviso neutro (não vermelho) com fornecedores faltantes | **Atendido** — `PartialWarningBanner` usa `border-amber-300 bg-amber-50 text-amber-900` (âmbar, não vermelho); lista os nomes traduzidos via `search.suppliers.*`. Coberto por teste (conteúdo, não cor — fora do escopo de teste da própria spec). |
| 4 | Falha completa (rede, 5xx, ou todas cotações vazias com todos fornecedores falhos) → erro distinto do parcial, com opção de retry | **Atendido** — erro de rede/HTTP não-2xx cai direto no `catch` do hook; `quotes.length === 0 && allSuppliersFailed` é detectado em `deriveSearchUiState` mesmo com HTTP 200. `SearchResultsPanel` mostra mensagem de erro + botão que chama `onRetry`, que reexecuta a última busca. Coberto por `derive-ui-state.spec.ts`, `use-search.spec.ts`, `SearchResultsPanel.spec.tsx`, `SearchPage.spec.tsx`. |
| 5 | Sucesso com lista vazia → "nenhum resultado encontrado", distinto de erro/parcial | **Atendido** — `status === 'complete' && quotes.length === 0` → `{ kind: 'empty' }`, mensagem própria. Coberto por teste. |
| 6 | Campos obrigatórios vazios → não dispara busca, validação inline, sem chamar API | **Atendido** — `SearchForm.handleSubmit` valida antes de chamar `onSubmit`; testado isoladamente para `origin`, `destination` e `date` vazios. |

Todos os 6 critérios de aceite da user story estão atendidos com cobertura de teste real (não
apenas nome de função parecido — os testes de `SearchResultsPanel` e `derive-ui-state` verificam o
texto efetivamente renderizado/estado efetivamente derivado para cada combinação relevante,
incluindo o caso de borda decisão nº4 do desenvolvedor, `partial` com `quotes: []` e nem todos os
fornecedores falhos).

## Avaliação da divergência deliberada (NextIntlClientProvider)

A spec (`claude/specs/DSM-9/spec.md`, "Arquitetura decidida" e tabela de arquivos alterados) pedia
`<NextIntlClientProvider locale="pt-BR" messages={messages}>` sem plugin `next-intl` e sem
`i18n/request.ts`. A implementação real (`web/app/layout.tsx:15-21`) adiciona `now={new Date()}`,
`timeZone="America/Sao_Paulo"` e `formats={{}}` como props explícitas, com um comentário inline
justificando a mudança.

**Verifiquei a alegação na prática**: removi temporariamente os três props extras, rodei
`npm run build` e o build quebrou exatamente como descrito —
`Error: Couldn't find next-intl config file` durante a prerenderização de `/_not-found` — e
restaurei o arquivo original em seguida (`git diff` confirma zero alteração residual). Inspecionei
também `node_modules/next-intl/dist/.../NextIntlClientProviderServer.js`: quando
`NextIntlClientProvider` é usado dentro de um Server Component (caso do `RootLayout`), a lib
troca para uma variante `react-server` que chama `getFormats()`/`getConfigNow()`/`getTimeZone()`
internamente para qualquer prop não fornecida explicitamente — e essas funções, sem o plugin/config
file, lançam a exceção observada. `messages` e `locale` já eram passados explicitamente na versão
original da spec, então só faltavam `formats`/`now`/`timeZone` para evitar completamente a
resolução de config em runtime.

**Conclusão: a solução é adequada e é o fix mínimo necessário** (os três props evitam exatamente as
três chamadas que dependiam do plugin), mantém a decisão arquitetural original (sem
`next-intl/plugin`, sem `i18n/request.ts`, sem roteamento de locale) e não introduz nenhuma
dependência nova. Nenhuma correção a fazer aqui.

Dois pontos menores sobre como isso ficou registrado:

- **Rastreabilidade fraca da divergência** (cosmético): a única documentação da mudança é o
  comentário inline em `web/app/layout.tsx:14`. O `spec.md` committado no mesmo commit ainda
  descreve a versão sem os três props extras (a que quebra o build) e a mensagem do commit
  (`22f14d2`) não menciona a divergência. Quem ler só a spec ou só o log do git, sem abrir
  `layout.tsx`, não descobre que o comportamento real diverge do documentado. Como o processo do
  projeto veda edição retroativa de spec já commitada, o ponto de melhoria é processual para a
  próxima vez: quando uma divergência técnica forçada (build quebrando) é descoberta durante a
  implementação, vale registrar isso também na mensagem de commit (ex.: rodapé "Nota: diverge da
  spec no ponto X, ver comentário em Y"), não só no comentário do código.
- **`now={new Date()}` fica congelado no build estático** (baixo risco, informativo): `npm run build`
  mostra `/` como `○ (Static)` — ou seja, `RootLayout` é executado uma vez no build, não por
  request, então o valor de `now` passado ao provider fica fixo até o próximo deploy. Hoje isso não
  importa (nenhuma tela desta story usa formatação de tempo relativo via `useNow`/`useFormatter`
  com `now`), mas se uma story futura (DSM-10+) vier a usar tempo relativo (ex.: "cotação buscada há
  X minutos"), herdará silenciosamente uma data de build sempre desatualizada, sem erro nenhum —
  vale um comentário adicional ou revisitar quando essa necessidade aparecer.

## Achados

Nenhum achado bloqueante. Achados abaixo, ordenados por severidade (todos cosméticos/informativos):

1. **Cosmético — `web/app/layout.tsx:18`**: `now={new Date()}` calculado uma vez no build estático
   (ver acima). Sem impacto nos critérios de aceite desta story; risco só se materializa se uma
   story futura usar formatação de tempo relativo do `next-intl`. Sugestão: se/quando isso ocorrer,
   trocar para geração dinâmica (`export const dynamic = 'force-dynamic'` no layout, ou mover `now`
   para o componente que realmente precisa dele) ou documentar explicitamente a limitação.

2. **Cosmético/risco baixo — `web/hooks/use-search.ts:16-23`**: não há `AbortController` nem guarda
   de "resposta obsoleta" — se duas chamadas a `runSearch` estiverem em voo simultaneamente (ex.:
   `submit` seguido rapidamente de `retry`, ou dois cliques que escapem do `disabled` por qualquer
   motivo), a última Promise a resolver vence, não necessariamente a última requisição disparada;
   uma resposta antiga poderia sobrescrever o estado de uma busca mais nova. Na prática o risco é
   baixo porque `disabled={uiState.kind === 'loading'}` bloqueia o disparo de uma segunda busca via
   UI antes da primeira terminar, mas não é uma garantia estrutural (não há teste cobrindo
   corrida). Sugestão, se quiser fechar a lacuna: guardar um `requestId`/token no `lastParamsRef` (ou
   `AbortController`) e ignorar respostas cujo token não é o mais recente. Não é um requisito da
   spec nem das ACs — registro apenas como risco residual.

3. **Cosmético — `web/components/search/QuoteList.tsx:15-16`**: `key={index}` no `<li>`. Como cada
   item é derivado só das props (sem estado local, sem animação), não há bug funcional visível hoje,
   mas é um anti-padrão de React caso a lista ganhe estado interno ou reordenação futura. Sugestão:
   `key` composta (`${carrier}-${miles}-${taxesBrl}-${index}`) para robustez, sem urgência.

## Testes e lint

- `cd web && npm run lint` → **passou**, sem nenhum erro/warning reportado.
- `cd web && npx tsc --noEmit` → **passou**, sem erros de tipo.
- `cd web && npm test` (`vitest run`) → **passou**, `6 arquivos de teste / 27 testes, todos verdes`.
- `cd web && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build` → **passou** (`next build`
  com Turbopack, gera `/` como página estática). Rodado duas vezes: uma com o `layout.tsx` real
  (sucesso) e uma com os props `now`/`timeZone`/`formats` removidos temporariamente (falhou com o
  erro de config do `next-intl`, confirmando a necessidade do fix — arquivo restaurado
  imediatamente após, `git diff` limpo).
- Não rodei a stack completa (`docker compose up -d` + `api`/`web` `dev`) para validação manual
  ponta a ponta dos 5 estados reais — isso é o último item da "Sequência de implementação" da spec e
  fica a critério do desenvolvedor/QA antes do merge; a cobertura automatizada (unit + component +
  build) já demonstra que a lógica e a renderização estão corretas para os 6 critérios de aceite.

Gaps de cobertura: nenhum gap real encontrado contra o "Plano de testes" da spec — todos os
arquivos de teste previstos existem, e a contagem de casos bate (27 testes cobrindo os 5 arquivos +
`supported-airports.spec.ts`). Não há teste de cor/estilo (explicitamente fora de escopo pela
própria spec) nem teste de `origin === destination` (explicitamente fora de escopo da AC6, risco
aceito e documentado na spec).
