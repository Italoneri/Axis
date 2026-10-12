# Prompt — Ajustes de NPCs: moradia, painel e vagas

Projeto em `C:\Users\Perdido\.antigravity\clash`. São quatro ajustes de NPCs vindos do uso em mesa. Leia `docs/plans/NPCS.md`, `src/systems/Npcs.ts`, `src/ui/resources/NpcPanel.ts`, `src/ui/SlotNpcs.ts`, `src/data/buildings.json` e `src/data/npcs.json`. Me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por item e atualize `docs/plans/NPCS.md` e o README (seção NPCs). No final, diga se exige `npm run deploy:functions` ou `npx supabase db push`; os itens 3 e 4 mudam regras e JSON, então devem exigir `deploy:functions`.

## 1. Tirar um NPC da moradia de forma fácil

Hoje só dá trocando o select "Moradia" do card para "Sem moradia", e ninguém acha isso.

- No **card "Moradores: x de y"** do painel da construção (`SlotNpcs.residentsCard`): cada morador ganha um botão **"Retirar"**.
- No **card do NPC** (`NpcPanel`): ao lado do select de moradia, um botão **"Retirar da moradia"**, que só aparece se ele mora em algum lugar.
- Como trabalho exige moradia, retirar um NPC que está trabalhando também o tira do posto. Nesse caso, peça confirmação com o mesmo padrão de clique duplo do `confirmButton`, e mostre a mensagem "Bia também vai deixar o posto Cozinhar na Taverna".
- O comando continua sendo o `npc_set_home` com `slotId: null`.

## 2. "Novo NPC" no topo e sempre fechado

- Mova o bloco **Novo NPC** (`newNpcForm`) para o **início** do painel, antes dos filtros e da lista.
- Ele **sempre abre fechado**: ao abrir o painel, depois de criar um NPC e em todo redraw que não seja o próprio formulário sendo usado. Remova o `isNewOpen` que lembra o estado. Depois de criar com sucesso, feche o bloco, limpe os campos e role a lista até o NPC novo, ou destaque-o.

## 3. Moradia só no Alojamento

- Tire o `housing` de **todas** as construções, menos o **Alojamento** (`barracks`, 6/14/14). Hoje Taverna (2/2/3) e Torre dos Magos (2/3/4) também abrigam NPCs.
- Valide isso no `parseCatalog`, para não voltar sem querer: só construções marcadas como moradia podem ter `housing`. Uma lista em `npcs.json` (`"housingBuildings": ["barracks"]`) resolve.
- **Saves existentes:** NPCs que moram na Taverna ou na Torre dos Magos não podem simplesmente perder a casa, porque perderiam o posto junto. Ao carregar, mova-os para o Alojamento, se houver vaga, mantendo o posto, e registre no log ("Pelé mudou-se da Taverna para o Alojamento"). Só quem não couber é liberado, com o motivo de sempre. Faça isso numa migração de save (versão nova) e trate o online também: o estado vem do jsonb pela mesma `parseState`. Teste com e sem vaga.

## 4. Mais vagas nos postos de trabalho

Hoje são 1 a 3 vagas por posto. Quero **por anel**, nos níveis 1 / 2 / 3:

- **Anel externo** (espaços `outer`): **3 / 6 / 8** vagas.
- **Anel interno** (espaços `middle`): **2 / 4 / 6** vagas.

Como a Estação de Estudo pode ficar nos dois anéis, a quantidade de vagas deve depender do **espaço onde a construção está**, não da construção.

- Centralize isso em `npcs.json`: `"postSlots": { "outer": [3, 6, 8], "middle": [2, 4, 6] }`. `postsAt` usa o tipo do espaço (`layout`) e o nível em vigor para definir as vagas de todos os postos. Remova o campo `slots` de cada `job` em `buildings.json`, ou ignore-o com aviso; escolha o mais limpo.
- O **posto de obra** (Construir) continua com o valor próprio de `npcs.json` (2 vagas). Não muda com o anel.
- Rebaixar o nível continua liberando excedentes, como hoje (`settleNpcs`, motivo `capacity`).
- Testes: vagas por anel e por nível, Estação de Estudo nos dois anéis, rebaixamento liberando quem sobra, posto de obra sem mudança.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
