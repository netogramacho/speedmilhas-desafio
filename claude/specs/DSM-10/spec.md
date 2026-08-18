# DSM-10 — Estilização da lista de resultados (Tailwind v4)

## Contexto

User story: `claude/specs/DSM-10/user-story.md`. Refina a tela de busca já funcional da DSM-9
(`web/components/search/`, `claude/specs/DSM-9/spec.md`) — os 5 estados de UI (`idle`/`loading`/
`success`/`partial`/`empty`/`error`) já existem e não mudam de comportamento nesta story. O que
muda é só a apresentação de `web/components/search/QuoteList.tsx` e
`web/components/search/PartialWarningBanner.tsx`: hierarquia visual do número de milhas, destaque
da melhor oferta, formatação numérica pt-BR e ícone de atenção no aviso parcial.

**Decisões tomadas pelo desenvolvedor (via coordenador — `AskUserQuestion` não estava disponível
nesta sessão do agente, os 5 pontos abaixo foram escalados antes de qualquer linha desta spec ser
escrita):**

1. **Hierarquia tipográfica das milhas:** separar valor e rótulo em nós de texto distintos (número
   grande, ex. `"18.500"`, + `"milhas"` como legenda menor ao lado) — não manter como string única
   interpolada. Aceita reestruturar a chave i18n de `search.quote.miles` e reescrever a asserção de
   `web/components/search/SearchResultsPanel.spec.tsx:31` que hoje faz
   `getByText('1000 milhas')`.
2. **Selo "melhor oferta":** badge de texto + destaque de cor no card (borda/fundo esmeralda),
   sempre no primeiro item da lista (`index === 0`), mesmo quando há um único resultado.
3. **Formatação numérica:** entra no escopo — milhas com `Intl.NumberFormat('pt-BR')` (separador de
   milhar) e taxas com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
4. **Ícone no aviso de "atenção" (parcial):** adicionar ícone unicode simples (`⚠️`), sem lib nova.
5. **Posição do banner parcial:** confirmada, sem mudança estrutural — já fica entre o formulário e
   a lista de cotações (`web/components/search/SearchResultsPanel.tsx:27-37`), não no rodapé. Único
   refino é o ícone do item 4.

## Arquitetura decidida

- **Extrair `QuoteCard` de `QuoteList`.** Hoje `QuoteList.tsx` (`web/components/search/QuoteList.tsx:10-24`)
  renderiza cada `<li>` inline. Com badge de melhor oferta + hierarquia tipográfica + formatação
  numérica, o item de lista ganha complexidade própria o suficiente para virar componente
  dedicado, testável isoladamente (badge presente/ausente por índice) sem precisar montar a lista
  inteira. `QuoteList` passa a só mapear `quotes` para `<QuoteCard isBestOffer={index === 0} />`,
  sem saber de formatação ou estilo do card.
- **Funções puras de formatação num módulo próprio, fora de `lib/search/`.** `formatMiles`/
  `formatCurrencyBrl` não são específicas de busca — são utilidades de apresentação de número que
  poderiam ser reaproveitadas por outra tela (ex. confirmação de pedido, fora de escopo aqui). Vão
  para `web/lib/format/number.ts`, sem import de React, mesmo padrão de função pura testável já
  usado em `web/lib/search/derive-ui-state.ts` (e no lado da API, `sort-quotes.ts`).
- **`Intl.NumberFormat` instanciado uma vez por formatter (module-level), não por chamada** —
  `new Intl.NumberFormat(...)` é custoso o suficiente para não recriar em todo render; os dois
  formatters (`milesFormatter`, `currencyFormatter`) vivem como constantes de módulo em
  `web/lib/format/number.ts`, `formatMiles`/`formatCurrencyBrl` só chamam `.format(valor)`.
