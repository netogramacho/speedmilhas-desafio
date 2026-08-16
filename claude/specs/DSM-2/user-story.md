## [ ] DSM-2 — Cliente HTTP e normalizador do Fornecedor B (rate limit e 429)

**Descrição:** Como serviço de busca, quero consultar o Fornecedor B e converter sua resposta
aninhada para o formato interno único, tratando corretamente o rate limit, para que uma busca não
falhe só porque o fornecedor mais lento e mais instável está sobrecarregado.

**Critérios de aceite:**
- [ ] Dado uma origem, destino e data válidos, quando o serviço chama `GET /supplier-b/search`, então
      usa os parâmetros `from`, `to`, `day` (nomes divergentes do fornecedor B).
- [ ] Dado um retorno 200 com `dados: [{ pontos, taxa: { valor, moeda }, cia }]`, quando normalizado,
      então cada item vira o mesmo formato interno usado pelo fornecedor A (milhas, taxa em BRL,
      nome da companhia por extenso, origem = fornecedor B).
- [ ] Dado que o fornecedor B responde 429 com header `Retry-After`, quando o serviço recebe essa
      resposta, então trata como falha desse fornecedor para a busca atual (sem re-tentar
      indefinidamente dentro do orçamento de tempo da busca) e registra que houve rate limit,
      distinto de um erro 500 genérico.
- [ ] Dado que o fornecedor B responde 500 ou demora acima do timeout individual, quando tratado,
      então o comportamento é equivalente ao da DSM-1 (falha isolada, sem exceção não tratada, sem
      travar o restante do fluxo).
- [ ] Dado que a taxa vem com `moeda` diferente de `BRL` (se o mock permitir), quando normalizado,
      então o valor não é somado silenciosamente como se fosse BRL — decisão explícita (descartar
      ou converter) fica registrada em comentário/DECISIONS.md.

**Fora de escopo:** implementar um limitador de taxa de saída (throttling) para nunca estourar os
5 req/s do fornecedor B — isso é o bônus "circuit breaker" (DSM-12). Aqui só se trata a resposta
429 quando ela acontece.

**Prioridade:** Alta. É o fornecedor que mais ameaça o teto de 6s do RF1 (latência de até 5s) — a
DSM-4 (agregação com timeout) depende de saber como uma chamada a B se comporta quando falha ou
demora.
