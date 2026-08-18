# DECISIONS

Quatro perguntas. Responda todas — é aqui que a gente entende as suas escolhas, e cada
resposta vira conversa na entrevista.

Objetividade vale mais que volume. Duas frases boas batem dois parágrafos genéricos.

---

## 1. O que acontece quando o fornecedor B demora 8 segundos?

E por que você escolheu essa estratégia e não outra?

Eu protegi todas as chamadas aos fornecedores com um timeout de 5 segundos, dessa forma sempre que um fornecedor estoura o deadline vira uma falha classificada como timeout, sem lançar exceção, assim retornamos o resultado parcial com os fornecedores que responderam em tempo. Escolhi essa estratégia para conseguir garantir a resposta ao usuário em no máximo 6 segundos, trocando completude por previsibilidade.

---

## 2. Como você garante uma única reserva sob concorrência?

E o que quebra se subirem três instâncias da aplicação?

A garantia foi feita através de constraint UNIQUE no postgres. O repositório tenta criar o pedido repetido e é rejeitado pelo banco, assim ele busca o registro existente e retorna como se fosse a mesma reserva.

Como a regra está no banco e não no backend, nada quebra com 2, 3 ou N instâncias que estejam apontando para o mesmo banco de dados.

Isso está provado por um teste automatizado que sobe duas instâncias reais em portas diferentes e dispara a mesma idempotencyKey nas duas ao mesmo tempo, 5 rodadas. As duas respostas voltam com o mesmo id e o banco fica com uma única linha.

---

## 3. Como você usou IA?

Quais ferramentas (Claude Code, Codex, Cursor, ChatGPT…), com que método (spec-driven, TDD
com agente, pair, revisão) — e **um ponto concreto onde você discordou dela** e seguiu por
outro caminho.

Eu utilizei spec-driven com o Claude Code (majoritariamente Opus 5). Defini alguns parâmetros técnicos antes, criei 4 agentes, um para quebrar a feature em tarefas, um para planejar, um para implementar e um para revisar. O planejador fazia um pair comigo para decidirmos como ficaria a spec e o implementador gerava o código em cima da spec.

Como eu participei de todas as specs em pair com o agente, tudo foi sendo moldado em tempo de execução mesmo. Um ponto que aconteceu foi que a IA começou criando o backend separando os arquivos de acordo com os modulos e posteriormente eu pedi para que ele trocasse para separação de camadas, pois acredito ser mais simples e mais fácil de seguir arquitetura limpa dessa forma. Outro ponto foi o não uso de boas práticas no frontend, onde ela criou o componente com "key={index}", eu peguei na revisão e forcei ela a usar uma chave composta a partir dos dados da cotação.

Os arquivos dentro de ./claude/* estão no repositório para evidenciar o método spec-driven.

---

## 4. Quanto tempo você demorou para concluir o desafio?

Eu levei algo em torno de 14 a 15 horas para fazer as 11 tarefas que contemplam o desafio sem os bonûs, primeiro quebrei a feature em tarefas e depois segui uma a uma, fazendo o planejamento, execução e revisão.