- **A palavra "milhas" continua vindo de `next-intl` (`search.quote.milesLabel`), nunca hardcoded
  no JSX** — mantém a regra do item 15 de `parametros-tecnicos.md`. Só o *valor numérico já
  formatado* (que não é texto traduzível, é dado) é produzido fora do `next-intl`, pela função pura
  de `web/lib/format/number.ts`, e passado como variável de interpolação para a chave `taxes`
  (`t('taxes', { taxes: formatCurrencyBrl(quote.taxesBrl) })`) — a chave de mensagem não hardcoda
  mais o símbolo `"R$"` (isso já vem embutido no valor formatado pela opção `style: 'currency'`),
  evita duplicar o símbolo.
- **Badge "melhor oferta" é responsabilidade de `QuoteList` decidir (`index === 0`), não de
  `QuoteCard` nem de `SearchResultsPanel`.** A ordenação por milhas asc já vem pronta do backend
  (`api/src/domain/search/sort-quotes.ts:9`, `DSM-4`) e não é reordenada no front (mesma decisão da
  DSM-9, `claude/specs/DSM-9/spec.md` linha final da tabela de riscos) — `QuoteList` só sabe que
  "primeiro elemento do array = melhor oferta", sem repetir lógica de comparação de milhas no
  front.
- **Ícone do aviso parcial é decorativo (`aria-hidden="true"`), sem chave de mensagem própria.** O
  texto ao lado (`search.states.partialWarning`) já comunica o significado para leitor de tela; um
  `aria-label` redundante no ícone duplicaria a mesma informação. Ícone e texto ficam em `<span>`
  irmãos dentro do mesmo `<p>`, não um dentro do outro — preserva a asserção existente
  `getByText('Nem todos os fornecedores responderam a tempo.')`
  (`web/components/search/SearchResultsPanel.spec.tsx:46`), que continua batendo num elemento cujo
  texto é exatamente essa frase, sem o ícone misturado no mesmo nó.
