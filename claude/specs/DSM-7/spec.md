# DSM-7 — Endpoint `POST /orders` com idempotência garantida entre instâncias

## Contexto

User story: `claude/specs/DSM-7/user-story.md`.

A DSM-6 (`api/prisma/schema.prisma`, já commitada) entrega o `model Order` com `idempotencyKey
String @unique` (constraint no banco, não em código), `model Passenger` (nome + documento, FK
`Order.passengerId → Passenger.id`, `onDelete: Restrict`), o `enum OrderStatus { PENDING
CONFIRMED }`, e `PrismaService`/`PrismaModule` (`api/src/infrastructure/prisma/`, `@Global()`)
injetáveis via DI. Falta exatamente o que esta story entrega: o contrato HTTP `POST /orders` que
usa essa constraint para garantir uma única reserva por `idempotencyKey`, inclusive sob duas
requisições simultâneas contra a mesma instância (AC3) — o cenário de duas instâncias em portas
diferentes (AC4) é o mesmo código, sem nenhum estado em memória, mas a prova automatizada formal
desse cenário específico é da DSM-8 (RF4, obrigatória), não desta story.

Reaproveitado sem alteração: `PrismaService`/`PrismaModule` (DSM-6); a estrutura em camadas
`domain/`/`infrastructure/`/`presentation/`/`common/` e o padrão de validação
`class-validator`/`class-transformer` + `ValidationPipe` global + `AllExceptionsFilter` (DSM-5,
`parametros-tecnicos.md` itens 10 e 16) — nenhuma dependência nova em `package.json`, tudo que
esta story precisa já está instalado. O suporte a erro aninhado (`children`) em
`validation-exception-factory.ts` (`flattenErrors`, comentário na linha 64 do arquivo: "não
necessário nesta story pois `SearchRequestDto` é raso") já existe pronto para o DTO aninhado
`passenger` desta story — primeiro consumidor real desse caminho. Também reaproveitado: o padrão de
validador customizado `@ValidatorConstraint`/`ValidatorConstraintInterface` já usado por
`IsDifferentFrom`/`IsValidCalendarDate` (`presentation/search/dto/validators/`, DSM-5) — a
validação de CPF (ver "Arquitetura decidida") segue exatamente esse molde, primeiro reaproveitamento
dele fora de `search/`.

**Achado cross-story relevante (fecha a leitura literal da AC5):** a resposta de `POST /search`
(DSM-5, `SearchResponseQuoteDto`) **não expõe nenhum identificador por cotação** — só `{ miles,
taxesBrl, carrier }`. A DSM-9 (tela de busca) também não tem nenhum fluxo de "selecionar esta
cotação e reservar" (user-story DSM-9, sem AC de clique em cotação → não chama `POST /orders`).
Ou seja: **não existe, em lugar nenhum do escopo do desafio, um caminho que gere um `quoteId` real
a partir de uma busca** — `quoteId` em `POST /orders` é, por desenho do próprio desafio, uma string
opaca fornecida por quem chama o endpoint (o teste da DSM-8, testes manuais/`curl`), nunca
validada contra um resultado de busca persistido. Isso confirma e fecha a lacuna aparente entre a
AC5 ("`quoteId` inexistente/inválido... retorna 400/404") e o "fora de escopo" da própria story
("validar se `quoteId` referencia uma cotação real... decisão deve ficar registrada em
`DECISIONS.md` se simplificada") — ver "Arquitetura decidida" para a decisão tomada e a pendência
de registro que fica para o desenvolvedor.

**Fora de escopo (mantido conforme a story):** validar `quoteId` contra uma busca real (DSM-5 não
persiste cotações); persistir a busca inteira e ligar `Order` a uma cotação real por FK (descartado
explicitamente pelo desenvolvedor na revisão de snapshot abaixo — `quoteId` continua opaco mesmo
depois dela); qualquer fluxo de pagamento/confirmação externa entre `PENDING` e `CONFIRMED` (não
existe no desafio); o teste automatizado formal de duas instâncias em portas diferentes (DSM-8);
paginação/listagem de pedidos (não pedida por nenhum RF).

**Nota sobre este processo:** esta sessão, como a da DSM-5, não teve acesso à ferramenta interativa
de pergunta ao desenvolvedor (só leitura/escrita de arquivo e busca) — os pontos abaixo com mais de
uma abordagem razoável foram **decididos por este agente**, seguindo os padrões já fixados em
`parametros-tecnicos.md` e a continuidade explícita deixada pela DSM-6 (em especial o comentário da
DSM-6 sobre o pedido preso em `PENDING`, que já antecipava um fluxo de duas escritas — ver abaixo).
Cada decisão não trivial está justificada e marcada explicitamente; revisar antes de implementar.
Uma pendência de `DECISIONS.md` é sinalizada explicitamente para o desenvolvedor preencher (não é
tocada por este agente, mesmo padrão da DSM-5/DSM-6).

**Revisão de 2026-08-17 (validação de CPF):** a decisão original de validar `document` só por
presença (ver abaixo) foi revista a pedido do desenvolvedor, depois de uma sessão de investigação
com escalada explícita ao coordenador sobre o ponto não-trivial "validador customizado vs.
dependência nova" — decisão confirmada pelo desenvolvedor: validador customizado, sem dependência
nova. Detalhe na entrada correspondente de "Arquitetura decidida".

**Revisão 2 de 2026-08-17 (snapshot de cotação no `Order`) — esta versão.** Esta story já havia
sido implementada seguindo a versão anterior deste spec (código real em
`api/src/presentation/orders/` e `api/src/infrastructure/orders/`, ainda **não commitado**). O
desenvolvedor identificou uma lacuna: como não existe persistência de busca nem FK real para
`quoteId`, **os dados de verdade da cotação escolhida (`miles`, `taxesBrl`, `carrier` — o que a
pessoa efetivamente reservou) nunca eram gravados em lugar nenhum**; só sobrava `quoteId`, uma
string sem significado fora do desafio.

Esta revisão **revisa diretamente** a decisão "`quoteId` como string opaca, sem relação/FK **e sem
snapshot de preço**" registrada em `claude/specs/DSM-6/spec.md` (linha 88 — "O `Order` não guarda
`miles`/`taxesBrl`/`carrier`"), story já commitada. **Regra de processo seguida aqui:** specs de
stories já concluídas/commitadas não são editadas retroativamente — o arquivo `claude/specs/DSM-6/
spec.md` **não é tocado** por esta revisão. Toda a referência cruzada, o desenho completo do
schema novo (`model QuoteSnapshot`, colunas de `Order`) e a migration correspondente moram
inteiramente aqui, na spec da DSM-7 (que ainda não foi commitada) — mesmo a parte que, olhando só
pela divisão de responsabilidade original entre as stories, "pertenceria" à DSM-6. **O que não
muda na decisão original da DSM-6:** `quoteId` em si continua uma string opaca, sem FK/validação de
existência contra uma busca real — só a parte "sem snapshot de preço" é revertida.

Esta revisão fecha essa lacuna: `POST /orders` passa a receber também os dados da cotação
escolhida, e o `Order` persiste esse snapshot.

Como a ferramenta `AskUserQuestion` também não estava disponível nesta sessão de revisão, e a
instrução registrada em memória exige **escalar ao coordenador, não decidir sozinho**, os dois
pontos não triviais desta extensão (como modelar o snapshot; que tipo de coluna usar para o valor
monetário) foram levados ao coordenador em vez de decididos por este agente. Decisões confirmadas
pelo desenvolvedor, via o coordenador:

1. **Modelagem — model `QuoteSnapshot` separado, 1:1 com `Order`**, mesmo padrão já usado para
   `Passenger` (DSM-6) — não colunas escalares soltas direto em `Order`.
2. **Valor monetário — inteiro em centavos** (`taxesBrlCents Int`), não `Float` nem `Decimal` — ex.
   R$ 38,50 é persistido como `3850`. A conversão reais↔centavos é isolada numa função pura de
   domínio; a pipeline de busca (`Quote.taxesBrl` em `domain/suppliers/types.ts`,
   `SearchResponseQuoteDto.taxesBrl`) **não muda** — continua `number` em reais, do jeito que já é
   hoje.
3. **`miles` — `Int` direto, sem conversão de unidade.** Decisão de baixo impacto deste agente
   (milhas são sempre uma quantidade inteira), sem objeção do desenvolvedor.

A direção da FK do novo model (`QuoteSnapshot`) e o nome escolhido para ele (não `Quote`, para não
colidir com o tipo `Quote` já existente em `domain/suppliers/types.ts` nem com o próprio
`Order.quoteId`) foram decididos por este agente, seguindo o mesmo raciocínio que a DSM-6 (Revisão
2) já registrou para `Passenger` — ver "Arquitetura decidida" para o detalhe e a justificativa.

**Código já existente afetado por esta revisão (working tree, não commitado) — a implementar como
alteração, não criação do zero:** `api/prisma/schema.prisma`,
`api/src/presentation/orders/dto/create-order-request.dto.ts`,
`api/src/presentation/orders/dto/order-response.dto.ts`,
`api/src/presentation/orders/order-response.mapper.ts` (+ `.spec.ts`),
`api/src/presentation/orders/orders.controller.ts` (+ `.spec.ts`),
`api/src/presentation/orders/orders.e2e-spec.ts`,
`api/src/infrastructure/orders/orders.repository.ts` (+ `.spec.ts`),
`api/src/common/validation/constraint-error-codes.ts`,
`api/src/common/validation/validation-exception-factory.ts` (`CONSTRAINT_PRIORITY`). Ver
"Componentes" para o detalhe exato de cada alteração.

## Arquitetura decidida

- **Nome do campo do passageiro no contrato HTTP — `passenger` (inglês), não `passageiro`.**
  *(Decisão deste agente.)* O README/user story escrevem `{ quoteId, passageiro, idempotencyKey }`
  em prosa descritiva, não como um schema JSON literal a seguir à risca — o resto do contrato HTTP
  do projeto é inteiramente em inglês (`origin`/`destination`/`date` na DSM-5, apesar da story
  também estar em pt-BR), e o próprio schema Prisma da DSM-6 já nomeou o model `Passenger` com
  campos `name`/`document` em inglês. Manter `passenger` no DTO evita uma segunda nomenclatura
  (pt-BR só na borda HTTP, inglês em todo o resto) para o mesmo conceito. *Decisão aberta:* se o
  desenvolvedor preferir `passageiro` literal (ex. por fidelidade ao enunciado), é uma troca pontual
  de nome de propriedade no DTO, sem impacto em nenhuma outra camada.
- **Fluxo de criação em duas escritas separadas — `INSERT` (nasce `PENDING`, default do schema) +
  `UPDATE` imediato para `CONFIRMED`, não uma única escrita atômica já como `CONFIRMED`.**
  *(Decisão deste agente, ponto mais não-trivial da story — ver justificativa.)* A DSM-6 já
  antecipava esse desenho no próprio texto da spec ("Pedido que fica preso em `PENDING` para
  sempre, ex.: **processo cai depois de inserir a linha mas antes de confirmar**" —
  `claude/specs/DSM-6/spec.md`, tabela de riscos): só faz sentido um processo "cair entre inserir e
  confirmar" se essas forem duas operações de banco distintas, cada uma com seu próprio commit —
  não uma única transação. É exatamente essa separação que torna o estado `PENDING` observável de
  verdade (não só um valor de default nunca lido), cumprindo o texto literal da AC3 da DSM-6 ("um
  estado explícito... que permite diferenciar `reserva já em andamento por outra requisição
  concorrente` de `reserva já concluída`"): se uma segunda requisição com a mesma `idempotencyKey`
  cai exatamente na janela entre o `INSERT` de A e o `UPDATE` de A, o `SELECT` que ela faz ao
  capturar o erro de conflito (`P2002`) encontra a linha ainda como `PENDING` — e a devolve assim
  mesmo, sem esperar/repetir a leitura (ver "Casos de borda"). Alternativa descartada: uma única
  escrita atômica (`order.create` já com `status: CONFIRMED`) seria mais simples e sem nenhuma
  janela de risco, mas deixaria `PENDING` como um valor de enum nunca alcançado na prática — indo
  contra o desenho já registrado pela DSM-6. *Decisão aberta:* se o desenvolvedor preferir a
  alternativa mais simples (uma escrita só, sempre `CONFIRMED`), é uma redução de duas chamadas
  Prisma para uma no `OrdersRepository`, sem mudar nenhum outro componente.
- **HTTP status sempre 201, tanto para o `Order` recém-criado quanto para o reenvio com
  `idempotencyKey` já processada** — cumpre literalmente "retorna a **mesma resposta**" da AC2 (não
  só o mesmo corpo). O mesmo vale para as duas respostas concorrentes da AC3/AC4: nenhuma das duas
  é tratada como "vencedora" no nível HTTP, ambas recebem 201 com o mesmo corpo. *(Decisão deste
  agente; alternativa razoável seria 200 para o caminho de "já existia" — descartada para não
  introduzir uma diferença de status que a story não pede e que a DSM-8 teria que passar a
  ignorar.)*
- **Validação de `quoteId` — só formato (`@IsString`/`@IsNotEmpty`), sem checar existência real,
  sem caminho 404.** Decisão já registrada na DSM-6 ("`quoteId` como string opaca, sem
  relação/FK") e confirmada pelo achado cross-story acima (não existe, no escopo do desafio,
  nenhum fluxo que produza um `quoteId` real a partir de uma busca). "`quoteId`
  inexistente/inválido" (AC5) é cumprido só para o caso de campo ausente/vazio/tipo errado → 400
  `FIELD_REQUIRED`. **Não afetado pela Revisão 2** — continua exatamente assim mesmo depois do
  snapshot de cotação passar a ser persistido. **Pendência explícita para o desenvolvedor:** a
  própria user story pede que essa simplificação fique registrada em `DECISIONS.md` "se
  simplificada" — como o arquivo só tem as 4 perguntas fixas (não é texto livre) e nenhuma story
  anterior o edita diretamente (mesmo padrão DSM-5/DSM-6), a menção cabe melhor como uma frase na
  resposta da pergunta 2 ("Como você garante uma única reserva sob concorrência?") ao preencher o
  arquivo pessoalmente — este agente não o edita.
- **Validação de `passenger.document` — CPF válido de verdade (formato de 11 dígitos + dígitos
  verificadores pelo algoritmo padrão brasileiro, módulo 11 + rejeição de sequências de dígitos
  repetidos), não só presença/não-vazio.** *(Decisão do desenvolvedor, confirmada explicitamente
  depois de escalada — substitui a decisão original desta spec, que exigia só string não vazia
  citando a AC5 falar em "incompletos", não "inválidos"; ver revisão de 2026-08-17 no "Contexto".)*
  - **Onde mora a validação — validador customizado (`@ValidatorConstraint`), sem dependência
    nova.** Novo arquivo `IsValidCpf`
    (`presentation/orders/dto/validators/is-valid-cpf.validator.ts`), no mesmo molde exato de
    `IsDifferentFrom`/`IsValidCalendarDate` (`presentation/search/dto/validators/`, DSM-5):
    `ValidatorConstraintInterface`, `validate()`/`defaultMessage()`, consumido via
    `@Validate(IsValidCpf)` no `PassengerDto`. Alternativa considerada — lib de terceiros (ex.
    `cpf-cnpj-validator`) — **descartada**: contrariaria a promessa já registrada nesta spec de
    "nenhuma dependência nova em `api/package.json`" e o item 3 de `parametros-tecnicos.md`
    ("implementação na mão, sem lib... código que ele mesmo escreveu e entende vale mais... para
    poder explicar na entrevista", dito sobre timeout/circuit breaker mas com o mesmo raciocínio
    aplicável aqui); o algoritmo de dígito verificador de CPF é simples e bem documentado, sem
    ganho real de trazer uma dependência externa só para isso, principalmente tendo o projeto já
    dois validadores customizados equivalentes em complexidade (`IsValidCalendarDate` reconstrói e
    valida uma data de calendário na mão).
  - **Sem `@Matches` separado para o formato.** A checagem de "11 dígitos numéricos" fica dentro do
    próprio `IsValidCpf.validate()`, não como um `@Matches(regex)` adicional no DTO. Motivo: a
    chave de constraint `matches` já está fixada globalmente em `constraint-error-codes.ts` para
    `'INVALID_DATE_FORMAT'` (usada por `date` em `SearchRequestDto`) — o mapa é por **nome de
    constraint**, não por campo, então reaproveitar `@Matches` em `document` devolveria o `code`
    errado (`INVALID_DATE_FORMAT` num campo de CPF). Concentrar formato + checksum + sequência
    repetida num único `validate()`, sob a chave própria `isValidCpf`, evita essa colisão por
    construção — ver "Casos de borda" para o risco documentado.
  - **`document` continua string de 11 dígitos numéricos puros, sem máscara** (sem `.`/`-`) — já
    era o formato do exemplo de corpo de entrada desta spec (`"12345678900"`); não há *strip* de
    máscara antes de validar. Quem chama o endpoint envia o CPF já sem formatação, mesma convenção
    do resto do contrato HTTP do projeto (nenhum outro campo aceita variantes de formatação a
    normalizar, fora `origin`/`destination` da DSM-5, que é normalização de caixa, não de
    formato). *(Ponto secundário, decidido pelo agente e confirmado pelo desenvolvedor como não
    precisando de escalada — alinhado ao contrato já existente.)*
  - **Sequências de dígitos repetidos são rejeitadas explicitamente** (`00000000000`,
    `11111111111`, ..., `99999999999`) — passam no cálculo dos dígitos verificadores (o algoritmo
    padrão de módulo 11 não as exclui sozinho), mas são convencionalmente inválidas e é o erro mais
    comum de gerar CPF de teste "válido" por acidente.
  - Continua valendo a leitura de que a AC5 cobre "dados de passageiro incompletos" — ausência de
    `document` continua 400 `FIELD_REQUIRED` (prioridade de `isNotEmpty`/`isString` sobre
    `isValidCpf` em `CONSTRAINT_PRIORITY`, sem mudança); a novidade é que agora um `document`
    presente mas inválido (formato ou checksum) também vira 400, com `code: 'INVALID_CPF'`.
- **Snapshot da cotação escolhida — model `QuoteSnapshot` separado, 1:1 com `Order`, mesmo padrão
  já usado para `Passenger` (não colunas soltas em `Order`).** *(Decisão do desenvolvedor, Revisão
  2.)* Nome do model é `QuoteSnapshot`, não `Quote` — evita colisão de conceito com `Quote`
  (`domain/suppliers/types.ts`, o resultado de busca de um fornecedor, um conceito totalmente
  diferente) e com o próprio `Order.quoteId` (string opaca) já existente; o nome já deixa explícito
  que o dado é um retrato congelado no momento da criação do `Order`, não uma entidade de negócio
  com ciclo de vida próprio — nunca é consultado fora do `Order` dono. *(Decisão de nomenclatura de
  baixo impacto deste agente, não escalada.)*
  - **Direção da FK — `Order.quoteSnapshotId`, não `QuoteSnapshot.orderId`.** *(Decisão deste
    agente, mesma direção e mesmo raciocínio já fixado pela DSM-6, Revisão 2, para
    `Order.passengerId` — não escalada por ser exatamente o mesmo precedente já resolvido.)*
    `Order.quoteSnapshotId String @unique @db.Uuid` +
    `@relation(fields: [quoteSnapshotId], references: [id], onDelete: Restrict)`. Como a coluna é
    obrigatória (não anulável), o próprio banco passa a impedir a existência de um `Order` sem
    `QuoteSnapshot` associado, já no `INSERT` — mesmo efeito colateral positivo documentado para
    `Passenger`. A mesma escrita aninhada do Prisma (`prisma.order.create({ data: { ...,
    quoteSnapshot: { create: {...} } } })`) continua funcionando, dentro da mesma transação
    implícita que já cria `Passenger` + `Order`.
  - Mesmo trade-off aceito para `Passenger` se repete aqui: apagar um `Order` deixa o
    `QuoteSnapshot` correspondente órfão (cascade só se propaga no sentido "linha referenciada →
    linha que referencia", nunca o inverso) — aceito pelo mesmo motivo (nenhum fluxo de exclusão de
    pedido no desafio).
- **Valor monetário — inteiro em centavos (`QuoteSnapshot.taxesBrlCents Int`), não `Float` nem
  `Decimal`.** *(Decisão do desenvolvedor, terceira opção fora das duas levantadas por este agente
  — `Float` seria consistente com o resto do código, que trata `taxesBrl` como `number` puro em
  toda a pipeline de busca, mas impreciso para dinheiro; `Decimal` seria preciso mas introduziria o
  primeiro uso de `Prisma.Decimal` no projeto, exigindo conversão explícita em toda borda que
  tocasse o valor.)* Inteiro em centavos evita os dois problemas: sem imprecisão de ponto flutuante
  binário, sem tipo wrapper do Prisma vazando para fora da camada de infraestrutura.
  - **A conversão mora numa função pura de domínio, não espalhada pelo repositório/mapper.** Novo
    arquivo `api/src/domain/orders/money.ts`: `reaisToCents(reais: number): number` (usada na
    escrita) e `centsToReais(cents: number): number` (usada na leitura) — sem import de framework,
    **primeiro artefato real em `domain/orders/`** (que a DSM-6/7 originais deixaram vazio por não
    haver regra pura para extrair; converter reais↔centavos é exatamente esse tipo de regra: pura,
    testável sem DI/mock, reaproveitável). `OrdersRepository` (infraestrutura) chama
    `reaisToCents` antes de escrever; `order-response.mapper.ts` (apresentação) chama
    `centsToReais` ao montar a resposta — ambos podem importar `domain/orders/`, nunca o inverso
    (item 16 de `parametros-tecnicos.md`, direção de dependência).
  - `reaisToCents` usa `Math.round(reais * 100)` — protege contra imprecisão binária residual (ex.
    `38.50 * 100` pode chegar como `3849.999999999996` em ponto flutuante puro; `Math.round`
    corrige antes de persistir).
  - **Perda de precisão silenciosa é evitada na validação de entrada, não na conversão:**
    `QuoteDto.taxesBrl` usa `@IsNumber({ maxDecimalPlaces: 2 })` — um valor como `38.505` (3 casas)
    é rejeitado como 400 antes de chegar à conversão, em vez de ser arredondado silenciosamente
    para `3850`/`3851` sem o cliente saber qual dos dois aconteceu. *(Decisão de baixo impacto
    deste agente — fecha um risco que a conversão sozinha não fecha, não escalada.)*
  - A pipeline de busca (`Quote.taxesBrl` em `domain/suppliers/types.ts`,
    `SearchResponseQuoteDto.taxesBrl` em `presentation/search/dto/search-response.dto.ts`) **não
    muda** — continua `number` em reais, do jeito que já é hoje; a conversão só existe na borda de
    escrita/leitura do `Order`/`QuoteSnapshot`, nunca na busca.
- **`miles` — `Int` direto no schema, sem conversão de unidade.** *(Decisão de baixo impacto deste
  agente, confirmada sem objeção do desenvolvedor via o coordenador.)* Milhas são sempre uma
  quantidade inteira; `QuoteDto.miles` usa `@IsInt()` (não `@IsNumber()`).
- **Shape do body de `POST /orders` — novo campo `quote: { miles, taxesBrl, carrier }`, mesmo
  molde de `passenger`.** Novo `QuoteDto` (`presentation/orders/dto/quote.dto.ts`), consumido via
  `@IsNotEmptyObject()` + `@ValidateNested()` + `@Type(() => QuoteDto)` em
  `CreateOrderRequestDto` — idêntico ao padrão já usado por `PassengerDto`. `miles`/`taxesBrl`/
  `carrier` reaproveitam exatamente os mesmos nomes de campo de `SearchResponseQuoteDto`
  (`presentation/search/dto/search-response.dto.ts`), para quem for montar o body a partir de uma
  resposta de busca real ter o menor atrito possível — mesmo sem existir FK/validação formal entre
  os dois contratos. *(Decisão de baixo impacto deste agente, segue diretamente do precedente já
  usado para `passenger`, não escalada.)*
- **Novos códigos de constraint em `CONSTRAINT_ERROR_CODES`:** `isInt`/`isNumber` mapeados para
  `'FIELD_REQUIRED'` — mesmo raciocínio já usado por `isString` (que hoje cobre tanto "ausente"
  quanto "tipo errado" para os campos raiz existentes, ex. `quoteId`); `min` mapeado para um código
  novo, `'INVALID_QUOTE_VALUE'` — dispara quando o campo está presente e no tipo certo mas fora do
  intervalo permitido (`miles < 1` ou `taxesBrl < 0`), reaproveitável entre os dois campos porque o
  `field` na resposta já desambigua qual dos dois falhou (mesmo padrão de `isNotEmpty`/`isString`
  sendo genéricos por constraint, não por campo — não é o mesmo tipo de colisão evitada para
  `matches`/CPF, porque ali o risco era um `code` **semanticamente errado** para um campo
  diferente, não um `code` genérico compartilhado por dois campos do mesmo conceito). `isInt`/
  `isNumber` entram também em `CONSTRAINT_PRIORITY`, no mesmo grupo de `isNotEmpty`/`isString`/
  `isNotEmptyObject` (campo ausente/tipo errado é logicamente anterior a campo com valor fora do
  intervalo). *(Decisão de baixo impacto deste agente, não escalada.)*
- **Camada `domain/orders/` deixa de estar vazia** — `money.ts` (conversão reais↔centavos) é o
  primeiro artefato real ali, função pura sem import de `@nestjs/*`/`@prisma/client`. O resto do
  raciocínio da versão original desta spec continua valendo: a lógica de "tentar inserir, capturar
  conflito de unicidade, buscar o existente" segue sendo infraestrutura (depende do formato de erro
  do Prisma), e a validação de CPF/quote segue sendo regra de borda HTTP amarrada ao
  `class-validator`, não domínio puro.
- **Detecção de conflito de unicidade — helper genérico em `infrastructure/prisma/`, não
  específico de `orders`.** `isUniqueConstraintViolation(error, field)` fica em
  `infrastructure/prisma/prisma-error.util.ts` (ao lado de `PrismaService`) em vez de dentro de
  `infrastructure/orders/` — é uma checagem de formato de erro do Prisma sem nenhum conhecimento de
  domínio de pedidos, reaproveitável por qualquer feature futura que também dependa de constraint
  única no banco. *(Decisão de baixo impacto deste agente.)*
- **Repositório único orquestra "criar ou devolver o existente" (`OrdersRepository`), sem um
  serviço intermediário.** Mesmo papel que `SearchAggregatorService` tem para busca (infra que
  orquestra o acesso a um provider de infra — aqui, `PrismaService`), registrado em
  `infrastructure/orders/`. O controller (`presentation/orders/`) chama o repositório diretamente,
  mesmo padrão de `SearchController` → `SearchAggregatorService`.

## Componentes

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/src/infrastructure/prisma/prisma-error.util.ts` | `isUniqueConstraintViolation(error: unknown, field: string): boolean` — confirma que `error` é `Prisma.PrismaClientKnownRequestError` com `code === 'P2002'` e que `field` está entre os campos do conflito. Genérico, sem conhecimento de `orders`. **Já implementado** (working tree). |
| `api/src/infrastructure/prisma/prisma-error.util.spec.ts` | Testes unitários do helper. **Já implementado.** |
| `api/src/infrastructure/orders/orders.module.ts` | `OrdersModule`: `controllers: [OrdersController]`, `providers: [OrdersRepository]`. Não importa `PrismaModule` (já `@Global()`, DSM-6). **Já implementado, sem alteração nesta revisão.** |
| `api/src/presentation/orders/dto/validators/is-valid-cpf.validator.ts` | `IsValidCpf` — valida CPF (formato + dígito verificador + sequência repetida). **Já implementado, sem alteração nesta revisão.** |
| `api/src/presentation/orders/dto/validators/is-valid-cpf.validator.spec.ts` | Testes do validador. **Já implementado, sem alteração.** |
| `api/src/presentation/orders/dto/passenger.dto.ts` | `PassengerDto`. **Já implementado, sem alteração nesta revisão** — só referência de molde para `QuoteDto`. |
| `api/src/domain/orders/money.ts` | `reaisToCents(reais: number): number` / `centsToReais(cents: number): number` — função pura, sem import de framework; primeiro artefato de `domain/orders/`. **Novo, Revisão 2.** |
| `api/src/domain/orders/money.spec.ts` | Testes unitários da conversão nos dois sentidos — ver "Plano de testes". **Novo, Revisão 2.** |
| `api/src/presentation/orders/dto/quote.dto.ts` | `QuoteDto`: `miles` (`@IsInt()`, `@Min(1)`), `taxesBrl` (`@IsNumber({ maxDecimalPlaces: 2 })`, `@Min(0)`), `carrier` (`@IsString()`, `@IsNotEmpty()`). **Novo, Revisão 2.** |
| `api/src/presentation/orders/dto/quote.dto.spec.ts` | Testes de validação via `plainToInstance` + `validate()` — ver "Plano de testes". **Novo, Revisão 2.** |

### Arquivos alterados nesta revisão (já existem no working tree, não commitados)

| Arquivo | Alteração |
|---|---|
| `api/prisma/schema.prisma` | Adiciona `model QuoteSnapshot` e as colunas `Order.quoteSnapshotId`/`Order.quoteSnapshot` — aditivo sobre o schema já aplicado pela DSM-6 (`model Order`/`Passenger` mantêm todos os campos existentes, nenhum é removido/renomeado). |
| `api/prisma/migrations/<novo-timestamp>_add_quote_snapshot/migration.sql` | Gerado por `prisma migrate dev --name add_quote_snapshot` — **não edita** `20260817170615_init_order/` (já aplicada e commitada pela DSM-6). `CREATE TABLE "QuoteSnapshot"`, `ALTER TABLE "Order" ADD COLUMN "quoteSnapshotId"` (NOT NULL — só é seguro porque a tabela `Order` local não tem linhas fora de testes, que já se limpam sozinhos; ver "Casos de borda"), índice único em `quoteSnapshotId`, FK `ON DELETE RESTRICT`. |
| `api/src/presentation/orders/dto/create-order-request.dto.ts` | Adiciona `quote: QuoteDto` (`@IsNotEmptyObject()`, `@ValidateNested()`, `@Type(() => QuoteDto)`), mesmo padrão de `passenger`. |
| `api/src/presentation/orders/dto/order-response.dto.ts` | Adiciona `quote: { miles: number; taxesBrl: number; carrier: string }` ao contrato de resposta. |
| `api/src/presentation/orders/order-response.mapper.ts` | `mapOrderToResponse` passa a montar `quote` a partir de `order.quoteSnapshot`, convertendo `taxesBrlCents → taxesBrl` via `centsToReais` (`domain/orders/money.ts`). Tipo de entrada renomeado de `OrderWithPassenger` para `OrderWithRelations` (ver linha do repositório abaixo). |
| `api/src/presentation/orders/order-response.mapper.spec.ts` | Fixture `OrderWithRelations` ganha `quoteSnapshot`; novo caso de teste confirma a conversão centavos→reais na resposta. |
| `api/src/presentation/orders/orders.controller.ts` | `create()` passa a extrair também `quote: { miles, taxesBrl, carrier }` do DTO ao chamar `ordersRepository.createOrGetExisting`. |
| `api/src/presentation/orders/orders.controller.spec.ts` | Fixtures (`dto`, `order`) ganham `quote`/`quoteSnapshot`; o `expect(...).toHaveBeenCalledWith(...)` passa a incluir `quote`. |
| `api/src/infrastructure/orders/orders.repository.ts` | `CreateOrderInput` ganha `quote: { miles: number; taxesBrl: number; carrier: string }`; `OrderWithPassenger` **renomeado** para `OrderWithRelations` (`Prisma.OrderGetPayload<{ include: { passenger: true; quoteSnapshot: true } }>`); a escrita aninhada do `create` ganha `quoteSnapshot: { create: { miles: input.quote.miles, taxesBrlCents: reaisToCents(input.quote.taxesBrl), carrier: input.quote.carrier } }`; `update`/`findUnique` também passam a `include: { passenger: true, quoteSnapshot: true }`. |
| `api/src/infrastructure/orders/orders.repository.spec.ts` | `input` de teste ganha `quote`; asserts de `prisma.order.create`/`update`/`findUnique` conferem `quoteSnapshot`/`include` atualizados; novo caso confirma que `taxesBrl` é convertido para centavos **antes** de chamar `prisma.order.create` (a chamada mockada recebe `taxesBrlCents` inteiro, não o valor em reais). |
| `api/src/common/validation/constraint-error-codes.ts` | Adiciona `isInt: 'FIELD_REQUIRED'`, `isNumber: 'FIELD_REQUIRED'`, `min: 'INVALID_QUOTE_VALUE'`. Não mexe nas entradas existentes (`isValidCpf` continua `'INVALID_CPF'`, etc.). |
| `api/src/common/validation/validation-exception-factory.ts` | `CONSTRAINT_PRIORITY` ganha `'isInt'`/`'isNumber'`, no mesmo grupo de `isNotEmpty`/`isString`/`isNotEmptyObject` (antes de `isIn`/`isDifferentFrom`/`matches`/`isValidCalendarDate`). |
| `api/src/presentation/orders/dto/create-order-request.dto.spec.ts` | `VALID_BODY` ganha `quote`; novos casos para `quote` ausente/incompleto, `miles`/`taxesBrl` de tipo errado, fora do intervalo permitido, e `taxesBrl` com mais de 2 casas decimais. |
| `api/src/presentation/orders/orders.e2e-spec.ts` | `validBody` ganha `quote: { miles: 18500, taxesBrl: 38.50, carrier: 'GOL' }`; novas asserções de AC1/AC2/AC3 sobre `quote` na resposta e sobre `taxesBrlCents` persistido no banco; novos casos AC5 para `quote` ausente/incompleto/inválido; `afterEach` passa a capturar também `quoteSnapshotId` para limpeza (mesma lógica já usada para `passengerId`). |

`api/src/app.module.ts` já importa `OrdersModule` (DSM-7 original) — sem alteração nesta revisão.
Nenhuma dependência nova em `api/package.json` — a conversão reais↔centavos é aritmética simples,
sem lib.

## Contratos de dados

```prisma
// api/prisma/schema.prisma — trecho relevante após esta revisão (Order/Passenger mantidos do que
// a DSM-6 já entregou; QuoteSnapshot e as duas colunas novas em Order são o que esta revisão
// adiciona)

model Order {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  quoteId         String
  idempotencyKey  String        @unique
  status          OrderStatus   @default(PENDING)
  passengerId     String        @unique @db.Uuid
  passenger       Passenger     @relation(fields: [passengerId], references: [id], onDelete: Restrict)
  quoteSnapshotId String        @unique @db.Uuid
  quoteSnapshot   QuoteSnapshot @relation(fields: [quoteSnapshotId], references: [id], onDelete: Restrict)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

// model Passenger — inalterado pela DSM-7, mantido aqui só como referência de contexto.
model Passenger {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  document  String
  order     Order?
  createdAt DateTime @default(now())
}

/// Retrato congelado da cotação escolhida no momento da criação do Order (DSM-7, Revisão 2) — não
/// uma entidade de negócio com ciclo de vida próprio, nunca consultada fora do Order dono. FK em
/// Order (Order.quoteSnapshotId), mesma direção/justificativa já usada para Passenger (DSM-6,
/// Revisão 2): coluna obrigatória em Order garante, no próprio banco, que todo Order tem um
/// QuoteSnapshot. taxesBrlCents é inteiro em centavos (R$ 38,50 -> 3850); a conversão para/de
/// reais mora em domain/orders/money.ts, nunca no schema/banco.
model QuoteSnapshot {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  miles         Int
  taxesBrlCents Int
  carrier       String
  order         Order?
  createdAt     DateTime @default(now())
}
```

```ts
// api/src/domain/orders/money.ts

/** Converte reais (number, ex. 38.50) para centavos (Int) para persistir em
 * QuoteSnapshot.taxesBrlCents. Math.round protege contra imprecisão residual de ponto flutuante
 * (ex. 38.50 * 100 pode chegar como 3849.999999999996 em JS). Função pura de domínio — sem import
 * de framework. */
export function reaisToCents(reais: number): number;

/** Converte centavos (Int, como persistido em QuoteSnapshot.taxesBrlCents) de volta para reais
 * (number), para a resposta HTTP de POST /orders. */
export function centsToReais(cents: number): number;
```

```ts
// api/src/presentation/orders/dto/quote.dto.ts
export class QuoteDto {
  @IsInt()
  @Min(1)
  miles!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxesBrl!: number;

  @IsString()
  @IsNotEmpty()
  carrier!: string;
}

// api/src/presentation/orders/dto/create-order-request.dto.ts (trecho novo)
export class CreateOrderRequestDto {
  @IsString()
  @IsNotEmpty()
  quoteId!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => PassengerDto)
  passenger!: PassengerDto;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => QuoteDto)
  quote!: QuoteDto;
}
```

Body de entrada esperado (JSON), exemplo válido — `document` precisa ser um CPF real (formato +
dígito verificador); `quote` é o campo novo desta revisão:

```json
{
  "quoteId": "quote-abc123",
  "idempotencyKey": "e2e-key-1",
  "passenger": { "name": "Maria da Silva", "document": "52998224725" },
  "quote": { "miles": 18500, "taxesBrl": 38.50, "carrier": "GOL" }
}
```

```ts
// api/src/presentation/orders/dto/order-response.dto.ts
export interface OrderResponseDto {
  id: string;
  status: 'PENDING' | 'CONFIRMED';
  quoteId: string;
  quote: { miles: number; taxesBrl: number; carrier: string };
  passenger: { name: string; document: string };
  createdAt: string; // ISO 8601, serializado pelo Nest a partir do Date do Prisma
}
```

Resposta 201 — exemplo (campo `quote` é o novo desta revisão; `taxesBrl` volta em reais, `38.5`,
mesmo tendo sido persistido como `3850` centavos):

```json
{
  "id": "8f14e45f-ceea-4e07-9f5a-1c3b2c7a9b11",
  "status": "CONFIRMED",
  "quoteId": "quote-abc123",
  "quote": { "miles": 18500, "taxesBrl": 38.5, "carrier": "GOL" },
  "passenger": { "name": "Maria da Silva", "document": "52998224725" },
  "createdAt": "2026-08-17T18:00:00.000Z"
}
```

`status` é tipado como `'PENDING' | 'CONFIRMED'` porque uma resposta de conflito (`P2002`) pode, em
tese, capturar a linha exatamente na janela entre o `INSERT` e o `UPDATE` de outra requisição
concorrente (ver "Casos de borda") — na prática, sob o timing normal de teste, é quase sempre
`CONFIRMED`.

```ts
// api/src/infrastructure/prisma/prisma-error.util.ts (assinatura, inalterado)

/** Genérico — sem conhecimento de `orders`. Reaproveitável por qualquer feature com constraint
 * única no banco. */
export function isUniqueConstraintViolation(error: unknown, field: string): boolean;
```

```ts
// api/src/infrastructure/orders/orders.repository.ts (assinatura + fluxo, atualizado)

export interface CreateOrderInput {
  quoteId: string;
  idempotencyKey: string;
  passenger: { name: string; document: string };
  quote: { miles: number; taxesBrl: number; carrier: string };
}

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { passenger: true; quoteSnapshot: true };
}>;

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrGetExisting(input: CreateOrderInput): Promise<OrderWithRelations>;
}
```

Fluxo de `createOrGetExisting` (atualizado — a única mudança em relação à versão anterior é o
`quoteSnapshot` na escrita aninhada e no `include`; a lógica de conflito/conflito não muda):
1. `prisma.order.create({ data: { quoteId, idempotencyKey, passenger: { create: { name, document } }, quoteSnapshot: { create: { miles: input.quote.miles, taxesBrlCents: reaisToCents(input.quote.taxesBrl), carrier: input.quote.carrier } } }, include: { passenger: true, quoteSnapshot: true } })` — escrita aninhada, uma única transação implícita (Passenger + QuoteSnapshot + Order); `status` nasce `PENDING` (default do schema, não passado explicitamente); a conversão para centavos acontece **antes** desta chamada, não depois.
2. Se (1) tiver sucesso: `prisma.order.update({ where: { id: created.id }, data: { status: 'CONFIRMED' }, include: { passenger: true, quoteSnapshot: true } })` — segunda escrita, independente, committa separadamente (é essa separação que torna `PENDING` observável por uma requisição concorrente — ver "Arquitetura decidida"). Retorna o resultado do `update`.
3. Se (1) rejeitar: `isUniqueConstraintViolation(error, 'idempotencyKey')` decide o caminho.
   - Se `true`: `prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { passenger: true, quoteSnapshot: true } })`. Se encontrado, retorna como está (`PENDING` ou `CONFIRMED`, o que estiver persistido no momento da leitura). Se `null` (janela teoricamente impossível neste desafio — sem fluxo de exclusão de `Order`), relança o erro original de `(1)`.
   - Se `false` (qualquer outro erro — conexão, violação inesperada): relança como está; `AllExceptionsFilter` cobre como 500 `INTERNAL_ERROR`.

```ts
// api/src/presentation/orders/order-response.mapper.ts (assinatura, atualizado)

