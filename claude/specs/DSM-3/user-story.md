## [ ] DSM-3 — Cliente HTTP e normalizador do Fornecedor C (payload sujo sem erro HTTP)

**Descrição:** Como serviço de busca, quero consultar o Fornecedor C e validar/normalizar sua
resposta mesmo quando ela vem "suja" com status 200, para que dados inválidos não cheguem ao
usuário como se fossem uma cotação real.

**Critérios de aceite:**
- [ ] Dado uma origem, destino e data válidos, quando o serviço chama o fornecedor C, então faz
      `POST /supplier-c/v2/quotes` com body `{ origin, destination, date }`.
- [ ] Dado um retorno 200 com `data: [{ price_miles, fee, airline_code }]` limpo, quando normalizado,
      então cada item vira o formato interno único, convertendo o código IATA (`LA`, `G3`, `AD`)
      para o nome da companhia por extenso (mesma nomenclatura usada pelos fornecedores A e B).
- [ ] Dado um retorno 200 com `data: []` (uma das sujeiras), quando tratado, então o fornecedor C é
      considerado como tendo respondido com zero cotações (não é erro, é resultado vazio válido).
- [ ] Dado um retorno 200 com algum campo `null` (ex.: `fee: null`) ou `price_miles` como string
      (ex.: `"17500"`), quando tratado por item, então esse item específico é descartado da lista
      (não quebra os demais itens válidos da mesma resposta) e é contabilizado/logado como item
      inválido descartado.
- [ ] Dado que todos os itens de uma resposta do fornecedor C vierem inválidos, quando tratado,
      então o resultado final para esse fornecedor é lista vazia, e não um erro — a busca segue
      normalmente com os outros fornecedores.

**Fora de escopo:** decidir se um item parcialmente sujo pode ser "corrigido" (ex.: fazer parse de
`"17500"` para `17500`) — deixe explícito em comentário/DECISIONS.md se decidir fazer parse
tolerante em vez de descartar.

**Prioridade:** Alta. É o cenário mais insidioso do desafio (sem erro HTTP para se apoiar) — se mal
tratado, contamina os resultados agregados com preços quebrados sem que ninguém perceba.
