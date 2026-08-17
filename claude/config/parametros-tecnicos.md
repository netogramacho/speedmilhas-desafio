# Parâmetros técnicos — Desafio Speed Milhas

Este arquivo é a referência técnica compartilhada pelos agentes (`pm-especialista`,
`arquiteto-solucoes`, `desenvolvedor-software`, `revisor-codigo`) ao longo das 14 stories em
`claude/specs/DSM-*`. Decisões aqui já foram fechadas com o autor do desafio — não reabrir sem
motivo forte; se um trade-off novo aparecer durante uma story específica, ele é resolvido pelo
`arquiteto-solucoes` daquela story, registrado na spec, e (se for uma simplificação de escopo)
também em `DECISIONS.md`.

---

## 1. Stack (fixo pelo desafio)

- **API:** NestJS 11 + Prisma 7 (Postgres) + TypeScript, Node ≥ 20 (LTS 24 recomendado).
- **Web:** Next.js 16 + React 19 + Tailwind v4 (já configurado, não precisa init).
- **Infra:** `docker-compose` sobe só Postgres (5432) e `mock-suppliers` (4000). `api` e `web`
  rodam via `npm` no host, fora do Docker.
- **Não alterar `mock-suppliers/`** — é o enunciado do desafio.

---

## 2. Cliente HTTP para os fornecedores (DSM-1/2/3)

**Decisão: `@nestjs/axios` (`HttpModule`).**

- Erros HTTP (4xx/5xx) já chegam como exceção (`AxiosError`), sem checar `response.ok` manualmente
  em cada client.
- Timeout por chamada configurado na própria request do axios.
- Nos testes unitários, mockar `HttpService` via DI do Nest (não `global.fetch`).
- Cada um dos 3 clients (A/B/C) fica responsável por: montar a chamada no formato do fornecedor,
  tratar timeout/erro HTTP como retorno de falha (nunca lançar exceção não tratada para quem
  chamou), e normalizar o payload de sucesso para o formato interno único de cotação.

**Timeout individual: `5000ms`, configurável via env (`SUPPLIER_TIMEOUT_MS`).** Não vem do
README — o desafio só fixa o teto global de 6s (DSM-4); o timeout por chamada individual, exigido
já no critério de aceite da DSM-1/2/3, é decisão nossa. 5s cobre quase toda a faixa normal do
fornecedor B (1–5s) sem gerar falso timeout em resposta legítima lenta; o teto global de 6s
continua sendo o limite real que protege o usuário.