/** Função pura, sem import de @nestjs/*. Converte QuoteSnapshot.taxesBrlCents de volta para
 * reais via centsToReais (domain/orders/money.ts). */
export function mapOrderToResponse(order: OrderWithRelations): OrderResponseDto;
```

```ts
// api/src/presentation/orders/orders.controller.ts (assinatura, atualizado)

@Controller()
export class OrdersController {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  @Post('orders')
  async create(@Body() dto: CreateOrderRequestDto): Promise<OrderResponseDto> {
    const order = await this.ordersRepository.createOrGetExisting({
      quoteId: dto.quoteId,
      idempotencyKey: dto.idempotencyKey,
      passenger: { name: dto.passenger.name, document: dto.passenger.document },
      quote: {
        miles: dto.quote.miles,
        taxesBrl: dto.quote.taxesBrl,
        carrier: dto.quote.carrier,
      },
    });

    return mapOrderToResponse(order);
  }
}
```

Erro de validação (400) segue exatamente o mesmo envelope da DSM-5 (`AllExceptionsFilter` +
`validationExceptionFactory`, reaproveitados sem alteração):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Requisição inválida.",
    "fields": [
      { "field": "quoteId", "code": "FIELD_REQUIRED", "message": "quoteId should not be empty" },
      { "field": "passenger.document", "code": "FIELD_REQUIRED", "message": "document should not be empty" }
    ]
  }
}
```

