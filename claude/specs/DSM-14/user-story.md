## [ ] DSM-14 — [BÔNUS] Teste automatizado de falha parcial do RF1

**Descrição:** Como time de engenharia, quero um teste automatizado que force falha/timeout em um
ou mais fornecedores (via `/admin/force-fail` e `/admin/force-slow`) e verifique que `POST /search`
responde parcial dentro do teto de tempo, para provar objetivamente o comportamento central do RF1
e evitar regressão.

**Critérios de aceite:**
- [ ] Dado o mock configurado via `/admin/force-fail/supplier-b` antes do teste, quando
      `POST /search` é chamado, então o teste verifica que a resposta tem `status: "partial"`,
      contém cotações de A e C, e indica B como falho.
- [ ] Dado o mock configurado via `/admin/force-slow/supplier-b` (8s) antes do teste, quando
      `POST /search` é chamado, então o teste verifica que o tempo de resposta medido é ≤ 6s e que B
      aparece como timeout.
- [ ] Dado o teste, quando finalizado, então restaura o estado do mock via `/admin/reset` (não deixa
      efeito colateral para outros testes).

**Fora de escopo:** cobrir todas as combinações possíveis de falha simultânea de múltiplos
fornecedores — um cenário representativo de cada tipo (falha dura, timeout) é suficiente.

**Prioridade:** Baixa (bônus), mas entre os bônus é o de maior valor relativo por reforçar
diretamente um requisito obrigatório (RF1) já validado manualmente — se sobrar tempo, priorizar
este antes de DSM-12/DSM-13/DSM-15.
