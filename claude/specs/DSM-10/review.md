# Review — DSM-10 — Estilização da lista de resultados (Tailwind v4)

## Veredito geral

**Aprovado.**

A implementação cumpre com precisão os cinco critérios de aceite da user story e segue à risca
as decisões de arquitetura registradas em `spec.md` (extração de `QuoteCard`, módulo puro de
formatação, badge decidido em `QuoteList`, ícone decorativo `aria-hidden`, testes que nunca
hardcodam string formatada). Lint e suíte de testes passam integralmente.

**Correção aplicada após a revisão:** o achado não bloqueante abaixo (mudanças em `SearchForm.tsx`/
`SearchPage.tsx` fora do escopo documentado por qualquer spec) foi resolvido revertendo os dois
arquivos, e o spec correspondente (`SearchForm.spec.tsx`), ao estado exato do commit `cbc5250`
(pré-DSM-10) — a spec da DSM-10 é explícita em restringir o escopo a `QuoteList.tsx` e
`PartialWarningBanner.tsx`, então a melhoria de "limpar erro ao digitar" fica para uma story própria
em vez de virar um adendo retroativo a uma spec já commitada. Lint e testes reconferidos após a
reversão (81 testes, 15 arquivos — 2 a menos que antes, referentes só ao comportamento revertido).

## Critérios de aceite (user-story.md)

| # | Critério | Status |
|---|---|---|
| 1 | Milhas com maior peso visual que companhia/taxa | **Atendido** — `QuoteCard.tsx:47-51`: milhas em `text-3xl font-bold`, rótulo "milhas" em `text-base font-normal text-slate-500`, companhia e taxa em `text-slate-600` sem destaque. |
| 2 | Ordem perceptível sem ler todos os itens (destaque "melhor oferta") | **Atendido** — `QuoteList.tsx:17` marca `isBestOffer={index === 0}`; `QuoteCard.tsx:34-44` aplica borda/fundo esmeralda + badge só no primeiro item, inclusive com lista de 1 item (`QuoteList.spec.tsx:20-26`). |
| 3 | Aviso de resultado parcial visível, entre form e lista, com estilo de "atenção" (não "erro") | **Atendido** — `PartialWarningBanner.tsx` mantém a posição (chamado em `SearchResultsPanel.tsx:27`, antes da `QuoteList`), usa `border-amber-300 bg-amber-50 text-amber-900` (distinto do `border-red-300 bg-red-50 text-red-900` do estado de erro em `SearchResultsPanel.tsx:41`) e adiciona `<span aria-hidden="true">⚠️</span>` como irmão do texto. |
| 4 | Classes utilitárias Tailwind, sem CSS inline ad-hoc | **Atendido** — nenhum `style={{...}}` encontrado em `QuoteCard.tsx`, `QuoteList.tsx`, `PartialWarningBanner.tsx`, `SearchResultsPanel.tsx`, `SearchForm.tsx`, `SearchPage.tsx` (`grep -n "style={{"`, sem resultados). |

## Achados

### Resolvido — Alterações em `SearchForm.tsx`/`SearchPage.tsx` fora do escopo documentado por qualquer spec

- **Arquivos:** `web/components/search/SearchForm.tsx`, `web/components/search/SearchPage.tsx`,
  `web/components/search/SearchForm.spec.tsx`.
- **O que estava errado:** `spec.md` da DSM-10 é explícito — "O que muda é só a apresentação de
  `web/components/search/QuoteList.tsx` e `web/components/search/PartialWarningBanner.tsx`"
  (linha 8-10) e a tabela "Arquivos alterados" (linhas 88-93) lista só `QuoteList.tsx`,
  `PartialWarningBanner.tsx`, `pt-BR.json` e `SearchResultsPanel.spec.tsx`. Ainda assim, o commit
  `653bc46` alterou `SearchForm.tsx` com um comportamento novo (limpar o erro do campo assim que
  ele é preenchido) e `SearchPage.tsx` (novo wrapper `<div className="max-w-sm">`), sem que isso
  estivesse previsto em `DSM-9/spec.md` (que criou `SearchForm.tsx`) nem em `DSM-10/spec.md`.
- **Correção aplicada:** os três arquivos foram revertidos ao estado exato do commit `cbc5250`
  (`git checkout cbc5250 -- <arquivos>`), removendo o comportamento e os 2 testes que o cobriam.
  A melhoria de UX (limpar erro ao digitar) fica para uma story própria, evitando tanto o desvio
  de escopo silencioso quanto um adendo retroativo à spec já commitada da DSM-10.

### Cosmético — Key de `QuoteList` diverge do "markup de referência" da spec

- **Arquivo:** `web/components/search/QuoteList.tsx:15`.
- **O que está errado:** a spec rotula o markup de `QuoteList.tsx` (linhas 185-204) como
  "estrutura exata a implementar" com `key={index}`, mas o código usa
  `key={\`${quote.carrier}-${quote.miles}-${quote.taxesBrl}-${index}\`}`. Isso é herdado do commit
  anterior `cbc5250` ("fix(DSM-9): usa key composta... para evitar anti-padrão de index") e é uma
  melhoria legítima, não um problema — sinalizando aqui só para registro, já que tecnicamente
  diverge do "exato" pedido pela spec sem essa divergência estar anotada em `DSM-10/spec.md`.
- **Sugestão objetiva:** nenhuma ação necessária; se quiser, adicionar uma nota de rodapé na spec
  reconhecendo a divergência proposital.

## Testes

- `cd web && npm run lint` → **passou** (eslint, exit 0, sem warnings/erros).
- `cd web && npx vitest run` → **passou** — 15 arquivos de teste, 83 testes, todos verdes.
- `cd web && npx tsc --noEmit` → **passou**, sem erros de tipo.
- Conferido manualmente que `formatCurrencyBrl`/`formatMiles` no teste (`number.spec.ts`) usam o
  mesmo non-breaking space (U+00A0) que `Intl.NumberFormat` produz de fato no ambiente de
  execução atual (Node local) — decisão de risco da spec (linha 67-75) validada na prática.
- Conferido que `SearchResultsPanel.spec.tsx` foi reescrito exatamente como o "Plano de testes"
  da spec descreve (diff linha a linha bate com `spec.md:283-293`).
- Gaps de cobertura para os critérios de aceite da DSM-10: nenhum identificado — `QuoteCard.spec.tsx`
  e `QuoteList.spec.tsx` cobrem badge presente/ausente por índice, lista vazia/1 item/2+ itens,
  valor de milhas e taxa formatados via `formatMiles`/`formatCurrencyBrl` (não hardcoded), e
  `number.spec.ts` cobre os casos de borda de formatação (`0`, valor com/sem centavos).
- Não foi feita validação manual via `docker compose`/`npm run dev` (fora do alcance desta
  revisão automatizada); a checagem cobriu lint, testes automatizados e leitura de código.

## Resumo

**Veredito geral: aprovado — 0 achados bloqueantes, 1 achado não bloqueante resolvido (escopo
não documentado em `SearchForm.tsx`/`SearchPage.tsx`, revertido), 1 achado cosmético sem ação
necessária (key de `QuoteList` diverge do markup "exato" da spec, mudança positiva).**