Exemplo já existente — `document` presente mas CPF inválido (formato ou dígito verificador):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Requisição inválida.",
    "fields": [
      { "field": "passenger.document", "code": "INVALID_CPF", "message": "document deve ser um CPF válido" }
    ]
  }
}
```

Exemplo novo desta revisão — `quote.miles` presente mas fora do intervalo permitido:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Requisição inválida.",
    "fields": [
      { "field": "quote.miles", "code": "INVALID_QUOTE_VALUE", "message": "miles must not be less than 1" }
    ]
  }
}
```

## Sequência de implementação

- [ ] Editar `api/prisma/schema.prisma`: adicionar `model QuoteSnapshot` e as colunas
      `Order.quoteSnapshotId`/`Order.quoteSnapshot` (conteúdo exato acima) — não tocar em nenhum
      campo já existente de `Order`/`Passenger`.
- [ ] Rodar `cd api && npx prisma migrate dev --name add_quote_snapshot` contra o Postgres do
      `docker-compose` (de pé antes) — gera uma migration **nova**, aditiva sobre
      `20260817170615_init_order/` (não editar/apagar essa migration existente).
- [ ] Rodar `npm run prisma:generate` — confirma que o client gerado expõe `prisma.quoteSnapshot`
      e que `Order` inclui `quoteSnapshotId`/`quoteSnapshot` sem erro de tipo.
