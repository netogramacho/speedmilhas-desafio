# Review — DSM-1: Cliente HTTP e normalizador do Fornecedor A

## Veredito geral

**Aprovado com ressalvas.**

A implementação segue fielmente o contrato descrito em `spec.md` (nomes de query params, formato
de payload cru, contrato `SupplierQuoteResult`/`SupplierFailure`, classificação de erro em
`timeout`/`http_error`/`unknown_error`), os 4 critérios de aceite da user story estão cobertos por
teste e comportamento real, e `npm test`, `npm run lint` e `npm run build` passam limpos. Não há
achados bloqueantes. As ressalvas são: (1) uma pendência documental explicitamente exigida pela
própria user story/spec que não foi cumprida (`DECISIONS.md` sobre "sem retry automático"), e (2)
gaps cosméticos de cobertura de teste em arquivos auxiliares. Nenhuma delas compromete a
corretude funcional do client/normalizador em si.

**Nota sobre o material de referência recebido:** o prompt desta revisão citou as seções 16 e 17
de `claude/config/parametros-tecnicos.md` (arquitetura limpa e separação hooks/componentes). Ao
ler o arquivo real, ele tem 240 linhas e termina na **seção 15** (i18n) — as seções 16 e 17 não
existem no arquivo atual. Não é possível conferir "aderência ao espírito da seção 16" porque ela
não existe no material fornecido; a avaliação de arquitetura abaixo foi feita com base na seção 15
(real, i18n) e em julgamento geral de boas práticas de separação de camadas, não em uma seção
inexistente. Sinalizando isso para transparência, sem tratar a afirmação do prompt como fato.

## Critérios de aceite (user story)

| # | Critério | Status |
|---|---|---|
| 1 | Query string com `origin`/`destination`/`date` (nomes do fornecedor A) | **Atendido** — `supplier-a.client.ts:35-41`, testado em `supplier-a.client.spec.ts:54-62` (verifica `httpService.get` chamado com `/supplier-a/quotes` e `{ params: { origin, destination, date } }`). Nomes conferidos contra o mock real (`mock-suppliers/src/index.js:242-277`, que lê `req.query.origin/destination/date`). |
| 2 | 200 com `results:[{miles,taxes_brl,carrier}]` → objeto interno com milhas/taxa BRL/companhia por extenso/tag do fornecedor | **Atendido** — `supplier-a.normalizer.ts:22-38` mapeia `miles→miles`, `taxes_brl→taxesBrl`, `carrier` passthrough, `supplier:'supplier-a'`. Testado em `supplier-a.normalizer.spec.ts` e no caminho de sucesso de `supplier-a.client.spec.ts:64-96`. Carrier "por extenso" confirmado contra o catálogo real do mock (`CARRIERS` = `LATAM`/`GOL`/`AZUL`, nomes completos). |
| 3 | 500 do fornecedor A → sem exceção não tratada, resultado indicando falha sem cotações | **Atendido** — `supplier-a.client.ts:52-61` captura no `catch`, classifica `reason:'http_error'`, `httpStatus:500`. Testado em `supplier-a.client.spec.ts:98-113` e explicitamente no teste "resolve em vez de rejeitar" (linhas 141-147). |
| 4 | Timeout → chamada abortada, tratada como falha isolada, não trava o fluxo | **Atendido** — timeout configurado uma vez em `suppliers-http.module.ts` via `SUPPLIER_TIMEOUT_MS` (timeout nativo do axios); classificação `ECONNABORTED → reason:'timeout'` em `supplier-a.client.ts:67-70`, testado com mock de erro Axios com esse código (`supplier-a.client.spec.ts:115-125`). O teste é de unidade (mocka o erro, não mede o timeout real de ponta a ponta) — consistente com o que o próprio `spec.md` definiu como escopo de teste desta story (linhas 176-178, 203-204: integração/corrida real fica para DSM-4). |

