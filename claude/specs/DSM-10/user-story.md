## [ ] DSM-10 — Estilização da lista de resultados (Tailwind v4)

**Descrição:** Como usuário da tela de busca, quero uma lista de cotações com hierarquia visual
clara e preço em milhas fácil de comparar entre as opções, para que eu consiga decidir rapidamente
qual oferta escolher.

**Critérios de aceite:**
- [ ] Dado uma lista de cotações renderizada, quando visualizada, então cada item mostra de forma
      destacada o número de milhas, a companhia aérea e a taxa em BRL, com o número de milhas como
      elemento de maior peso visual (fonte maior/mais forte) já que é o critério de ordenação.
- [ ] Dado que a lista está ordenada por menor número de milhas, quando visualizada, então essa
      ordem é perceptível sem precisar ler todos os itens (ex.: a melhor opção tem algum destaque
      visual, como "melhor oferta").
- [ ] Dado o aviso de resultado parcial (DSM-9), quando renderizado, então aparece em posição visível
      da tela (não escondido no rodapé ou exigindo scroll) e usa estilo (cor/ícone) que comunica
      "atenção" sem comunicar "erro".
- [ ] Dado a lista com múltiplos itens, quando renderizada, então usa classes utilitárias Tailwind
      (já configurado no projeto) para espaçamento e tipografia consistentes entre os itens, sem CSS
      inline ad-hoc espalhado.

**Fora de escopo:** design pixel-perfect, responsividade mobile, tema dark/light configurável.

**Prioridade:** Média. Refina a DSM-9 (que já garante os estados funcionais corretos) — o desafio é
explícito que não espera design de produto, mas pede legibilidade e hierarquia visual claras como
critério de avaliação.