- [ ] Criar `api/src/domain/orders/money.ts` (`reaisToCents`/`centsToReais`) +
      `money.spec.ts` — antes de qualquer coisa que dependa dele.
- [ ] Criar `api/src/presentation/orders/dto/quote.dto.ts` (`QuoteDto`) + `quote.dto.spec.ts`.
- [ ] Atualizar `api/src/presentation/orders/dto/create-order-request.dto.ts` — adicionar `quote:
      QuoteDto` nested; atualizar `create-order-request.dto.spec.ts` com os novos casos.
- [ ] Atualizar `api/src/common/validation/constraint-error-codes.ts` (`isInt`/`isNumber`/`min`) e
      `api/src/common/validation/validation-exception-factory.ts` (`CONSTRAINT_PRIORITY`).
- [ ] Atualizar `api/src/infrastructure/orders/orders.repository.ts` — `CreateOrderInput.quote`,
      renomear `OrderWithPassenger` → `OrderWithRelations`, escrita aninhada de `quoteSnapshot`
      com `reaisToCents`, `include` atualizado nas três operações (`create`/`update`/
      `findUnique`); atualizar `orders.repository.spec.ts`.
- [ ] Atualizar `api/src/presentation/orders/dto/order-response.dto.ts` (campo `quote`) e
      `api/src/presentation/orders/order-response.mapper.ts` (monta `quote` com `centsToReais`,
      usa `OrderWithRelations`); atualizar `order-response.mapper.spec.ts`.