**Fornecedor B — 429/`Retry-After`: respeitar e tentar 1x, se sobrar orçamento de tempo.**
Também não vem do README (que só descreve o comportamento do mock, não como reagir). Diferente da
política geral de "sem retry automático" (que vale para erro 500 de qualquer fornecedor — decisão
da DSM-1, registrar em `DECISIONS.md`): 429 não é falha do fornecedor, é sinal de "espera e tenta
de novo". Ao receber 429, esperar `min(Retry-After, orçamento de tempo restante do timeout de
5000ms)` e tentar a chamada mais uma vez; se não sobrar orçamento suficiente, tratar como falha
desse fornecedor sem nova tentativa. É um retry único, específico do 429 de B — não generalizar
para os outros fornecedores nem para outros códigos de erro.

## 3. Timeout individual + teto global de 6s + circuit breaker (DSM-4, DSM-12)

**Decisão: implementação na mão, sem lib de resiliência (nada de `cockatiel`/`p-timeout`/`opossum`).**

Motivo: o teto global de 6s é uma composição específica deste desafio que nenhuma lib resolve
pronta — sempre haveria uma camada própria por cima. E como o autor pretende perseguir o bônus de
circuit breaker (DSM-12) e precisa conseguir explicar a decisão na entrevista (pergunta 1 do
`DECISIONS.md`), código que ele mesmo escreveu e entende vale mais do que a API de uma lib nova
configurada sob pressão de tempo.

- Timeout por fornecedor: `AbortController`/timeout do axios por chamada individual (`5000ms`,
  item 2 acima).
- Teto global: `Promise.allSettled` nas três chamadas + corrida contra um timer de `6000ms`
  (env `SEARCH_TOTAL_TIMEOUT_MS`) via `Promise.race` ou equivalente — o que não respondeu a tempo
  é tratado como timeout, não trava a resposta.
- Circuit breaker (se o bônus DSM-12 for feito): máquina de estados simples —
  `fechado → normal` / `aberto → para de chamar por N ms após K falhas seguidas` /
  `meio-aberto → deixa uma chamada de teste passar`. Sem dependência externa.

## 4. Idempotência de `POST /orders` entre instâncias (DSM-6/7/8, RF2)

**Decisão: constraint única no banco + catch de conflito**, não advisory lock.

- Coluna `idempotencyKey` com `@unique` no Prisma (nível de banco, não só validação em código —
  é literalmente o critério de aceite da DSM-6).
- Segunda inserção concorrente com a mesma chave falha na constraint; quem recebe o erro de
  conflito busca o registro já existente e devolve a mesma resposta da primeira.
- Estado explícito do pedido (`PENDING`/`CONFIRMED` ou equivalente) para diferenciar "já em
  andamento por outra requisição concorrente" de "já concluído" — exigido pela própria DSM-6,
  independe de qual mecanismo de lock for usado.
- Precisa funcionar com duas instâncias da API (portas diferentes) apontando pro mesmo Postgres —
  a garantia vem do banco, nunca de estado em memória do processo.

## 5. Logging estruturado

**Decisão: `nestjs-pino`.**

- Usado desde já para logs da API (não só se o bônus DSM-14 for feito) — já sai estruturado em
  JSON, incluindo por chamada a fornecedor (sucesso/falha/timeout/latência).
- Se DSM-14 for perseguida depois, é configuração incremental em cima do que já existe, não uma
  troca de biblioteca.

## 6. Configuração / variáveis de ambiente

**Decisão: `@nestjs/config` (`ConfigModule`)**, substituindo o `dotenv` solto em `src/main.ts`.

- Validação de schema das env vars na inicialização (`DATABASE_URL`, `SUPPLIERS_BASE_URL`, `PORT`
  etc.) — falha rápido e com mensagem clara se faltar alguma, em vez de `undefined` silencioso
  propagando pro runtime.
- Acesso via `ConfigService` injetado, não `process.env` direto nos providers.

## 7. Frontend — busca de dados (RF3)

**Decisão: `fetch` nativo + `useState`/`useEffect`** (ou equivalente em Server/Client Component do
App Router), sem SWR/React Query.

- Escopo é uma tela, um formulário, uma chamada sob demanda a `POST /search` — cache e
  revalidação automática de SWR/React Query não têm uso claro aqui (o bônus de cache, DSM-11,
  ficou de fora por ora; se entrar depois, é cache no backend, não no cliente).
- Estados de UI a modelar explicitamente (além de loading/erro/sucesso): **resultado parcial**
  (`status: "partial"` com indicação de quais fornecedores responderam) e **vazio** — ver DSM-9.

## 8. Qualidade de código

**Decisão: ESLint + Prettier, presets oficiais do Nest (API) e do Next (Web).**

- **Timing e alocação:** não é uma DSM numerada nem faz parte do bônus DSM-14 (que cobre só log
  estruturado + paginação, sem relação com lint). Resolvido como pré-requisito de infra, decidido
  com o desenvolvedor durante a implementação da DSM-1 (o esqueleto não trazia lint configurado e
  `npm run lint` falhava com "Missing script"): feito **agora**, bloqueando o início da DSM-2, spec
  dedicada em `claude/specs/infra-lint/spec.md`.
- Presets oficiais do Nest (API) e do Next (Web) — setup mínimo, sem regras customizadas além do
  preset.
- TypeScript: manter `strict`-like já configurado (`web` já está com `strict: true`; `api` está
  com `strictNullChecks` ligado e `noImplicitAny` desligado — não apertar isso por conta própria
  sem alinhar, é uma escolha deliberada do esqueleto; por isso o preset de lint da API mantém
  `@typescript-eslint/no-explicit-any: 'off'`, para não ficar mais rígido que o `tsconfig`).
- `desenvolvedor-software` roda lint antes de considerar uma story pronta (valendo a partir da
  DSM-2 em diante — a DSM-1 foi implementada antes deste setup existir; o retrofit do lint sobre o
  código já escrito da DSM-1 faz parte da própria `claude/specs/infra-lint/spec.md`);
  `revisor-codigo` roda lint + testes como parte da checagem, não só leitura de código.

## 9. Bônus (DSM-11 a DSM-14)

**Status: nenhum comprometido agora — decisão fica para depois do RF1–RF5 obrigatório estar
completo e testado.** Prioridade se houver tempo sobrando nos 7 dias corridos:

1. DSM-12 (circuit breaker) — reforça diretamente o que o desafio mais avalia (resiliência a
   fornecedor instável), e a decisão de implementação (na mão, item 3 acima) já está tomada.
2. DSM-13 (teste de falha parcial) — barato de fazer em cima da DSM-4 já pronta, reduz risco de
   regressão.
3. DSM-11 (cache) e DSM-14 (log estruturado + paginação) — menor urgência; o log estruturado já
   vem de graça pelo `nestjs-pino` (item 5), então DSM-14 reduz a "paginação" como único item
   realmente pendente se for feita.

Se algum bônus for cortado por tempo, registrar em `DECISIONS.md` (seção de escopo) o que ficou
faltando e como seria feito — o desafio pontua isso a favor.

## 10. Estrutura de módulos (camadas globais, regra fixa)

**Decisão revista em 2026-08-17** (substitui a versão anterior, que organizava só por domínio
dentro de `src/`, com a separação de camada valendo apenas pela convenção de import do item 16).
Motivo da revisão: módulos de domínio cresceram e viraram uma pasta única misturando tipo de
dado, função pura, client HTTP, controller e DTO no mesmo nível (`search/` chegou a 19 arquivos
soltos) — difícil de navegar e a fronteira de camada só existia na cabeça de quem escreveu o
código, não na estrutura de arquivos.

Camada explícita no topo de `api/src/`, feature organizada dentro de cada camada:

```
src/
  domain/            # regras de negócio puras — sem import de @nestjs/*, axios, @prisma/client
    suppliers/
      types.ts                        # Quote, SupplierId, SupplierQuoteResult (contrato único)
      supplier-a/
        supplier-a.types.ts           # payload cru do fornecedor (shape de dado, sem framework)
        supplier-a.normalizer.ts      # função pura: payload cru → Quote[]
      supplier-b/
      supplier-c/
    search/
      types.ts                        # AggregatedSearchResult, SupplierOutcome
      sort-quotes.ts                  # ranking (função pura)
      race-against-deadline.ts        # corrida contra timeout (função pura)
    orders/                           # DSM-6/7 — regras de idempotência puras
  infrastructure/    # adapta o domínio a infra externa (HTTP, banco) + orquestração que injeta
                      # outros providers de infra via DI do Nest
    suppliers/
      suppliers-http.module.ts
      supplier-a/
        supplier-a.client.ts          # chamada HTTP real ao fornecedor A
        supplier-a.module.ts
      supplier-b/
      supplier-c/
    search/
      search-aggregator.service.ts    # orquestra os 3 clients + timeout global
      search.module.ts
    orders/                           # DSM-6/7 — repositório Prisma
  presentation/       # contrato HTTP público — controllers, DTOs, mappers de resposta
    search/
      search.controller.ts
      search-response.mapper.ts
      supported-airports.ts
      dto/
        search-request.dto.ts
        search-response.dto.ts
        validators/
          is-different-from.validator.ts
          is-valid-calendar-date.validator.ts
    orders/                           # DSM-6/7 — controller + dto
  common/              # cross-cutting, fora das três camadas: filtro de exceção global,
                        # validação genérica, config/env
  app.module.ts
  main.ts
