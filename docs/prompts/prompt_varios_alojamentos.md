# Prompt — Até 4 Alojamentos na Axis

Projeto em `C:\Users\Perdido\.antigravity\clash`. **O jogo já está online com os jogadores.** Hoje cada construção existe **uma vez** na Axis (bloqueio `already_built` em `checkBuild`, `src/systems/BuildSystem.ts`). Quero que o **Alojamento** (`barracks`) possa ser construído **até 4 vezes**, em espaços diferentes; a party decide quantos. As outras construções continuam únicas.

Leia o código, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte e atualize o README (seção Regras e NPCs) e o `docs/plans/NPCS.md`. No final, diga o que publicar e em que ordem.

## Regras

- **Limite configurável por construção** no `buildings.json`: um campo opcional `maxCount` (padrão 1), validado no `parseCatalog` (inteiro de 1 a 8). O Alojamento fica com `"maxCount": 4`.
- `checkBuild`: troque o `isPlacedAnywhere` por uma contagem. Com o limite atingido, o motivo do bloqueio é **"Limite de 4 Alojamentos na Axis"**; para as construções únicas, continua "Já existe na Axis". Conte também os que estão em obra.
- **Cada Alojamento é independente:** tem o próprio nível, a própria melhoria e a própria obra, e cada um paga o seu custo cheio. A capacidade (6/14/14) vale **por Alojamento**, então 4 Alojamentos nv. 2 abrigam 56 NPCs. O `housingList` e o `npc_set_home` já trabalham por espaço; confirme.
- **Efeitos de texto não acumulam:** "quem começa a sessão descansado recebe inspiração" vale uma vez. Em Bônus ativos, o Alojamento aparece **uma vez**, no **maior nível** entre eles (`builtLevel` já pega o máximo; confira o `activeBonuses`), com uma nota "(3 Alojamentos)".
- **Requisitos** (`requires`) e outras checagens que usam `builtLevel` continuam olhando o maior nível; revise os usos (`Missions`, `Research`, cardápio, quadro de missões) e confirme que nada assume uma construção única por id.
- O **mestre** continua podendo forçar e remover qualquer um. O "Forçar" respeita o limite, ou avisa ao passar dele; escolha e justifique.

## Interface

- **Nomes para distinguir:** onde aparece um Alojamento específico (seletor de moradia do NPC, card de moradores, log), mostre um rótulo único e estável. Por exemplo, **"Alojamento I, II, III, IV"** pela ordem dos espaços no layout, ou pelo lado do anel ("Alojamento Norte"). Escolha o que for mais claro e não mude o nome de um Alojamento quando outro for construído ou removido.
- O seletor de moradia agrupa: "Alojamento I (3/14) · Alojamento II (14/14, lotado)".
- No painel do espaço vazio, a opção Alojamento mostra "2 de 4 construídos".

## Dados e compatibilidade

- Os saves atuais têm no máximo 1 Alojamento: **não precisa de migração**. O formato do estado não muda (já é um mapa por espaço).
- O log de obra e de melhoria de um Alojamento passa a indicar qual deles. Se mudar o formato da entrada, mantenha as entradas antigas válidas.

## Testes

- Construir o 2º, o 3º e o 4º; recusa no 5º; recusa do 2º de uma construção única.
- Capacidade somada entre os Alojamentos, com NPCs em mais de um.
- Remover um Alojamento libera só os moradores dele.
- Bônus não acumulam e mostram o maior nível.
- Rótulos estáveis ao construir e remover.
- Paridade com a Edge Function.

## Publicação (o jogo está no ar)

Muda regra no servidor, então precisa de `npm run deploy:functions` e do novo build do site. Não precisa de `db push`. Diga a ordem segura (a função primeiro) e recomende exportar o save antes.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