- [ ] Atualizar `api/src/presentation/orders/orders.controller.ts` (extrai `quote` do dto);
      atualizar `orders.controller.spec.ts`.
- [ ] Atualizar `api/src/presentation/orders/orders.e2e-spec.ts` — `validBody` com `quote`, novas
      asserções AC1/AC2/AC3 sobre `quote`, novos casos AC5, `afterEach` capturando
      `quoteSnapshotId` (requer `docker compose up -d` de pé).
- [ ] Rodar `npm run lint` e `npm test` em `api/` (com `docker compose up -d` ativo) antes de
      considerar a story pronta.
- [ ] **Não** alterar `DECISIONS.md` nesta story (mesma pendência já sinalizada na versão anterior
      desta spec, sobre a simplificação de `quoteId`).
- [ ] **Não** alterar `claude/specs/DSM-6/spec.md` — regra de processo: specs de stories já
      commitadas não são editadas retroativamente (ver "Contexto").
- [ ] Commit: `feat(DSM-7): endpoint POST /orders com idempotência garantida por constraint única`
      (se ainda não commitado) — ou um commit adicional específico desta revisão se a versão sem
      snapshot já tiver sido commitada antes desta spec chegar ao desenvolvedor (confirmar estado
      real do git antes de decidir).

## Casos de borda e riscos tratados