```

Regra de posicionamento por tipo de arquivo:
- **Tipo/interface sem import de framework** (mesmo que descreva um payload externo, ex.
  `supplier-a.types.ts`) → `domain/<feature>/`. Quem "dono" do tipo é quem o transforma
  (normalizer); o client de infra importa o tipo do domínio, nunca o contrário.
- **Função pura de regra de negócio** (normalização, ranking, cálculo de deadline/corrida) →
  `domain/<feature>/`.
- **`*.client.ts`/`*.repository.ts`** (fala com fornecedor/banco real) → `infrastructure/<feature>/`.
- **Serviço `@Injectable()` que orquestra múltiplos providers de infra** (ex.
  `SearchAggregatorService`, que injeta os 3 clients) → `infrastructure/<feature>/`, mesmo tendo
  alguma lógica de coordenação — DI do Nest e dependência direta de outros providers de infra o
  desqualificam como domínio puro (item 16 continua valendo: domínio nunca importa infra).
- **`*.module.ts`** → `infrastructure/<feature>/` (wiring de DI do Nest, framework-específico);
  pode importar e registrar controllers de `presentation/` e providers de `infrastructure/`/
  `domain/` — módulo é o único lugar autorizado a atravessar as três camadas (ponto de composição).
- **`*.controller.ts`, `*.dto.ts`, mapper que traduz para o formato de resposta HTTP** →
  `presentation/<feature>/`. `*.e2e-spec.ts` fica junto do controller que testa.
- Cross-cutting de toda a API continua em `common/`, fora das três camadas.

Direção de dependência (mantida do item 16): `domain` não importa nada de `infrastructure`/
`presentation`; `infrastructure` pode importar `domain`; `presentation` pode importar `domain` e
`infrastructure` (via módulo).

**Aplica-se retroativamente** — DSM-1 a DSM-5 foram migradas para esta estrutura (mesma
funcionalidade, sem mudança de comportamento, só reorganização de arquivo + ajuste de imports);
DSM-6 em diante já nasce nela.

- DTOs de entrada validados com `class-validator`/`class-transformer` + `ValidationPipe` global —
  padrão Nest, sem necessidade de lib alternativa.
- Resposta de erro padronizada via exception filter global (formato único de erro 400/404/500 em
  toda a API).

## 11. Testes

- **Unitários** (`*.spec.ts`, colocados junto do arquivo testado): mockam `HttpService`
  (`@nestjs/axios`) — sem chamada de rede real. Cobrem normalização de cada fornecedor, tratamento
  de erro/timeout isolado, lógica de agregação e regras de idempotência.
- **Integração/concorrência** (DSM-8, obrigatório RF4): sobem a aplicação real contra o Postgres
  real do `docker-compose`, sem mockar controller nem persistência — dispara as duas requisições
  de verdade via `Promise.all`. Se cobrir duas instâncias completas (portas diferentes) não for
  viável de automatizar no tempo disponível, documentar a limitação e a validação manual em
  `DECISIONS.md` (é uma saída prevista no próprio critério de aceite da DSM-8).
- Testes de concorrência devem passar de forma consistente em execuções repetidas (não flaky) —
  não depender de timing coincidental.

## 12. Ordem de execução das stories

Grafo de dependências entre as DSM (obrigatórias primeiro):

```
infra-lint (ESLint + Prettier, pré-requisito de infra, sem número de DSM)
        ↓
