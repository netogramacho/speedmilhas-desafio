## [ ] DSM-11 — Reservar uma cotação direto na lista de resultados da busca

**Descrição:** Como usuário da tela de busca, quero escolher uma cotação da lista de resultados e
reservá-la informando meus dados de passageiro, sem sair da tela de busca, para que eu consiga
fechar o fluxo de ponta a ponta (buscar → escolher → reservar) sem precisar de uma tela separada
de pedido.

**Critérios de aceite:**
- [ ] Dado uma lista de cotações já exibida na tela de busca (estado `complete` ou `partial`),
      quando o usuário olha para um card de cotação, então existe uma ação (ex.: botão "Reservar")
      naquele próprio card, sem navegação para uma nova rota/página.
- [ ] Dado que o usuário aciona a ação de reservar em um card, quando a forma de captura de dados é
      exibida, então ela pede pelo menos nome e CPF do passageiro, permanecendo associada visualmente
      àquele card (ex.: expandindo o card ou abrindo um formulário inline/modal simples, não uma
      página nova).
- [ ] Dado nome e CPF preenchidos para aquela cotação, quando o usuário confirma a reserva, então o
      cliente gera uma `idempotencyKey` e chama `POST /orders` com
      `{ quoteId, passenger: { name, document }, quote: { miles, taxesBrl, carrier }, idempotencyKey }`
      usando os dados da cotação escolhida.
- [ ] Dado nome ou CPF vazios/incompletos, quando o usuário tenta confirmar, então a chamada a
      `POST /orders` não é disparada e uma validação visível indica o campo faltante.
- [ ] Dado que `POST /orders` responde com sucesso, quando a resposta chega, então o card daquela
      cotação passa a mostrar um estado de "reservado" (incluindo algum identificador do pedido
      retornado) e a ação de reservar deixa de estar disponível para aquela cotação.
- [ ] Dado que o usuário tenta reservar novamente uma cotação já reservada (ex.: reenvio acidental
      com a mesma `idempotencyKey`, como duplo clique ou nova tentativa após timeout de rede), quando
      a resposta chega, então a tela trata o resultado como a mesma reserva já existente — sem
      exibir um segundo pedido, um erro de duplicidade ou qualquer indicação de que algo deu errado
      para o usuário.
- [ ] Dado que `POST /orders` falha (erro de rede, 4xx, 5xx), quando a resposta chega, então a tela
      mostra uma mensagem de erro associada àquele card específico, mantém os dados de passageiro
      preenchidos e permite tentar novamente sem perder o restante da lista de resultados.

**Fora de escopo:** tela ou rota dedicada de pedido/checkout; listagem ou histórico de pedidos já
feitos; edição ou cancelamento de uma reserva existente; fluxo de pagamento; persistência de qual
cotação foi reservada entre sessões/reloads da página (o estado "reservado" vale enquanto a tela de
busca estiver aberta).

**Prioridade:** Alta (não é bônus). Fecha uma lacuna funcional do fluxo principal do desafio: hoje
não existe nenhum caminho na UI que chame `POST /orders` (lacuna documentada na DSM-7 e ausente dos
critérios da DSM-9). Sem esta story, o backend de reservas (DSM-6/DSM-7/DSM-8) fica sem nenhum
consumidor real na aplicação, e o fluxo ponta a ponta buscar → escolher → reservar não existe.
