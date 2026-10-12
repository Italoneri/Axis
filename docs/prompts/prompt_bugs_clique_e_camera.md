# Prompt — Bugs: clique atravessando o painel e câmera presa nas laterais

Projeto em `C:\Users\Perdido\.antigravity\clash`. São dois bugs de interação no mapa, e os dois são só de cliente (sem mudança de regra, JSON ou banco).

Leia o código citado, confirme a causa, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por bug. No final, diga se alguma mudança exige `npm run deploy:functions` ou `npx supabase db push`. Não deveria exigir.

## Bug 1 — Clique no painel lateral atravessa para o mapa

**Como reproduzir:** abra uma construção (ex.: Fontes Termais) com o painel lateral aparecendo **por cima** de outro espaço do mapa. Clique em **Melhorar**. Em vez de melhorar, o painel fecha e abre o painel de **nova construção** do espaço que está atrás do botão. Para conseguir melhorar, preciso arrastar o mapa até não ter nenhum espaço atrás do painel. O mesmo acontece em qualquer botão do painel, e um clique no painel sobre área vazia do mapa fecha o painel.

**Causa provável (confirme):** o Phaser escuta `mouseup`/`pointerup` também na `window`, para capturar o soltar fora do canvas. Com isso, um clique num elemento HTML por cima do canvas ainda faz o hit-test na posição do mouse. Os pontos afetados são:
- `zone.on('pointerup', onClick)` em `src/scenes/SlotView.ts`, que abre o espaço;
- o `this.input.on('pointerup', …)` em `src/scenes/BaseScene.ts`, que fecha o painel ao clicar no vazio.

**Correção esperada:**
- Só trate como clique no mapa o gesto que **começou e terminou no canvas**: `pointer.downElement` e `pointer.upElement` iguais a `this.game.canvas`. Centralize isso num helper (ex.: `isCanvasGesture(pointer)`) usado no clique dos espaços e no "clique no vazio fecha o painel".
- Aplique a mesma regra ao arrasto do `CameraController`. Arrastar ou rolar dentro do painel, da barra superior ou de um `<dialog>` (como o do Arquivo de registros) não pode mover o mapa. A roda do mouse sobre o painel rola o painel, não dá zoom no mapa.
- O hover dos espaços também não deve acender enquanto o mouse está sobre o painel.
- Teste manual: Melhorar, Forçar, Remover estrutura, selects e botões do painel funcionando com um espaço atrás. Clicar no vazio do mapa (fora do painel) continua fechando o painel. Se der para isolar o helper numa função pura, cubra com teste.

## Bug 2 — Com zoom intermediário não dá para arrastar para os lados

**Como reproduzir:** em tela larga, dê zoom até o mapa ficar mais alto que a tela, mas ainda mais estreito que ela (como na segunda imagem que mandei). Nesse ponto não dá para arrastar para a direita nem para a esquerda. Para ver uma construção da lateral, preciso dar zoom total. Com o painel lateral aberto piora, porque a parte direita do mapa fica escondida atrás dele e não tem como trazê-la para a área visível.

**Causa:** `clampAxis` em `src/scenes/CameraController.ts`. Quando o mapa é menor que a tela num eixo, ele **trava o centro** no meio do mapa (`return worldSize / 2`), e esse eixo fica sem arrasto.

**Correção esperada:**
- Permitir arrastar nos dois eixos em **qualquer zoom**, com uma folga que deixe qualquer borda do mapa chegar pelo menos até o **centro da área visível**. Exemplo de regra: o centro da câmera pode ir de `0` a `worldSize` em cada eixo. Ajuste se ficar estranho, mas o mapa nunca pode sumir inteiro da tela.
- **Área visível descontando o painel:** com o painel lateral aberto (ou a gaveta de baixo no celular), considere como área útil só a parte do canvas que ele não cobre. Ao abrir o painel de um espaço que fique escondido atrás dele, deslize a câmera suavemente para trazer o espaço para a área útil.
- Zoom com a roda continua ancorado no cursor e o zoom mínimo continua mostrando o mapa inteiro.
- Cubra o novo `clampAxis` (ou equivalente) com testes puros: mapa menor que a tela, mapa maior que a tela, com e sem o painel descontado.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`.