| Caso/risco | Tratamento decidido |
|---|---|
| `POST /orders` válido, `idempotencyKey` nova (AC1) | `INSERT` (nested `passenger` + `quoteSnapshot`) + `UPDATE` para `CONFIRMED` — 201, corpo com `id`/`status: 'CONFIRMED'`/`quoteId`/`quote`/`passenger`/`createdAt`. |
| Reenvio sequencial da mesma `idempotencyKey`, depois que o primeiro já terminou (AC2) | `INSERT` falha com `P2002`; `isUniqueConstraintViolation` confirma; `SELECT` pelo existente devolve a mesma linha (já `CONFIRMED` a essa altura, com o mesmo `quote`) — mesmo `id`, 201. |
| Duas requisições concorrentes, mesma instância, mesma `idempotencyKey` (AC3) | Uma vence o `INSERT`; a outra bloqueia até o commit do `INSERT` vencedor e falha com `P2002` (constraint do Postgres) — nunca as duas inserem. A perdedora cai no caminho de `SELECT`. Só um registro de `Order`/`Passenger`/`QuoteSnapshot` no banco ao final; ambas as respostas HTTP trazem o mesmo `id` e o mesmo `quote`. |
| A requisição perdedora captura a linha vencedora ainda `PENDING` (janela entre o `INSERT` e o `UPDATE` do vencedor) | **Aceito, decisão central desta story, sem mudança nesta revisão** — a perdedora devolve a linha como está (`status: 'PENDING'`), sem esperar/repetir a leitura. Ambas as respostas continuam trazendo o mesmo `id`, que é o que a AC3/AC4 exigem literalmente. |
| Duas instâncias da API (portas diferentes) apontando pro mesmo Postgres, mesma `idempotencyKey` (AC4) | Idêntico ao caso de instância única — a garantia é 100% do banco (constraint `@unique`), `OrdersRepository`/`PrismaService` não guardam nenhum estado em memória de idempotência. |
| `quoteId` ausente/vazio | 400, `code: 'FIELD_REQUIRED'`, nenhuma linha criada. Não há caminho 404 nem mudou com esta revisão. |
| `quote` ausente/`null`/`{}` | 400, `code: 'FIELD_REQUIRED'` (via `isNotEmptyObject`) — mesmo tratamento já usado para `passenger` ausente. |
| `quote.miles` ausente, ou de tipo errado (string, float) | 400, `code: 'FIELD_REQUIRED'` (`isInt`, mesmo raciocínio de `isString` já cobrindo "ausente ou tipo errado" para os campos raiz existentes). |
| `quote.miles` presente, inteiro, mas `< 1` (ex. `0`, negativo) | 400, `code: 'INVALID_QUOTE_VALUE'` (`min`). |
| `quote.taxesBrl` ausente, ou não-numérico | 400, `code: 'FIELD_REQUIRED'` (`isNumber`). |
| `quote.taxesBrl` presente, numérico, mas `< 0` | 400, `code: 'INVALID_QUOTE_VALUE'` (`min`). |
| `quote.taxesBrl` com mais de 2 casas decimais (ex. `38.505`) | 400, `code: 'FIELD_REQUIRED'` (via `maxDecimalPlaces` de `@IsNumber`) — rejeitado explicitamente na validação de entrada, em vez de arredondado silenciosamente na conversão para centavos (ver "Arquitetura decidida"). |
| `quote.carrier` ausente/vazio | 400, `code: 'FIELD_REQUIRED'` (`isNotEmpty`), mesmo padrão de `passenger.name`. |
| Dados de passageiro incompletos (`name`/`document` ausentes) | 400, `fields` com uma entrada por subcampo (`passenger.name`/`passenger.document`), `code: 'FIELD_REQUIRED'` — nenhuma linha criada, nem `Passenger`/`QuoteSnapshot` órfão (a escrita aninhada nunca chega a ser tentada, a requisição é rejeitada pelo `ValidationPipe` antes do controller). |
| `passenger.document` presente mas com dígito verificador de CPF inválido | 400, `code: 'INVALID_CPF'`, nenhuma linha criada — sem mudança nesta revisão. |
| `passenger.document` em sequência de dígitos repetidos | 400, `code: 'INVALID_CPF'` — sem mudança nesta revisão. |
| `Order` criado sem `QuoteSnapshot` correspondente | **Eliminado pelo schema**, mesma garantia já usada para `Passenger` (DSM-6, Revisão 2) — `Order.quoteSnapshotId` é coluna obrigatória; o Postgres rejeita qualquer `INSERT` em `Order` sem um `quoteSnapshotId` válido. |
| Um `QuoteSnapshot` fica órfão depois que o `Order` associado é removido | **Risco aceito**, mesmo padrão já aceito para `Passenger` (FK em `Order → QuoteSnapshot`, cascade só se propaga no sentido "referenciada → que referencia") — sem fluxo de exclusão de pedido no desafio. |
| Perda de precisão silenciosa na conversão reais→centavos | Evitada na validação de entrada (`maxDecimalPlaces: 2` em `QuoteDto.taxesBrl`), não na conversão em si — `Math.round` em `reaisToCents` cobre só a imprecisão residual de ponto flutuante do próprio JS (ex. `38.50 * 100` chegando como `3849.999999999996`), não valores de entrada com mais de 2 casas decimais (esses já são rejeitados antes). |
| `NOT NULL` em `Order.quoteSnapshotId` numa tabela `Order` com linhas pré-existentes (sem `QuoteSnapshot`) | **Não é um risco real neste ambiente** — a tabela `Order` local só recebe linhas de teste, que se limpam sozinhas (`afterEach`/`afterAll` dos specs de integração); se em algum momento houver dado real acumulado sem passar por teste, `prisma migrate dev` recusa aplicar a migration sem um valor default ou uma migration em duas etapas — sinalizado aqui só como caveat de ambiente, não tratado em código. |
| Reenvio da mesma `idempotencyKey` com `quoteId`/passageiro/`quote` **diferentes** do envio original | **Risco conhecido, não tratado** — decisão já herdada da DSM-6 ("sem fingerprint/hash do payload"), agora também cobrindo `quote`. A segunda chamada recebe de volta silenciosamente o snapshot da primeira. Aditivo se precisar depois (campo `requestFingerprint` + comparação no `OrdersRepository`). |
| `findUnique` não encontra nada depois de um `P2002` (teoricamente impossível neste desafio) | Relança o erro original `P2002` — 500 `INTERNAL_ERROR`, logado. Sem mudança nesta revisão. |
| `P2002` disparado por `passengerId`/`quoteSnapshotId` em vez de `idempotencyKey` (colisão de UUID recém-gerado — astronomicamente improvável) | `isUniqueConstraintViolation(error, 'idempotencyKey')` retorna `false` nesse caso — o erro é relançado como está, vira 500 em vez de ser mascarado como um conflito de idempotência que não é. |
| Corpo malformado / `Content-Type` errado | Mesmo comportamento herdado do parser padrão do Nest/Express + `AllExceptionsFilter`, sem mudança. |
| `PENDING` "preso para sempre" se o processo cair entre o `INSERT` e o `UPDATE` | Risco aceito, já documentado na DSM-6/versão anterior desta spec — sem mudança nesta revisão. |

