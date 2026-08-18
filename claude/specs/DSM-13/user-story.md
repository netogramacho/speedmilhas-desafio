## [ ] DSM-13 — [BÔNUS] Circuit breaker para o Fornecedor B

**Descrição:** Como serviço de busca, quero parar de chamar o Fornecedor B temporariamente quando
ele estiver falhando ou dando rate limit de forma consistente, para que a aplicação não gaste o
orçamento de tempo da busca tentando um fornecedor que provavelmente vai falhar, e para não
contribuir para o próprio rate limit do fornecedor.

**Critérios de aceite:**
- [ ] Dado um número configurável de falhas/429 consecutivos do fornecedor B, quando o limite é
      atingido, então o circuito abre e chamadas subsequentes ao fornecedor B são puladas
      (marcadas direto como "indisponível") por um período definido, sem tentar a chamada HTTP.
- [ ] Dado o circuito aberto, quando o período de resfriamento expira, então uma próxima busca
      tenta novamente o fornecedor B (estado "meio-aberto") antes de voltar ao normal.
- [ ] Dado o circuito aberto, quando uma busca é feita, então o resultado da busca ainda é
      devolvido dentro do teto de 6s (o tempo economizado ao não chamar B deve refletir numa
      resposta mais rápida, não igual).

**Fora de escopo:** circuit breaker para os fornecedores A e C (não é o fornecedor problemático
citado no enunciado).

**Prioridade:** Baixa (bônus). Só vale a pena após DSM-1 a DSM-10 estarem completos e testados.