Todos os 4 critérios de aceite estão atendidos por teste real (não apenas por nome de função
parecido) — os testes de `supplier-a.client.spec.ts` checam o valor de retorno completo
(`ok`, `supplier`, `quotes`/`failure.reason`/`failure.httpStatus`), não só a ausência de exceção.

## Achados

Nenhum achado bloqueante. Abaixo, do mais para o menos relevante.

### 1. `DECISIONS.md` não foi atualizado com a decisão de "sem retry automático" (não bloqueante, mas é requisito explícito da story)

- **Onde:** `DECISIONS.md` (raiz do projeto) vs. `claude/specs/DSM-1/user-story.md:21-22` e
  `claude/specs/DSM-1/spec.md:39-41`.
- **O que está errado:** a user story diz explicitamente que a ausência de retry automático "fica
  registrado como decisão em `DECISIONS.md` se não for feito". A `spec.md` vai além e **afirma como
  fato consumado**: "Sem retry automático para erro 500 do fornecedor A [...] já está registrado
  como decisão em `DECISIONS.md`". Na prática, `DECISIONS.md` real está com as 4 perguntas ainda
  como placeholder (`<!-- sua resposta aqui -->`), nenhuma decisão foi de fato registrada lá. É uma
  afirmação da spec que não corresponde ao estado real do repositório.
- **Cenário concreto:** se a story for dada como "pronta" com base na leitura da spec (que diz que
  já está registrado), o avaliador do desafio abre `DECISIONS.md` na entrevista e encontra a
  pergunta 1 (que é justamente sobre resiliência a fornecedor instável) em branco — perdendo o
  ponto que o próprio `parametros-tecnicos.md` (item 9) aponta como o que "o desafio mais avalia".
- **Sugestão:** preencher ao menos a pergunta 1 de `DECISIONS.md` (ou uma nota na seção de escopo)
  com a decisão já tomada e justificada em `spec.md`: sem retry para erro 500 de qualquer
  fornecedor (decisão da DSM-1), retry único só para 429 do fornecedor B (DSM-2). Isso é edição de
  documentação, não de código — mas é parte do "pronto" desta story conforme a própria spec definiu.

### 2. Falta de teste unitário para `validate-env.ts` e `suppliers-http.module.ts` (cosmético — gap de cobertura)

- **Onde:** `api/src/common/config/validate-env.ts`, `api/src/suppliers/suppliers-http.module.ts`.
- **O que está errado:** `validateEnv` tem 3 ramos de lógica não triviais (falta de
  `SUPPLIERS_BASE_URL` → lança; `SUPPLIER_TIMEOUT_MS` inválido/≤0 → lança; ausente → aplica default
  `5000`) e nenhum deles tem teste dedicado. Hoje só é exercitado indiretamente pelo caminho feliz
  de `app.module.spec.ts` (que depende de `api/.env` local já estar correto). O mapeamento de
  `baseURL`/`timeout` do `ConfigService` para o `HttpModule.registerAsync` em
  `suppliers-http.module.ts` também não tem teste — uma troca de chave (ex.
  `SUPPLIER_TIMEOUT_MS`→`SUPPLIERS_TIMEOUT_MS`) ou um erro na factory não seria pega por nenhum
  teste automatizado hoje.
- **Cenário concreto:** um refactor futuro que troque `parsed <= 0` por `parsed < 0` em
  `validate-env.ts:29` (aceitando erroneamente timeout `0`) passaria por `npm test` sem quebrar
  nada, porque não há teste cobrindo esse branch.
- **Sugestão:** não é exigido pelo "Plano de testes" da própria `spec.md` (que só lista
  `supplier-a.normalizer.spec.ts` e `supplier-a.client.spec.ts`), então não é um desvio da spec —
  mas vale acrescentar um `validate-env.spec.ts` cobrindo os 3 branches, já que a lógica é pequena e
  barata de testar, e protege o boot da aplicação (fail-fast é justamente o objetivo do arquivo).

