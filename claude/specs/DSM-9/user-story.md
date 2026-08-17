## [ ] DSM-9 — Estados de UI para busca: carregando, sucesso, parcial, erro e vazio

**Descrição:** Como usuário da tela de busca, quero ver o formulário de origem/destino/data e
resultados assim que chegam do `POST /search`, com uma indicação clara e não alarmante quando a
lista está incompleta, para que eu possa decidir com base no que já está disponível sem esperar
achar que o sistema travou ou quebrou.

**Critérios de aceite:**
- [ ] Dado o formulário preenchido com origem, destino e data válidos, quando o usuário submete,
      então a tela entra em estado de carregamento visível (ex.: spinner/skeleton) e o botão de
      busca fica desabilitado até a resposta chegar.
- [ ] Dado que o `POST /search` retorna `status: "complete"`, quando a resposta chega, então a tela
      mostra a lista de cotações ordenada por milhas, sem nenhum aviso de dados incompletos.
- [ ] Dado que o `POST /search` retorna `status: "partial"`, quando a resposta chega, então a tela
      mostra as cotações que chegaram junto com um aviso visível (mas não em tom de erro — ex.: cor
      neutra/amarela, não vermelha) informando que nem todos os fornecedores responderam, incluindo
      quais fornecedores faltaram.
- [ ] Dado que o `POST /search` falha completamente (erro de rede, 5xx da própria API, ou todas as
      cotações vazias com todos os fornecedores marcados como falha), quando a resposta chega,
      então a tela mostra uma mensagem de erro distinta do estado de "parcial", com opção de tentar
      novamente.
- [ ] Dado que o `POST /search` responde com sucesso mas lista de cotações vazia (nenhum fornecedor
      teve preço para a rota/data), quando a resposta chega, então a tela mostra uma mensagem de
      "nenhum resultado encontrado", distinta tanto do erro quanto do parcial.
- [ ] Dado o formulário submetido com campos obrigatórios vazios, quando o usuário tenta buscar,
      então a busca não é disparada e uma validação visível indica o campo faltante, sem chamar a
      API.

**Fora de escopo:** responsividade mobile e acessibilidade além do básico (fora de escopo do
desafio); paginação de resultados (bônus, DSM-14).

**Prioridade:** Alta. É o núcleo do RF3 — a pergunta central do desafio para a camada web ("como
comunicar parcial sem assustar") está toda concentrada aqui. Depende da DSM-5 já estar disponível
para consumir.