DSM-1, DSM-2, DSM-3  (independentes entre si, podem ser paralelas)
        ↓
      DSM-4 (agregação — depende das 3 normalizações)
        ↓
      DSM-5 (endpoint POST /search)
        ↓
      DSM-9 (estados de UI)
        ↓
      DSM-10 (estilização)

DSM-6 (schema Prisma)
        ↓
      DSM-7 (endpoint POST /orders)
        ↓
      DSM-8 (teste de concorrência — obrigatório, RF4)
```

`infra-lint` foi decidida durante a implementação da DSM-1 (já concluída antes do setup de lint
existir) e bloqueia o início da DSM-2 — ver `claude/specs/infra-lint/spec.md`. DSM-6/7/8 (RF2) não
dependem de DSM-1–5/9/10 (RF1) — podem ser feitas em qualquer ordem relativa entre os dois blocos,
ou em paralelo se houver mais de um agente trabalhando. Bônus (DSM-11 a 14) só depois do bloco
obrigatório completo (item 9).

## 13. Pré-requisitos para rodar os testes

`docker compose up -d` (Postgres + `mock-suppliers`) precisa estar de pé e saudável
(`curl http://localhost:4000/health`) antes de `cd api && npm test` — os testes de DSM-4/5/8 batem
em serviços reais, não mockam a rede nem a persistência nesses casos (item 11).

## 14. Commits

Commits pequenos e frequentes ao longo das stories (pedido explícito do desafio), preferencialmente
um ou poucos commits por DSM concluída, mensagem indicando a story (ex.:
`feat(DSM-1): client e normalizador do fornecedor A`).

