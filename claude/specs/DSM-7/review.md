# Review — DSM-7: `POST /orders` com idempotência garantida + snapshot de cotação

**Commit revisado:** `7d6a6ac` ("feat(DSM-7): endpoint POST /orders com idempotência garantida e
snapshot de cotação"), branch `main`.

## Veredito geral

**Aprovado.** A implementação segue fielmente a spec técnica (incluindo a Revisão 2, snapshot de
cotação), cobre os cinco critérios de aceite da user story (com uma ressalva documentada e aceita
para AC4, ver abaixo), e os cinco desvios sinalizados pelo desenvolvedor no prompt foram verificados
um a um — todos corretos e bem resolvidos, um deles (`isUniqueConstraintViolation`) confirmado
inclusive contra o formato real do erro do driver adapter Prisma 7, capturado ao vivo contra o
Postgres do `docker compose`. Nenhum achado bloqueante. Só achados cosméticos/gaps de cobertura de
teste, nenhum deles compromete a correção do comportamento em produção.

## Critérios de aceite (user story)

| # | Critério | Status |
|---|---|---|
| 1 | `idempotencyKey` nova → cria um único pedido, 201 com dados da reserva + id único | **Atendido** — `orders.e2e-spec.ts` "AC1", id em formato UUID, `quoteSnapshot.taxesBrlCents` conferido no banco. |
| 2 | Reenvio sequencial da mesma `idempotencyKey` → mesma resposta, sem novo registro | **Atendido** — `orders.e2e-spec.ts` "AC2", mesmo `id`/`quote`, `orderCount === 1`, `quoteSnapshotCount === 1`. |
| 3 | Duas requisições concorrentes, mesma instância → um único registro, mesmo id nas duas respostas | **Atendido** — `orders.e2e-spec.ts` "AC3" (`Promise.all`) e `order-schema.e2e-spec.ts` ("concorrência real"), ambos rodados contra Postgres real; `P2002` real capturado e tratado. |
| 4 | Mesmo cenário, duas instâncias em portas diferentes → resultado idêntico | **Parcial, por desenho documentado** — a garantia é 100% do banco (`@unique`), sem estado em memória em `OrdersRepository`/`PrismaService`, então o mesmo código cobre o cenário; mas **não há prova automatizada de duas instâncias reais** nesta story — a spec e a própria user story-contexto (linha 13-15 do `spec.md`) deferem essa prova formal para a DSM-8 (RF4, obrigatória). Decisão razoável e explicitamente registrada, não é uma lacuna silenciosa — mas fica dependente da DSM-8 realmente entregar esse teste para o AC4 estar 100% fechado. |
| 5 | `quoteId` inexistente/inválido ou passageiro incompleto → 400/404, nenhum pedido criado, mesmo reaproveitando a `idempotencyKey` depois | **Atendido** — cobertura ampla em `orders.e2e-spec.ts` (`quoteId` ausente, passageiro incompleto, CPF inválido, `quote` ausente, `quote.miles` fora de faixa, e reaproveitamento pós-falha para `quote`/`quoteId`/CPF). Só a variante "reaproveitamento pós-falha por **passageiro incompleto**" (distinto de CPF inválido) não tem um teste e2e dedicado — ver achado cosmético abaixo; o comportamento é o mesmo caminho de código já provado nos outros três casos, risco de regressão real é baixo. |

## Verificação dos 5 desvios documentados pelo desenvolvedor

1. **`isUniqueConstraintViolation` usa `driverAdapterError.cause.constraint.fields`, não `meta.target`.**
   Confirmado correto. Escrevi um teste e2e descartável que força um `P2002` real contra o Postgres
   do `docker compose` (mesmo ambiente do projeto) e logou o erro devolvido pelo Prisma 7 —
   `meta.driverAdapterError.cause.constraint.fields === ['"idempotencyKey"']`, exatamente a forma
   que `prisma-error.util.ts` trata (com a remoção das aspas via `normalizeFieldName`). O teste
   descartável foi removido após a verificação, não sobrou nenhum arquivo extra no repositório.
   `prisma-error.util.spec.ts` cobre as duas formas (clássica `meta.target` e a real do driver
   adapter), mais os casos negativos (`code` diferente de `P2002`, erro não-Prisma, `meta` ausente,
   campo errado). Bem resolvido e bem testado.

2. **`@IsNotEmptyObject()` além de `@ValidateNested()` em `passenger`/`quote`.** Confirmado que faz
   sentido: quando a chave é omitida ou `null`, `class-transformer` não produz uma instância do DTO
   aninhado, e `@ValidateNested()` sozinho não gera erro nenhum nesse caso — só `@IsNotEmptyObject()`
   pega isso, devolvendo um único erro limpo `{ field: 'quote', code: 'FIELD_REQUIRED' }` (confirmei
   isso na prática, rodando o DTO real contra `quote` omitido/`null`/`{}` — só omitido/`null`
   disparam `isNotEmptyObject`; `{}` passa por `isNotEmptyObject` porque `class-transformer` já
   materializa a instância de `QuoteDto` com as propriedades declaradas como chaves próprias
   `undefined`, então cai só nos erros de `children`, o que é o comportamento desejado: um erro por
   subcampo em vez de um genérico redundante). Coberto por teste (unitário em
   `create-order-request.dto.spec.ts` para `quote`/`passenger` ausentes, e por e2e para `quote`
   ausente). Gap cosmético: não há um teste unitário explícito para `quote: null` (só para a chave
   omitida) — comportamento idêntico, confirmado manualmente, mas não fixado em teste automatizado.

3. **Conversão reais↔centavos (`money.ts`).** Confirmado sem perda de precisão para a faixa
   realista de valores do domínio: rodei um script de round-trip `cents → reais → cents` para todo o
   intervalo de 0 a 1.000.000 de centavos (R$ 0 a R$ 10.000) e não houve nenhuma divergência nem
   nenhum valor com mais de 2 casas decimais na representação — a combinação
   `@IsNumber({ maxDecimalPlaces: 2 })` na entrada + `Math.round` em `reaisToCents` fecha o risco por
   completo. Uso consistente: `OrdersRepository.createOrGetExisting` chama `reaisToCents` antes do
   `prisma.order.create` (confirmado também no teste `orders.repository.spec.ts`, que verifica o
   valor em centavos exato passado ao mock do Prisma); `order-response.mapper.ts` chama
   `centsToReais` ao montar a resposta. Nenhuma outra rota grava/lê `taxesBrlCents` sem passar por
   essas duas funções.

4. **`order-schema.e2e-spec.ts` adaptado para criar `QuoteSnapshot` dummy.** Confirmado que a
   adaptação é puramente mecânica: `diff` contra a versão da DSM-6 mostra que a única mudança é a
   adição de `quoteSnapshot: { create: quoteSnapshotData } }` (ou `quoteSnapshotId` explícito) em
   cada `order.create`, mais a limpeza de `QuoteSnapshot` no `afterEach`/pontualmente nos dois testes
   que geram `QuoteSnapshot` órfão fora do alcance do `afterEach` genérico ("1:1 garantida no banco"
   e "ordem correta de limpeza") — nenhuma asserção original foi enfraquecida, removida ou teve seu
   alvo trocado; todas as asserções sobre `Passenger`/`onDelete: Restrict`/`P2039`/UUID continuam
   idênticas. Não introduz falso-positivo.

5. **Prefixo `idempotencyKey` mudou de `'e2e-'` para `'orders-e2e-'` em `orders.e2e-spec.ts`.**
   Confirmado que todos os 11 `it()` desse arquivo usam consistentemente `'orders-e2e-*'`, e o
   `afterEach` filtra por esse mesmo prefixo (`startsWith('orders-e2e-')`) tanto para capturar
   `passengerId`/`quoteSnapshotId` quanto para o `deleteMany` de `Order`. `order-schema.e2e-spec.ts`
   manteve o prefixo antigo `'e2e-'` — como `'orders-e2e-'` não começa com `'e2e-'` (e vice-versa),
   não há mais sobreposição entre os dois arquivos quando rodam em workers paralelos do Jest. Rodei
   os dois arquivos e2e juntos (`--runInBand`) e a suíte completa 3x seguidas (`npm test`, paralelo
   default do Jest) sem nenhuma falha/flakiness — nenhum dado órfão observado. Ponto a favor:
   `orders.e2e-spec.ts` captura `passengerId` a partir do próprio `Order` encontrado (não por prefixo
   no `document`, que carrega um CPF real de teste, `52998224725`, não prefixado) — mais robusto que
   o padrão por prefixo de `document` usado em `order-schema.e2e-spec.ts`.

## Achados

Nenhum achado bloqueante ou de severidade alta/média. Só cosméticos, todos de cobertura de teste (o
comportamento de produção correspondente foi verificado manualmente e está correto):

1. **Cosmético — `api/src/presentation/orders/orders.e2e-spec.ts`:** falta um teste de "reaproveitamento
   de `idempotencyKey` após tentativa inválida" para o caso específico de **passageiro incompleto**
   (campo ausente, distinto do caso já coberto de CPF com dígito verificador inválido). Os outros
   três casos análogos (`quoteId` ausente, `quote` ausente, CPF inválido) têm esse teste de retry;
   este não. Sugestão: adicionar um `it()` espelhando os três existentes, usando
   `passenger: { name: 'Maria da Silva' }` (sem `document`) na tentativa inválida.
2. **Cosmético — `api/src/presentation/orders/dto/create-order-request.dto.spec.ts`:** cobre `quote`/
   `passenger` **omitidos**, mas não testa explicitamente `quote: null` (só a ausência da chave).
   Confirmei manualmente que o comportamento é idêntico (mesmo erro `isNotEmptyObject` →
   `FIELD_REQUIRED`), mas não há teste automatizado fixando isso. Sugestão: um `it()` adicional com
   `{ ...VALID_BODY, quote: null }`.
3. **Cosmético — `api/src/common/validation/validation-exception-factory.ts` / `constraint-error-codes.ts`:**
   a interação entre `min` e `isInt`/`isNumber` disparando juntos no mesmo campo (ex.
   `quote.miles: 'abc'`, que falha tanto `isInt` quanto `min` simultaneamente) não tem teste
   dedicado. Confirmei manualmente que `CONSTRAINT_PRIORITY` resolve corretamente para `isInt`
   (`FIELD_REQUIRED`), não `min` (`INVALID_QUOTE_VALUE`), porque `min` fica fora da lista e cai no
   fallback de menor prioridade — comportamento correto, mas essa é uma interação não-trivial o
   suficiente para merecer um caso de teste explícito, dado que qualquer alteração futura em
   `CONSTRAINT_PRIORITY` poderia quebrá-la silenciosamente sem que nenhum teste acuse.
4. **Observação, não é bug (pré-existente, não introduzido por esta story):** `@IsNotEmpty()` em
   `quote.carrier`/`passenger.name`/`quoteId`/`idempotencyKey` não faz `trim()` — uma string só com
   espaços (`"   "`) passa como válida. Mesmo padrão já usado em todo o restante do contrato HTTP do
   projeto (DSM-5), não é uma regressão desta story; citado só para registro.

## Testes

- `cd api && docker compose up -d` — ok, Postgres/mock-suppliers de pé.
- `npx prisma migrate deploy` — `No pending migrations to apply` (schema já aplicado, migration
  `20260817193038_add_quote_snapshot` presente, aditiva sobre `20260817170615_init_order`, não
  editada).
- `npm run lint` — **passou**, 0 erros. 20 warnings (`no-unsafe-argument` em `.e2e-spec.ts`, tipo
  `App`/supertest), todos do mesmo padrão pré-existente já presente em `search.e2e-spec.ts` — não
  são regressão desta story.
- `npm test` (`jest`, todas as suítes incluindo e2e reais contra Postgres) — **passou**, rodado 3x
  seguidas para checar flakiness: **28 suítes, 192 testes, 0 falhas** em todas as execuções. (O
  `ERROR` logado no console durante a execução é esperado — vem de um teste do
  `AllExceptionsFilter` que verifica que detalhes internos não vazam na resposta, não indica falha.)
- Verificação adicional (fora do `npm test`, específica desta revisão, arquivos descartáveis criados
  e removidos após a checagem, repositório limpo ao final — confirmado com `git status --short`):
  - Forcei um `P2002` real via `docker compose`/Postgres e conferi que o formato do erro bate
    exatamente com o que `prisma-error.util.ts`/`prisma-error.util.spec.ts` esperam (desvio 1).
  - Rodei um script de round-trip de conversão centavos↔reais para 0..1.000.000 centavos — nenhuma
    divergência (desvio 3).
  - Confirmei via DTO real (`plainToInstance` + `validate`) o comportamento de `quote` omitido/
    `null`/`{}` e de `min`+`isInt` disparando juntos (achados 2/3 acima).
  - `git diff` de `order-schema.e2e-spec.ts` entre o commit da DSM-6 e o da DSM-7 — mudança
    estritamente aditiva/mecânica, nenhuma asserção original alterada (desvio 4).

**Gaps de cobertura encontrados:** os três itens cosméticos listados em "Achados" — nenhum bloqueia
aprovação, todos de baixo risco (comportamento de produção já verificado manualmente como correto).

---

**Veredito geral: aprovado.**
**Achados bloqueantes: 0.**
