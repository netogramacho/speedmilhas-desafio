## [ ] DSM-5 — Endpoint `POST /search`

**Descrição:** Como cliente da API (a tela de busca ou qualquer integrador), quero enviar
origem, destino e data e receber cotações agregadas com indicação clara de quais fornecedores
responderam, para que eu possa mostrar resultados ao usuário mesmo quando nem tudo chegou.

**Critérios de aceite:**
- [ ] Dado um body `{ origin, destination, date }` válido (aeroportos dentre os suportados, data em
      formato aceito), quando `POST /search` é chamado, então retorna 200 com a lista de cotações
      agregadas (DSM-4) e um campo indicando, por fornecedor, se respondeu, falhou ou deu timeout
      (ex.: `suppliers: { a: "ok", b: "timeout", c: "ok" }` ou estrutura equivalente).
- [ ] Dado que todos os fornecedores responderam com sucesso, quando `POST /search` retorna, então
      o campo de status geral indica resultado completo (ex.: `status: "complete"`), distinto do
      caso parcial.
- [ ] Dado que ao menos um fornecedor falhou/deu timeout mas ao menos um respondeu, quando
      `POST /search` retorna, então o campo de status geral indica resultado parcial (ex.:
      `status: "partial"`), e o corpo ainda traz as cotações que chegaram.
- [ ] Dado um body com campos obrigatórios ausentes ou aeroporto/data inválidos, quando
      `POST /search` é chamado, então retorna 400 com mensagem indicando qual campo é inválido,
      sem chamar nenhum fornecedor.
- [ ] Dado qualquer chamada válida, quando medido o tempo de resposta end-to-end do endpoint
      (não só da camada interna), então nunca ultrapassa 6 segundos.

**Fora de escopo:** autenticação do endpoint (fora de escopo do desafio); paginação (bônus, DSM-14);
cache (bônus, DSM-11).

**Prioridade:** Alta. É o contrato público do RF1 — depende de DSM-1 a DSM-4 e é pré-requisito direto
da DSM-9 (tela de busca).
