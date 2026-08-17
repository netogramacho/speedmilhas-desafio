## [ ] DSM-7 — Endpoint `POST /orders` com idempotência garantida entre instâncias

**Descrição:** Como cliente da API, quero enviar `{ quoteId, passageiro, idempotencyKey }` e ter a
garantia de que reenviar a mesma `idempotencyKey` — inclusive simultaneamente e contra instâncias
diferentes da aplicação — nunca cria uma segunda reserva, para que o mesmo assento não seja vendido
duas vezes.

**Critérios de aceite:**
- [ ] Dado um `POST /orders` válido com uma `idempotencyKey` nova, quando processado, então cria um
      único registro de pedido e retorna 201 com os dados da reserva (incluindo um identificador
      único do pedido).
- [ ] Dado um `POST /orders` repetido com a mesma `idempotencyKey` já processada anteriormente,
      quando chamado (sequencialmente, depois que o primeiro já terminou), então retorna a mesma
      resposta (mesmo id de pedido) da primeira chamada, sem criar novo registro no banco.
- [ ] Dado dois `POST /orders` com a mesma `idempotencyKey`, disparados praticamente ao mesmo tempo
      contra a mesma instância da API, quando ambos são processados, então apenas um registro de
      pedido existe no banco ao final, e as duas respostas HTTP contêm o mesmo id de pedido.
- [ ] Dado o mesmo cenário acima, mas as duas requisições disparadas contra duas instâncias
      diferentes da aplicação (portas distintas, ex. 3000 e 3010, ambas apontando para o mesmo
      Postgres), quando ambos são processados, então o resultado é idêntico ao caso de instância
      única: um único registro no banco, respostas equivalentes.
- [ ] Dado um `POST /orders` com `quoteId` inexistente/inválido ou dados de passageiro incompletos,
      quando chamado, então retorna 400/404 apropriado e não cria pedido nenhum, mesmo se a
      `idempotencyKey` for reaproveitada depois com dados válidos.

**Fora de escopo:** validar se o `quoteId` referencia uma cotação real vinda de uma busca anterior
persistida (o desafio não exige persistir cotações de busca) — decisão sobre isso deve ficar
registrada em DECISIONS.md se simplificada.

**Prioridade:** Alta. É o comportamento central do RF2, o requisito mais citado como "não é teste
de CRUD" — depende diretamente da DSM-6.