### 3. `isAxiosError` reimplementado manualmente em vez de usar o utilitário da própria lib (cosmético)

- **Onde:** `api/src/suppliers/supplier-a/supplier-a.client.ts:85-91`.
- **O que está errado:** o type guard `private isAxiosError(err: unknown): err is AxiosError`
  reimplementa exatamente o que `axios` já exporta como `isAxiosError` (`import { isAxiosError }
  from 'axios'`). Não é um bug hoje (o teste com `new AxiosError(...)` real passa, porque a classe
  `AxiosError` de fato seta `isAxiosError: true` no protótipo), mas é duplicação evitável de uma
  verificação que a lib mantém — se o axios mudar a shape interna do erro em major version futura,
  o guard local pode divergir silenciosamente do comportamento oficial da lib.
- **Sugestão:** substituir por `import { isAxiosError } from 'axios'` e usar a função exportada em
  vez do método privado.

## Testes

- `cd api && npm test -- --silent` → **passou**: 3 suítes, 10 testes, 0 falhas.
- `cd api && npm run lint` → **passou** (ESLint com `--fix`, sem alterações pendentes — código já
  estava formatado/conforme; confirmado via `git status` antes/depois, sem diffs novos).
- `cd api && npm run build` (`nest build`) → **passou**, sem erros de compilação TypeScript.
- `cd api && npm audit --omit=dev` → 0 vulnerabilidades nas dependências novas (`@nestjs/axios`,
  `@nestjs/config`, `axios` e transitivas).
- Conferido manualmente o contrato real do mock (`mock-suppliers/src/index.js:238-277`) contra o
  que o client/normalizador assumem: nomes de query (`origin`/`destination`/`date`), formato do
  payload (`{ results: [{ miles, taxes_brl, carrier }] }`) e nomes de companhia por extenso
  (`LATAM`/`GOL`/`AZUL`) — tudo bate.
- Gaps de cobertura: ver achados 2 (acima) — `validate-env.ts` e `suppliers-http.module.ts` sem
  spec dedicado. O plano de testes descrito em `spec.md` (normalizador + client) foi cumprido
  integralmente, incluindo o teste explícito de "Promise resolve, não rejeita" nos 4 cenários de
  falha, que a própria spec chama de "o critério de aceite mais importante da story".

## Pontos positivos (não é achado, mas relevante para o veredito)

- `normalizeSupplierA` é função pura (sem I/O, sem dependência de `HttpService`/axios), só recebe
  `Logger` como efeito colateral opcional — separação limpa entre normalização e transporte HTTP,
  como o próprio `spec.md` (item "Componentes") descreve.
- Tipos crus do fornecedor A (`SupplierARawItem`/`SupplierARawResponse`) não vazam para fora de
  `supplier-a.client.ts`/`supplier-a.normalizer.ts` — o restante da aplicação só vê `Quote`/
  `SupplierQuoteResult` do contrato compartilhado em `suppliers/types.ts`.
- `SupplierFailure.message` usa sempre `err.message`/`String(err)`, nunca frase fixa em português —
  respeita a decisão registrada na própria spec (linha 130-133) alinhada ao item 15 de
  `parametros-tecnicos.md` (nenhum texto hardcoded que seria exibido ao usuário final; aqui é
  diagnóstico interno, não payload de erro de endpoint HTTP ainda, já que a DSM-1 não expõe rota).
  Vale reforçar esse ponto quando a DSM-4/5 for implementada e este campo/`reason` chegar até o
  contrato do endpoint HTTP.
- Desvio deliberado do item 5 de `parametros-tecnicos.md` (`nestjs-pino` como decisão do projeto)
  em favor do `Logger` built-in nesta story: está devidamente registrado e justificado em
  `spec.md` (linhas 14-15, 36-38) como decisão tomada com o desenvolvedor, com plano de migração
  para DSM-14 sem impacto de contrato — não é uma falha de aderência, é um desvio documentado
  corretamente.
