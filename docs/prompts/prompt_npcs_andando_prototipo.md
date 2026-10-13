# Prompt — Protótipo: NPCs andando pelo mapa com sprites LPC

Projeto em `C:\Users\Perdido\.antigravity\clash`. **O jogo já está online com os jogadores.** Quero **testar** NPCs andando pela Axis com sprites do **Universal LPC Spritesheet Generator**. É um protótipo: se ficar bom, depois gero todos os sprites por script. Por isso, faça tudo **só no cliente**, sem mexer no `GameState`, nos comandos nem no servidor. Assim o teste não precisa de `deploy:functions` nem de `db push` e pode ser desligado.

Leia `src/scenes/BaseScene.ts`, `src/scenes/CameraController.ts`, `src/map/geometry.ts`, `src/data/layout.json`, `src/systems/Npcs.ts` e `src/ui/MapVisualPanel.ts`. Me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte.

## Os sprites

Por enquanto tenho **1 personagem**, em `art-sources/npcs/aventureira/`, com `walk.png`, `idle.png`, `run.png`, `credits.csv`, `credits.txt`, `metadata.json` e `character.json` (exportados do gerador). Todos os NPCs usam esse sprite no protótipo. Se depois eu acrescentar outra pasta em `art-sources/npcs/`, ela deve entrar no sorteio sem mudar código.

- Formato **conferido**:
  - `walk.png` tem **832×256**: grade de **64×64** com **13 colunas × 4 linhas**, mas só as **colunas 0–8** têm desenho (o resto é transparente). As linhas, de cima para baixo, são **norte (costas), oeste, sul (frente), leste**. A coluna 0 é a pose de passo neutro e as colunas 1–8 são o ciclo de andar.
  - `idle.png` também tem **832×256**, com só as **colunas 0–1** usadas: 2 quadros de respiração por direção, nas mesmas 4 linhas.
  
  Leia a largura útil de forma robusta (quadros não vazios), em vez de fixar 13.
- Use o `idle.png` para o NPC parado, numa animação lenta (~2 quadros/s). Se um sprite futuro não tiver idle, use a coluna 0 do walk.
- Copie os PNGs usados para `public/assets/npcs/<nome>/` e registre-os no `assets.json`.
- **Créditos são obrigatórios** (licenças CC-BY-SA / GPL / OGA-BY do LPC): leia cada `credits.csv` e acrescente os autores e licenças em `src/data/credits.json`, para aparecerem na tela de Créditos. Teste que todo sprite registrado tem crédito.

## Onde andam

Use a geometria do `layout.json` (coordenadas normalizadas 0–1, ângulo 0 = Norte, sentido horário):

- **Corredor principal:** o anel de chão entre o **anel do meio** (raio externo ~0,274) e o **anel externo** (raio interno ~0,358). A rota é um círculo no **meio do corredor (~0,316)**. Calcule os raios pelo layout, sem fixar números.
- **Passagens radiais:** nos vãos de ~12° entre as construções do anel do meio, ligando o corredor ao disco interno (raio 0,214), e nas **8 entradas** da muralha (`entrances.angles`), ligando o corredor ao lado de fora.
- **Portas das construções:** no protótipo, a "porta" é o ponto no meio da borda do arco voltada para o corredor (o arco interno das construções externas e o externo das do meio). Ao chegar, o NPC **some com fade**, fica um tempo "dentro" e sai pelo mesmo ponto.
- Monte isso como um **grafo pequeno de pontos de passagem** (círculo do corredor + raios + portas). O deslocamento é ao longo do grafo, sem pathfinding em grade.
- **Respeite a área reservada** `reserved` (porta secreta): nenhuma rota pode passar por lá.

## Comportamento (só visual, determinístico)

- O destino segue o estado do NPC:
  - `trabalhando` → vai e volta entre a porta do Alojamento onde mora e a porta da construção do posto;
  - `disponivel` → passeia pelo corredor entre pontos aleatórios do grafo;
  - `ferido` → fica perto da porta da Enfermaria, se existir; se não, perto da moradia, quase parado;
  - `em_missao` → não aparece.
- **Mesma cena para todos os jogadores:** a posição sai de uma função pura `(npc.id, tempo do relógio) → posição`, com um PRNG semeado por `npc.id` e por "janelas" de tempo (ex.: um trecho de rota a cada 40–90 s). Nada de `Math.random`. Assim, quem abrir o mapa ao mesmo tempo vê os NPCs no mesmo lugar.
- **Velocidade** lenta e natural (calibre: atravessar um quarto do corredor em ~20 s). A direção do sprite segue o vetor de movimento: escolha a linha (N/O/S/L) pelo ângulo. Animação a ~8 quadros/s andando e idle parado.
- **Qual sprite usa cada NPC:** sorteie de forma estável pelo hash do `npc.id` entre os sprites disponíveis (hoje, 1). Deixe um mapa opcional em `src/data/npc_sprites.json` (`{ "<npcId>": "<nome do sprite>" }`) para eu fixar um sprite a um NPC.

## Aparência e controles

- **Tamanho:** o NPC deve parecer uma pessoa ao lado das construções. Calibre a escala do sprite em relação ao `mapSize` (ex.: uma pessoa ≈ 1/3 da profundidade de uma construção externa), com a constante num lugar só. Use `pixelArt`/`NEAREST` só nesses sprites, sem mudar a suavização do resto do mapa. Ponha uma sombra elíptica sutil no chão.
- **Profundidade:** acima do chão e abaixo dos FX e dos painéis.
- **Zoom:** some (fade) quando o zoom está perto do mínimo, porque ficariam com poucos pixels. Aparece a partir de um zoom configurável.
- **Hover:** mostra o nome do NPC. **Clique:** abre o card dele no painel de NPCs, ou só o nome no protótipo, se for mais simples. Use o mesmo cuidado do bug antigo: clique só conta se começou e terminou no canvas, e clicar num NPC não abre a construção embaixo.
- **Interruptor:** na aba **Visual do mapa** (`MapVisualPanel`), um checkbox **"NPCs andando"**, lembrado por jogador (`uiMemory`), ligado por padrão. Desligue sozinho com `prefers-reduced-motion`.
- **Desempenho:** pause a atualização quando a aba estiver escondida; até 60 NPCs sem cair o FPS. Respeite o `FxBudget` em telas pequenas, se fizer sentido.

## Testes

- Funções puras: posição por tempo (determinismo, continuidade entre janelas, nunca fora do grafo nem na área reservada), escolha da direção pelo vetor, escolha estável do sprite, destino por status.
- Créditos presentes para os sprites registrados.
- O resto é manual. **Me mande um passo a passo para eu conferir** no `npm run dev`: zoom, clique, interruptor, um NPC trabalhando indo ao posto e um em missão sumindo.

## Publicação

Só cliente: basta o novo build do site. **Não** precisa de `deploy:functions` nem de `db push`. Confirme isso no final. Antes de publicar, quero ver rodando localmente.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`.