- **Testes de valor formatado nunca hardcodam a string esperada — chamam a mesma função de
  formatação para construir o valor esperado.** Risco identificado na investigação: a saída exata
  de `Intl.NumberFormat('pt-BR', { style: 'currency', ... })` pode usar espaço normal ou
  non-breaking space (` `) entre `"R$"` e o número, dependendo da versão do Node/ICU
  disponível no ambiente de execução dos testes — hardcodar `"R$ 50,00"` literal no teste é frágil
  a essa variação. Testes que verificam texto formatado (`QuoteCard.spec.tsx`,
  `SearchResultsPanel.spec.tsx`) usam `formatCurrencyBrl`/`formatMiles` importados de
  `web/lib/format/number.ts` para montar a string esperada, não um literal digitado à mão (exceto
  em `number.spec.ts`, que testa a própria função e por isso precisa do literal para ter valor).

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `web/lib/format/number.ts` | Funções puras `formatMiles(miles: number): string` (`Intl.NumberFormat('pt-BR')`) e `formatCurrencyBrl(valueBrl: number): string` (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`). Formatters instanciados uma vez, no nível do módulo. Sem import de React. |
| `web/components/search/QuoteCard.tsx` | `'use client'`. Renderiza um único `<li>` de cotação: badge "melhor oferta" (só se `isBestOffer`), valor de milhas em destaque + rótulo "milhas" em legenda menor, companhia aérea, taxa formatada em BRL. Estilo do card muda conforme `isBestOffer` (borda/fundo esmeralda vs. cinza padrão). |

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `web/components/search/QuoteList.tsx` | Deixa de renderizar `<li>` inline; passa a mapear `quotes` para `<QuoteCard key={index} quote={quote} isBestOffer={index === 0} />`. Remove o `useTranslations` que não é mais usado aqui (a tradução migra para `QuoteCard`). |
| `web/components/search/PartialWarningBanner.tsx` | Adiciona `<span aria-hidden="true">⚠️</span>` como irmão do `<span>` que já envolve `t('states.partialWarning')`, dentro do mesmo `<p className="flex items-start gap-2">`. Nenhuma outra mudança estrutural (posição do banner confirmada, decisão nº5). |
| `web/messages/pt-BR.json` | `search.quote`: remove a chave `miles` (string única interpolada); adiciona `milesLabel: "milhas"` e `bestOffer: "Melhor oferta"`; `taxes` passa de `"+ R$ {taxes} de taxas"` para `"+ {taxes} de taxas"` (o símbolo de moeda já vem embutido no valor formatado por `formatCurrencyBrl`, evita duplicar `"R$"`). |
| `web/components/search/SearchResultsPanel.spec.tsx` | Reescreve as duas ocorrências de `getByText('1000 milhas')` (linhas 31 e 48 do arquivo atual) — ver "Plano de testes" para o texto exato de cada asserção nova. |

Nenhum arquivo de `api/` é alterado por esta story — puramente apresentação no `web/`.

## Contratos de dados

```ts
// web/lib/format/number.ts
export function formatMiles(miles: number): string;
// Intl.NumberFormat('pt-BR').format(miles) — ex.: 18500 → "18.500".

export function formatCurrencyBrl(valueBrl: number): string;
// Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueBrl)
// — ex.: 75.51 → "R$ 75,51".
```

```ts
// web/components/search/QuoteCard.tsx
export interface QuoteCardProps {
  quote: SearchResponseQuote; // { miles: number; taxesBrl: number; carrier: string }
  isBestOffer: boolean;
}
```

```ts
// web/components/search/QuoteList.tsx — assinatura inalterada
export interface QuoteListProps {
  quotes: SearchResponseQuote[];
}
```

Trecho de `web/messages/pt-BR.json` após a alteração (só a subseção `search.quote`, resto do
arquivo inalterado):

```json
{
  "search": {
    "quote": {
      "milesLabel": "milhas",
      "taxes": "+ {taxes} de taxas",
      "carrier": "Companhia: {carrier}",
      "bestOffer": "Melhor oferta"
    }
  }
}
```

Markup de referência de `QuoteCard.tsx` (estrutura exata a implementar):

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { SearchResponseQuote } from '@/lib/search/api';
import { formatCurrencyBrl, formatMiles } from '@/lib/format/number';

export interface QuoteCardProps {
  quote: SearchResponseQuote;
  isBestOffer: boolean;
}

export function QuoteCard({ quote, isBestOffer }: QuoteCardProps) {
  const t = useTranslations('search.quote');

  return (
    <li
      className={
        isBestOffer
          ? 'rounded-md border-2 border-emerald-400 bg-emerald-50 p-4'
          : 'rounded-md border border-slate-200 p-4'
      }
    >
      {isBestOffer && (
        <span className="mb-2 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
          {t('bestOffer')}
        </span>
      )}
      <p className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-slate-900">{formatMiles(quote.miles)}</span>
        <span className="text-base font-normal text-slate-500">{t('milesLabel')}</span>
      </p>
      <p className="mt-1 text-slate-600">{t('carrier', { carrier: quote.carrier })}</p>
      <p className="text-slate-600">
        {t('taxes', { taxes: formatCurrencyBrl(quote.taxesBrl) })}
      </p>
    </li>
  );
}
```

Markup de referência de `QuoteList.tsx` após a alteração:

```tsx
'use client';

import type { SearchResponseQuote } from '@/lib/search/api';
import { QuoteCard } from './QuoteCard';

export interface QuoteListProps {
  quotes: SearchResponseQuote[];
}

export function QuoteList({ quotes }: QuoteListProps) {
  return (
    <ul className="mt-4 space-y-3">
      {quotes.map((quote, index) => (
        <QuoteCard key={index} quote={quote} isBestOffer={index === 0} />
      ))}
    </ul>
  );
}
```

Trecho de referência do `<p>` alterado em `PartialWarningBanner.tsx`:

```tsx
<p className="flex items-start gap-2">
  <span aria-hidden="true">⚠️</span>
  <span>{t('states.partialWarning')}</span>
</p>
```

## Sequência de implementação

- [ ] Criar `web/lib/format/number.ts` (`formatMiles`, `formatCurrencyBrl`) e
      `web/lib/format/number.spec.ts`.
- [ ] Atualizar `web/messages/pt-BR.json` (`search.quote`: remover `miles`, adicionar
      `milesLabel` e `bestOffer`, ajustar `taxes`).
- [ ] Criar `web/components/search/QuoteCard.tsx` conforme markup de referência.
- [ ] Criar `web/components/search/QuoteCard.spec.tsx`.
- [ ] Alterar `web/components/search/QuoteList.tsx` para delegar a `QuoteCard`.
- [ ] Criar `web/components/search/QuoteList.spec.tsx`.
- [ ] Alterar `web/components/search/PartialWarningBanner.tsx` (ícone).
- [ ] Atualizar `web/components/search/SearchResultsPanel.spec.tsx` (asserções que hoje fazem
      `getByText('1000 milhas')` — ver "Plano de testes" para o texto exato).
- [ ] Rodar `cd web && npm run lint` e `cd web && npm test` antes de considerar a story pronta.
- [ ] Validação manual: `docker compose up -d`, `cd api && npm run start:dev`,
      `cd web && npm run dev`, conferir visualmente: card do primeiro resultado com badge/borda
      esmeralda, milhas em destaque tipográfico nos demais cards, taxas formatadas em BRL com
      vírgula, aviso parcial com ícone `⚠️` (forçar via `POST /admin/force-slow` no mock para ver
      o estado parcial).
- [ ] Commit: `feat(DSM-10): hierarquia visual e destaque de melhor oferta na lista de cotações`.

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| Lista com um único resultado (AC2, decisão nº2) | Badge "Melhor oferta" aparece mesmo assim — `isBestOffer={index === 0}` não depende de `quotes.length > 1`. |
| Lista com `quotes: []` (estado `partial` vazio, `empty`) | `QuoteList`/`QuoteCard` não são renderizados — nenhum badge, nenhuma formatação a aplicar; comportamento herdado da DSM-9, inalterado. |
| Empate de milhas entre o 1º e o 2º item (desempatado por `taxesBrl` asc no backend, `sort-quotes.ts:9`) | Badge continua só no índice 0 do array já ordenado — não há lógica de "empate visual" a tratar no front, a ordenação (incluindo desempate) já veio pronta do backend. |
| Formatação de `taxesBrl = 0` | `formatCurrencyBrl(0)` → `"R$ 0,00"` — `Intl.NumberFormat` cobre esse caso sem tratamento especial; não há valor negativo possível (`taxesBrl` validado com `min: 0` no backend, `api/src/presentation/orders/dto/quote.dto.ts`). |
| Espaço non-breaking (` `) na saída de `Intl.NumberFormat` com `style: 'currency'`, variável por versão de Node/ICU | Testes nunca hardcodam a string formatada esperada — constroem o valor esperado chamando `formatCurrencyBrl`/`formatMiles` (mesma função usada em produção), evitando dependência da representação exata de espaço/pontuação do ambiente de execução. |
| Texto do ícone `⚠️` sendo lido por leitor de tela em duplicidade com o texto do aviso | `aria-hidden="true"` no `<span>` do ícone — leitor de tela ignora o glifo, lê só o texto de `search.states.partialWarning`. |
| Regra "nenhum texto solto no JSX" (item 15, `parametros-tecnicos.md`) | Preservada — `"milhas"` e `"Melhor oferta"` são chaves novas em `messages/pt-BR.json` (`milesLabel`, `bestOffer`), não strings hardcoded; só o *valor numérico* já formatado (não é texto traduzível) vem de fora do `next-intl`. |
| Teste existente `SearchResultsPanel.spec.tsx:31`/`:48` (`getByText('1000 milhas')`) quebra com a mudança de markup | Esperado e aceito pela decisão nº1 — reescrito como parte desta story (ver "Plano de testes"), não é edição retroativa de spec/user-story de outra DSM já commitada, é evolução normal do teste do componente que a própria DSM-9 já previu como fora do seu escopo. |
| `PartialWarningBanner.spec` (asserção `getByText('Nem todos os fornecedores responderam a tempo.')`, `SearchResultsPanel.spec.tsx:46`) | Preservada sem alteração — o ícone fica em `<span>` irmão, não envolve o texto, o nó de texto original continua intacto. |

## Plano de testes

Todos os testes usam Vitest + Testing Library, colocados junto do arquivo testado, sem chamada de
rede real (mesmo padrão da DSM-9).

**`web/lib/format/number.spec.ts`** (função pura, sem mock, únicos literais hardcoded do plano —
é o teste que define o contrato de formatação para todo o resto)
- `formatMiles(1000)` → `'1.000'`.
- `formatMiles(18500)` → `'18.500'`.
- `formatMiles(0)` → `'0'`.
- `formatCurrencyBrl(75.51)` → `'R$ 75,51'`.
- `formatCurrencyBrl(50)` → `'R$ 50,00'`.
- `formatCurrencyBrl(0)` → `'R$ 0,00'`.

**`web/components/search/QuoteCard.spec.tsx`** (`renderWithIntl`)
- `isBestOffer: true` → badge com texto `search.quote.bestOffer` ("Melhor oferta") visível.
- `isBestOffer: false` → badge **não** presente (`queryByText('Melhor oferta')` retorna `null`).
- Valor de milhas renderizado é `formatMiles(quote.miles)` (construir o esperado chamando a
  função, não hardcoded) e o rótulo `"milhas"` aparece como texto separado (nó de texto distinto
  do valor numérico).
- Taxa renderizada contém `formatCurrencyBrl(quote.taxesBrl)` (idem, valor esperado construído via
  função).
- Companhia aérea (`quote.carrier`) visível via `search.quote.carrier`.

**`web/components/search/QuoteList.spec.tsx`** (novo arquivo, `renderWithIntl`, sem mock)
- Lista com 2+ cotações → só o primeiro `<li>` (ordem do array, sem reordenar) contém o badge
  "Melhor oferta"; os demais não.
- Lista com 1 cotação → o único item tem o badge (decisão nº2).
- Lista vazia (`quotes: []`) → nenhum `<li>` renderizado.

**`web/components/search/SearchResultsPanel.spec.tsx`** (reescrever as asserções afetadas,
mantendo a estrutura e os demais casos já cobertos pela DSM-9 — ver
`claude/specs/DSM-9/spec.md`, "Plano de testes")
- Caso `success` (hoje linha 23–35): trocar
  `expect(screen.getByText('1000 milhas')).toBeInTheDocument();` por
  ```ts
  expect(screen.getByText(formatMiles(1000))).toBeInTheDocument();
  expect(screen.getByText('milhas')).toBeInTheDocument();
  expect(screen.getByText('Melhor oferta')).toBeInTheDocument();
  ```
  (import `formatMiles` de `@/lib/format/number` no topo do arquivo de teste).
- Caso `partial com cotações` (hoje linha 37–49): mesma troca de
  `getByText('1000 milhas')` por `getByText(formatMiles(1000))` — sem alterar o restante das
  asserções desse caso (aviso de parcial, nome do fornecedor faltante).
- Demais casos (`idle`, `loading`, `partial` vazio, `empty`, `error`) inalterados — não usam texto
  de milhas formatado.

Fora do escopo de teste desta story: qualquer verificação de valor exato de classe CSS/Tailwind
(cor hexadecimal, breakpoint) além da presença/ausência de conteúdo (badge, texto formatado);
teste end-to-end de UI real (Playwright/Cypress) continua fora do escopo do desafio, só a
validação manual listada em "Sequência de implementação".
