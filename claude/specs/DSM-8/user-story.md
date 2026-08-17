## [ ] DSM-8 — Teste automatizado de concorrência real (RF4)

**Descrição:** Como time de engenharia, quero um teste automatizado que dispare de verdade duas
requisições simultâneas de `POST /orders` com a mesma `idempotencyKey` contra a API rodando, para
provar objetivamente que o RF2 funciona e para evitar regressão futura.

**Critérios de aceite:**
- [ ] Dado o comando `cd api && npm test`, quando executado, então o teste sobe (ou assume já
      subida, conforme a estratégia escolhida e documentada) a aplicação real e o Postgres real —
      sem mockar a camada de persistência nem o controller de `/orders`.
- [ ] Dado o teste, quando executado, então dispara as duas requisições HTTP `POST /orders` com a
      mesma `idempotencyKey` de forma efetivamente concorrente (ex.: `Promise.all`), não uma após a
      outra.
- [ ] Dado as duas respostas recebidas, quando comparadas no teste, então o teste falha
      explicitamente se os ids de pedido retornados forem diferentes, ou se houver mais de um
      registro de pedido no banco para aquela `idempotencyKey`.
- [ ] Dado que o desafio exige comprovar o comportamento com duas instâncias da aplicação, quando o
      teste é desenhado, então cobre esse cenário (duas instâncias em portas diferentes) — se por
      restrição de tempo/CI isso não for viável de automatizar completamente, a limitação e como
      foi validada manualmente ficam registradas em DECISIONS.md.
- [ ] Dado o teste rodando repetidamente (ex.: 5x seguidas), quando executado, então passa de forma
      consistente (não é flaky) — não depende de timing coincidental para "passar por sorte".

**Fora de escopo:** testes de carga/performance; cobertura de outros endpoints além de `/orders`
neste teste específico (a DSM-4 já tem seus próprios critérios de comportamento sob timeout, que
podem virar teste de falha parcial no bônus DSM-13).

**Prioridade:** Alta. É requisito obrigatório explícito do desafio (RF4) e a única prova objetiva de
que a DSM-7 está correta — sem isso, a alegação de idempotência entre instâncias não é verificável.
