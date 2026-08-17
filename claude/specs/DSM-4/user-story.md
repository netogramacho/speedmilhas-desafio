## [ ] DSM-4 — Agregação paralela com timeout global e resultado parcial

**Descrição:** Como serviço de busca, quero consultar os três fornecedores em paralelo respeitando
um teto de tempo total, para que a busca sempre responda dentro de 6 segundos mesmo se algum
fornecedor estiver lento ou fora do ar.

**Critérios de aceite:**
- [ ] Dado que os três fornecedores respondem dentro do tempo normal, quando a busca é executada,
      então as três chamadas (DSM-1, DSM-2, DSM-3) acontecem em paralelo (não sequencialmente) e o
      tempo total de resposta é aproximadamente o da chamada mais lenta, não a soma das três.
- [ ] Dado que o fornecedor B está configurado para responder em 8 segundos (via
      `/admin/force-slow/supplier-b`), quando a busca é executada, então a resposta completa é
      devolvida em até 6 segundos, com o fornecedor B marcado como "não respondeu a tempo"
      (timeout), e as cotações de A e C presentes.
- [ ] Dado que um fornecedor está configurado para falhar 100% via `/admin/force-fail`, quando a
      busca é executada, então a resposta é 200 (não erro), contém as cotações dos fornecedores que
      responderam, e indica explicitamente esse fornecedor como "falhou" — nunca silenciosamente
      omitido.
- [ ] Dado que todos os fornecedores falham ou estouram timeout, quando a busca é executada, então
      a resposta ainda é bem formada (não erro 500), com lista de cotações vazia e os três
      fornecedores marcados como não respondidos.
- [ ] Dado que pelo menos um fornecedor respondeu, quando a busca monta o resultado, então as
      cotações agregadas de todos os fornecedores que responderam são ordenadas por menor número de
      milhas primeiro.
- [ ] Dado o teste de carga descrito acima com `/admin/force-slow`, quando medido, então o tempo de
      resposta observado é consistentemente ≤ 6s em múltiplas execuções (não só na média).

**Fora de escopo:** o endpoint HTTP `POST /search` em si (é a DSM-5); a UI que consome esse
resultado (DSM-9). Retry ou circuit breaker (bônus, DSM-12).

**Prioridade:** Alta. É o núcleo do RF1 — junta as três normalizações e resolve a restrição mais
citada do desafio (teto de 6s + resultado parcial). Sem essa story, A/B/C normalizados isoladamente
não valem nada para o usuário final.
