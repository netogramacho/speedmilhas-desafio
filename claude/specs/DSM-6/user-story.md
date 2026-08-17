## [ ] DSM-6 — Modelagem de dados para pedidos e idempotência (Prisma)

**Descrição:** Como time de engenharia, quero um schema de banco que garanta unicidade de reserva
por `idempotencyKey` no nível do banco de dados, para que a idempotência não dependa de nenhum
estado em memória de um processo específico.

**Critérios de aceite:**
- [ ] Dado o schema Prisma proposto, quando aplicado via migration, então existe uma tabela/model
      de pedidos (order) com um campo `idempotencyKey` com constraint de unicidade (`@unique`) no
      nível do banco — não apenas validação em código.
- [ ] Dado o model de pedido, quando desenhado, então guarda os dados mínimos para responder de
      forma idêntica a requisições repetidas: `quoteId`, dados do passageiro, e o resultado da
      reserva (ex.: id gerado, status).
- [ ] Dado o schema, quando revisado, então contempla um estado explícito para o pedido (ex.:
      `PENDING`/`CONFIRMED`) que permite diferenciar "reserva já em andamento por outra requisição
      concorrente" de "reserva já concluída", cobrindo a corrida entre duas requisições simultâneas.
- [ ] Dado o comando `npm run prisma:generate` (ou migration equivalente) executado a partir do
      schema, quando rodado, então conclui sem erro e o client gerado expõe o novo model.

**Fora de escopo:** a lógica do endpoint `POST /orders` (DSM-7); o teste de concorrência (DSM-8).

**Prioridade:** Alta. É pré-requisito direto do RF2 — sem constraint de unicidade no banco, nenhuma
lógica de aplicação garante idempotência entre processos distintos (o requisito explícito do
desafio: duas instâncias, sem estado em memória compartilhado).
