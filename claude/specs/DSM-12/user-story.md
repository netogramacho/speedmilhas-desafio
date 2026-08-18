## [ ] DSM-12 — [BÔNUS] Cache de buscas repetidas

**Descrição:** Como usuário da tela de busca, quero que buscas idênticas recentes (mesma origem,
destino e data) respondam quase instantaneamente, para que eu não precise esperar os fornecedores
de novo ao refazer a mesma pesquisa.

**Critérios de aceite:**
- [ ] Dado um `POST /search` já respondido com sucesso completo para uma combinação de
      origem/destino/data, quando a mesma combinação é buscada novamente dentro de uma janela de
      tempo definida (ex.: 60s, valor documentado), então a resposta vem do cache, sem novas
      chamadas aos fornecedores (verificável via `/admin/stats` do mock, cujo contador não deve
      subir).
- [ ] Dado um resultado parcial (algum fornecedor falhou), quando armazenado, então a decisão de
      cachear ou não um resultado parcial é explícita e documentada (ex.: só cachear resultado
      completo, para não perpetuar uma falha temporária de fornecedor).
- [ ] Dado o cache expirado, quando a mesma busca é refeita, então os fornecedores são consultados
      novamente normalmente.

**Fora de escopo:** invalidação de cache por evento externo (não existe esse gatilho no desafio).

**Prioridade:** Baixa (bônus). Só implementar se RF1-RF4 estiverem sólidos e testados; um bônus mal
feito conta menos que tempo investido em polir os requisitos obrigatórios.
