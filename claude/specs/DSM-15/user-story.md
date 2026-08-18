## [ ] DSM-15 — [BÔNUS] Log estruturado por fornecedor e paginação de resultados

**Descrição:** Como time de operação, quero logs estruturados (JSON) por chamada a fornecedor
(fornecedor, latência, sucesso/falha/motivo) e, como usuário, quero navegar por páginas quando a
lista de cotações for grande, para que problemas de fornecedor sejam diagnosticáveis em produção e
listas grandes não sobrecarreguem a tela.

**Critérios de aceite:**
- [ ] Dado qualquer chamada a um fornecedor (A, B ou C), quando concluída (sucesso ou falha), então
      é emitido um log estruturado contendo no mínimo: nome do fornecedor, duração em ms, resultado
      (ok/erro/timeout/rate-limited/dirty) e a rota/data buscada.
- [ ] Dado o `POST /search`, quando aceita parâmetros de paginação (ex.: `page`, `pageSize`), então
      retorna apenas a fatia correspondente da lista ordenada, junto com metadados de total de itens
      e total de páginas.
- [ ] Dado a tela de resultados, quando há mais itens do que cabem em uma página, então exibe
      controle de navegação entre páginas.

**Fora de escopo:** integração com ferramenta externa de observabilidade (ex.: Datadog/ELK) — só o
formato estruturado do log em si.

**Prioridade:** Baixa (bônus), a de menor prioridade entre os bônus — são dois itens de qualidade
operacional/UX que não testam nenhuma das capacidades centrais avaliadas (integração instável,
concorrência).