## Plano de testes

**`money.spec.ts`** (unitário, sem banco, sem subir o Nest)
- `reaisToCents(38.50)` → `3850`.
- `reaisToCents(0)` → `0`.
- `reaisToCents(75.51)` → `7551` (protege contra imprecisão de ponto flutuante — `75.51 * 100`
  cru em JS pode não fechar exatamente em `7551`).
- `centsToReais(3850)` → `38.5`.
- `centsToReais(0)` → `0`.
- Round-trip: `centsToReais(reaisToCents(38.50))` → `38.5`.

**`quote.dto.spec.ts`** (`plainToInstance` + `validate()`, sem subir o Nest)
- Body válido (`{ miles: 18500, taxesBrl: 38.50, carrier: 'GOL' }`) → `[]`.
- `miles` ausente → `constraints.isInt`.
- `miles = 0` → `constraints.min`.
- `miles` como string → `constraints.isInt`.
- `taxesBrl` ausente → `constraints.isNumber`.
- `taxesBrl = -1` → `constraints.min`.
- `taxesBrl = 38.505` (3 casas decimais) → `constraints.isNumber` (via `maxDecimalPlaces`).
- `carrier` ausente/vazio → `constraints.isNotEmpty`.

**`is-valid-cpf.validator.spec.ts`**, **`prisma-error.util.spec.ts`** — inalterados por esta
revisão, ver versão anterior deste spec para o conteúdo completo (já implementados).

