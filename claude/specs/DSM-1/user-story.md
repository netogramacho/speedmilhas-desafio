## [ ] DSM-1 — Cliente HTTP e normalizador do Fornecedor A

**Descrição:** Como serviço de busca, quero consultar o Fornecedor A e converter sua resposta para
um formato interno único de cotação, para que o agregador não precise conhecer o formato específico
de cada fornecedor.

**Critérios de aceite:**
- [ ] Dado uma origem, destino e data válidos, quando o serviço chama `GET /supplier-a/quotes`, então
      monta a query string com os parâmetros `origin`, `destination`, `date` (nomes do fornecedor A).
- [ ] Dado um retorno 200 do fornecedor A com `results: [{ miles, taxes_brl, carrier }]`, quando
      normalizado, então cada item vira um objeto interno com milhas (número), taxa em BRL (número),
      companhia (nome por extenso, ex. "GOL") e identificação de que a cotação veio do fornecedor A.
- [ ] Dado que o fornecedor A responde 500, quando o serviço trata o erro, então não lança exceção
      não tratada — devolve um resultado indicando "fornecedor A falhou" sem cotações, sem derrubar
      o processo chamador.
- [ ] Dado que o fornecedor A demora mais que o timeout definido para chamadas individuais, quando
      o tempo estoura, então a chamada é abortada e tratada como falha desse fornecedor (não trava
      o restante do fluxo).

**Fora de escopo:** agregação com os outros fornecedores, ordenação final, exposição via endpoint
HTTP próprio — isso é da DSM-4/DSM-5. Retry automático (fica registrado como decisão em
DECISIONS.md se não for feito).

**Prioridade:** Alta. É a base mais simples (fornecedor mais estável, menor % de erro) — serve de
modelo para as DSM-2 e DSM-3, que lidam com formatos mais complicados. Sem isso, não há dado nenhum
para agregar.