## 15. Internacionalização (i18n) — estrutura desde o início

**Decisão: nenhum texto visível ao usuário fica hardcoded como string solta no meio do código**,
mesmo que este desafio só entregue pt-BR — a estrutura de tradução é preparada desde a primeira
story que toca texto, para não virar retrabalho se um segundo idioma for pedido depois.

- **Web (Next.js)**: usar `next-intl`, com mensagens em arquivo por locale
  (`messages/pt-BR.json` como único locale por ora), acessadas por chave
  (ex.: `t('search.emptyState')`) — nunca texto solto direto no JSX. Vale a partir da primeira
  tela com texto (DSM-9/10).
- **API (NestJS)**: respostas de erro/validação expostas ao cliente carregam um código/chave
  estável no corpo (ex.: `SUPPLIER_TIMEOUT`, `ORDER_ALREADY_EXISTS`), não apenas uma frase fixa em
  português — quem traduz para o usuário final é o frontend a partir da chave, a API não decide o
  idioma da mensagem.
- Não é necessário implementar múltiplos idiomas de fato neste desafio — o requisito é a
  *estrutura* (chaves/mensagens externalizadas), não a tradução em si.

## 16. Arquitetura limpa no backend

**Decisão: camadas internas (regras de negócio) nunca dependem de camadas externas
(framework/infra).** A direção de dependência é sempre de fora para dentro.

- **Lógica de domínio/negócio** (normalizadores, regras de agregação/ranking, validações,
  cálculo de idempotência etc.) é escrita como funções/classes puras, sem import de
  `@nestjs/*`, `axios`, `@prisma/client` ou qualquer tipo específico de infraestrutura — recebe e
  devolve tipos próprios do domínio (ex.: `Quote`, `SupplierQuoteResult` em
  `suppliers/types.ts`). É testável sem DI, sem mock de framework, só com dados de entrada e
  saída esperada. O normalizador da DSM-1 (`supplier-a.normalizer.ts`) já segue esse padrão — é
  a referência a repetir nas próximas stories.
- **Infraestrutura** (clients HTTP, repositórios Prisma, controllers, DTOs de transporte) depende
  do domínio (importa os tipos/contratos do domínio), nunca o contrário. Quem decide o formato dos
  dados é a camada interna; a camada externa se adapta a ele, não o inverso.
- Na prática dentro de `api/src/`: arquivos de `*.normalizer.ts`, regras de agregação e cálculo de
  ranking não importam `HttpService`, `PrismaClient` nem decorators de infraestrutura. Arquivos de
  `*.client.ts`/`*.repository.ts`/`*.controller.ts` podem importar o domínio, mas o domínio nunca
  importa eles.
- Desde a revisão do item 10 (2026-08-17), essa regra de dependência é explícita na própria
  estrutura de pastas (`domain/`/`infrastructure`/`presentation` no topo de `src/`), não só uma
  convenção de import a seguir de memória — ver item 10 para a árvore completa e o critério de
  posicionamento por tipo de arquivo.

## 17. Frontend — hooks separados de componentes

**Decisão: lógica e estado ficam em arquivos diferentes.** Todo hook customizado usado por um
componente vive no seu próprio arquivo (`use-nome-do-hook.ts`), separado do arquivo do componente
(`NomeDoComponente.tsx`) que o consome.

- **Hook** (`use*.ts`): carrega a lógica — chamadas a `POST /search`/`POST /orders`, transformação
  de resposta, regras de quando mostrar cada estado de UI (loading/erro/parcial/vazio/sucesso, ver
  item 7). Testável isoladamente, sem renderizar nenhum componente (ex.: `@testing-library/react`
  `renderHook`, ou teste puro se o hook não usar API de React além de `useState`/`useEffect`).
- **Componente** (`.tsx`): consome o hook e cuida de estado de apresentação/renderização — o que é
  mostrado na tela a partir do que o hook devolve. Testável com foco em renderização/interação do
  usuário, sem precisar mockar a chamada de rede diretamente (mocka-se o hook).
- Vale a partir da primeira tela com busca de dados (DSM-9, item 7) — não é retroativo a nada que
  ainda não existe no projeto.