**`orders.repository.spec.ts`** (unitário — mocka `PrismaService` via DI, sem banco real)
- Caminho feliz: `prisma.order.create` é chamado com `quoteSnapshot: { create: { miles:
  input.quote.miles, taxesBrlCents: 3850, carrier: input.quote.carrier } }` quando
  `input.quote.taxesBrl = 38.50` — confirma a conversão reais→centavos acontecendo **antes** da
  chamada ao Prisma, não depois. `prisma.order.update` é chamado com
  `include: { passenger: true, quoteSnapshot: true }` e o resultado de `update` é devolvido.
- Conflito: `prisma.order.create` rejeita com um erro `P2002` de `idempotencyKey` →
  `prisma.order.update` **não** é chamado; `prisma.order.findUnique` é chamado com
  `{ idempotencyKey }` e `include: { passenger: true, quoteSnapshot: true }`; o método devolve o
  resultado de `findUnique`.
- Conflito sem registro encontrado (`findUnique` devolve `null`) → o método relança o erro original
  de `create`.
- Erro não relacionado a `P2002` em `create` → relançado sem tentar `findUnique`.

**`create-order-request.dto.spec.ts`** (`plainToInstance` + `validate()`, sem subir o Nest)
- Body totalmente válido (com `quote` presente e válido) → `[]`.
- `quoteId`/`idempotencyKey` ausentes, `passenger`/subcampos ausentes/inválidos — casos já
  existentes, sem mudança.
- `quote` ausente → erro no campo `quote` (`isNotEmptyObject`).
- `quote.miles`/`quote.taxesBrl`/`quote.carrier` ausentes → erro aninhado (`children`), confirma
  `field: 'quote.miles'`/`'quote.taxesBrl'`/`'quote.carrier'` via `flattenErrors`.
- Códigos finais via `validationExceptionFactory`: `quote.miles` ausente → `'FIELD_REQUIRED'`;
  `quote.miles = 0` → `'INVALID_QUOTE_VALUE'`; `quote.taxesBrl = -1` → `'INVALID_QUOTE_VALUE'`;
  `quote.taxesBrl = 38.505` → `'FIELD_REQUIRED'`.

**`order-response.mapper.spec.ts`**
- `OrderWithRelations` com `quoteSnapshot: { miles: 18500, taxesBrlCents: 3850, carrier: 'GOL',
  ... }` → `mapOrderToResponse(...).quote` é exatamente `{ miles: 18500, taxesBrl: 38.5, carrier:
  'GOL' }` — confirma a conversão centavos→reais na resposta.
- Continua confirmando que campos fora do contrato (`idempotencyKey`, `passengerId`,
  `quoteSnapshotId`, `updatedAt`) não vazam na resposta.

**`orders.controller.spec.ts`** (mock de `OrdersRepository` via DI)
- `ordersRepository.createOrGetExisting` é chamado também com `quote: { miles, taxesBrl, carrier }`
  extraídos do DTO (não o DTO inteiro).
- Resposta do controller continua exatamente `mapOrderToResponse(ordemMockada)`.

**`orders.e2e-spec.ts`** (integração real — Postgres real via `docker compose up -d`)
- `validBody` passa a incluir `quote: { miles: 18500, taxesBrl: 38.50, carrier: 'GOL' }`.
- **AC1:** resposta 201 inclui `quote: { miles: 18500, taxesBrl: 38.5, carrier: 'GOL' }`; leitura
  direta via `prisma.order.findUnique({ where: { id }, include: { quoteSnapshot: true } })`
  confirma `quoteSnapshot.taxesBrlCents === 3850` no banco — prova que a coluna real é inteiro em
  centavos, não float.
- **AC2/AC3:** as respostas duplicadas/concorrentes continuam trazendo o mesmo `id` **e** o mesmo
  `quote`; `prisma.quoteSnapshot.count(...)` (via `passengerId`/`quoteSnapshotId` do `Order`
  encontrado) é `1`, sem duplicação nem órfão, mesmo padrão já provado para `Passenger`.
- **AC5 (`quote` ausente):** 400, `fields` contém `{ field: 'quote', code: 'FIELD_REQUIRED' }`;
  nenhum `Order`/`Passenger`/`QuoteSnapshot` criado.
- **AC5 (`quote.miles` inválido, ex. `0`):** 400, `fields` contém `{ field: 'quote.miles', code:
  'INVALID_QUOTE_VALUE' }`; nenhuma linha criada.
- **AC5 (reaproveitamento de `idempotencyKey` após tentativa inválida por `quote`):** tentativa
  inválida (sem `quote`) → 400; tentativa seguinte com o mesmo `idempotencyKey` e dados válidos →
  201, sem tratamento de duplicata — mesma prova de "sem estado residual" já feita para `quoteId`/
  CPF.
- Casos já existentes (AC1 básico, AC2, AC3, AC5 `quoteId`/passageiro/CPF) continuam válidos, só
  com `quote` adicionado ao `validBody` usado em todos eles.
- `afterEach`: além de capturar `passengerId` antes de apagar os `Order` de teste, passa a
  capturar também `quoteSnapshotId`; ordem de limpeza: `Order` primeiro, depois
  `Passenger`/`QuoteSnapshot` (ambos agora órfãos, livres do `onDelete: Restrict`).
- `afterAll`: `app.close()` — sem mudança.

Fora do escopo de teste desta story (fica para a DSM-8, obrigatória/RF4): disparar duas instâncias
reais da API em portas diferentes e comparar as respostas entre elas — sem mudança nesta revisão.
