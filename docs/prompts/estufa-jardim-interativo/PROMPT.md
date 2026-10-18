# Prompt: jardim interativo da Estufa de Ervas

Arquivos nesta pasta (`docs/prompts/estufa-jardim-interativo/`):

| Arquivo | O que é |
| --- | --- |
| `prototipo.html` | Protótipo jogável aprovado pelo Ítalo. **É a referência principal**: abra no navegador e jogue antes de codar. |
| `nivel-1.png`, `nivel-2.png`, `nivel-3.png` | Capturas do protótipo em cada nível. |
| `garden.proposta.json` | Layout novo dos espaços por nível, já no formato de `src/data/garden.json`, tirado do protótipo. |
| `sprites/` | Recortes dos renders CC0 do Poly Haven que já estão no projeto (`docs/art-pipeline/renders/nettle_plant.png` → `leaf0..5`, `periwinkle_plant.png` → `flower0..5`), a madeira (`plank.jpg`, de `wooden_crate_02`) e a pedra (`stone.jpg`, Stone Wall 23 dessaturada). |

---

```
Contexto: projeto "clash", branch feat/estufa-jardim. O jardim da Estufa de Ervas já funciona
(regras em src/systems/Garden.ts, documentado em docs/plans/ESTUFA.md), mas a interface
(src/ui/garden/GardenWindow.ts) é a arte pintada da estufa com quadrados clicáveis por cima e um
popover genérico. Quero trocar essa interface por uma cena de jardim INTERATIVA, desenhada por
código sobre texturas CC0, com sensação de jogo de fazenda (estilo Hay Day), no tom escuro e
dourado do resto do jogo.

O protótipo aprovado está em docs/prompts/estufa-jardim-interativo/prototipo.html.
ABRA E JOGUE ANTES DE COMEÇAR (Playwright ou navegador): plante, arraste sementes, colha arrastando,
passe dias, troque de nível. Olhe também nivel-1.png, nivel-2.png e nivel-3.png.
O protótipo é HTML/JS solto com dados falsos: porte o COMPORTAMENTO e o VISUAL dele para a
arquitetura do projeto (TypeScript, el() de src/ui/dom.ts, GameStore, comandos), não copie o código.

## 1. Mudança de dados: layout novo dos espaços

Substitua src/data/garden.json pelo conteúdo de docs/prompts/estufa-jardim-interativo/garden.proposta.json.
As coordenadas (x, y, w, h de 0 a 1) agora são relativas à CENA desenhada por código (proporção 16:10),
não mais à arte pintada.

| Tipo                     | Nv1 | Nv2 | Nv3 |
| ------------------------ | --- | --- | --- |
| canteiro                 | 6   | 9   | 12  |
| muda                     | 4   | 4   | 4   |
| estufa (bandeja, 2 vasos)| –   | 6   | 3   |
| arcana (bacia)           | –   | –   | 4   |
| lago                     | –   | –   | 2   |

- No Nv2 há duas bancadas de estufa (estufa-1..3 à esquerda, estufa-4..6 à direita). No Nv3 a bancada
  da direita vira a bancada arcana (arcana-1..4) e estufa-4..6 deixam de existir: a regra de acerto
  (settleGarden) já cobre isso, não mude as regras.
- Cada `estufa-N` é UMA BANDEJA COM 2 VASOS: um espaço, uma semente, os dois vasos crescem juntos.
  O `yield` do cultivo vale pela bandeja. Cada `arcana-N` é uma bacia independente; cada `lago-N` é um lago.
- Os ids que já existiam (canteiro-1..6, muda-1..4, estufa-1..2, arcana-1, lago-1) continuam com o
  mesmo id, então saves existentes não precisam de migração. Confirme isso nos testes.
- src/i18n/plotLabel.ts: estufa → "Bandeja N", arcana → "Bacia arcana N", lago → "Lago N"
  (hoje arcana e lago não têm número). Atualize src/i18n/plotLabel.test.ts.
- Atualize testes que dependam das quantidades antigas (Garden.test.ts, gardenViews.test.ts,
  catalog.test.ts etc.) e o docs/plans/ESTUFA.md (tabela de espaços, frase "o yield vale pela
  fileira inteira" vira "pela bandeja", seção Interface).

## 2. A cena (desenhada por código)

Nada de PNG da construção (herb_garden.png / herb_garden.outer*.png) dentro da janela do jardim.
A cena é um contêiner 16:10 com elementos posicionados em % (DOM + CSS; SVG só onde ajudar), como no protótipo:

- Moldura de pedra (Stone Wall 23) e gramado dentro dela; dois caminhos de pedra em cruz.
- Sombras suaves de árvore nos cantos de cima.
- Bancadas como cenário (atrás dos espaços), dependendo do nível:
  - estufa: tampo de madeira com cobertura de vidro (reflexos diagonais) e moldura dourada; cada
    bandeja é uma bandeja de madeira escura com 2 vasos de barro REDONDOS (aspect-ratio 1, borda clara,
    sombra, terra dentro);
  - arcana: laje de pedra escura com borda violeta; cada bacia tem um anel de runas girando
    (repeating-conic-gradient + mask) e brilho violeta.
- Cada tipo de espaço tem cara própria: canteiro = caixote de madeira com terra; muda = vaso de barro;
  lago = água animada com borda de pedra e dourado.
- Espaços que só existem em nível acima aparecem como contorno tracejado com "Nível X"
  (bancadas e área dos lagos como um bloco: "Estufa · Nível 2", "Lagos · Nível 3").
- Obra de melhoria em andamento: vale o layout do nível em vigor (plotsInForce), como hoje.

Texturas:
- Pedra: art-sources/originals/stonewall_23_basecolor-2K.png já é CC0 e já está em credits.json;
  gere uma versão pequena dessaturada (como sprites/stone.jpg) em public/assets/.
- Madeira: sprites/plank.jpg (de wooden_crate_02, Poly Haven, CC0).
- Grama e terra: no protótipo são geradas por canvas. Prefira texturas CC0 reais (ambientCG ou
  Poly Haven; ex.: uma grama e um solo/terra arada em 1K JPG, reduzidas para tile de 256px).
  Se não conseguir baixar, porte a geração procedural do protótipo (gerar uma vez e cachear).
- Toda textura ou render novo entra em src/data/credits.json (mesmo formato das entradas de textures).
  Confira se nettle_plant, periwinkle_plant e wooden_crate_02 já estão lá; se não, adicione (Poly Haven, CC0).
- Coloque os sprites em public/assets/garden/ (copie de docs/prompts/estufa-jardim-interativo/sprites/).

## 3. As plantas

Os cultivos são criados pelo mestre e não têm arte própria, então a planta é montada por código:
- Pontos de plantio por tipo (veja spots() no protótipo): canteiro 2×4 tufos, muda 1, bandeja 2
  (um por vaso), bacia 1, lago 3.
- Estágios pelo progresso (growthTenths / (days × 10)):
  0 = montinhos de terra; < 0,34 = broto (leaf3..5 pequeno); < 0,67 = planta jovem (leaf0..2);
  < 1 = planta cheia (flor em botão: flower2..5 com saturação reduzida, ou folhas se o cultivo for "folhagem");
  pronta = florida (flower2..5 com cor plena) ou folhagem viçosa.
- Variedade por cultivo SEM campo novo no save: derive do seedId (hash estável) o "visual"
  (folhagem ou flor) e um hue-rotate para a cor da flor. Mesmo cultivo = mesma cara sempre.
- Os tufos balançam levemente (sway) com atraso diferente por tufo.

## 4. Estados e interação (igual ao protótipo)

- Crescendo: pílula embaixo do espaço com barrinha e "Nd" (dias que faltam).
- Pronta: a planta quica, o espaço brilha em verde-claro, brilhinhos piscam e um balão com o ícone
  da colheita flutua em cima.
- Toque em espaço VAZIO: abre uma bandeja de sementes perto do espaço (popover dentro da cena,
  posicionado acima, ou abaixo se não couber). Mostra só os cultivos do tipo do espaço (cropsFor /
  seedOptions de gardenViews.ts): "×N" quando há no estoque, preço com ícone de moeda quando o
  acampamento compra, desabilitado com "rara" quando é rara sem semente, desabilitado quando falta bronze.
  Na bandeja da estufa o texto diz que uma semente planta os 2 vasos.
- Toque na semente: planta naquele espaço (garden_plant; buy: true quando não há estoque e é comum).
- ARRASTAR a semente: um fantasma da semente segue o dedo/mouse; cada espaço vazio compatível por
  onde passar é plantado (um garden_plant por espaço; para se o comando for recusado). Espaço
  compatível sob o cursor ganha destaque. Use Pointer Events + setPointerCapture/elementFromPoint,
  touch-action: none só nos espaços e nas sementes (a página continua rolando).
- Toque em espaço PRONTO: colhe (garden_harvest com plotId). Segurar e ARRASTAR por cima de vários
  prontos colhe todos por onde passar, com o cursor virando uma foice.
- Toque em espaço CRESCENDO: popover com nome, "rara" se for, barra de progresso, "pronta em N dias ·
  rende N" e Arrancar com confirmação dentro do popover ("Arrancar? A semente não volta.").
- Colher: sobe o texto "+4 Hortelã" e 3 ícones voam até o contador da colheita (Web Animations API),
  que dá um "pulo". Plantar: partículas de terra.
- Botão "Colher tudo (N)" no topo, desabilitado sem nada pronto (garden_harvest sem plotId).
- Faixa embaixo da cena: "Colhido" (o que foi colhido enquanto a janela está aberta, alvo da animação)
  e "Sementes no estoque" (materiais semente dos cultivos, com quantidade).
- Esc e clique fora fecham o popover. Mestre continua com a aba Cultivos (CropForm) como hoje.
- O protótipo tem "Passar dia" e seletor de nível só para TESTE: NÃO coloque isso no jogo.
- Erros dos comandos continuam no toast padrão do jogo (mensagens de t.garden já existentes).

## 5. Restrições

- Regras do jardim (Garden.ts, applyCommand, servidor) não mudam; só garden.json, plotLabel,
  textos e a interface. Nenhum comando novo.
- Cada espaço continua sendo um <button> com aria-label descrevendo o estado (ex.: "Canteiro 3:
  Hortelã, faltam 2 dias"); tudo funciona por teclado (Enter no vazio abre a bandeja, Enter na semente
  planta, Enter no pronto colhe). Foco visível.
- prefers-reduced-motion: sem balanço, quique, giro de runas nem voo de ícones.
- Desempenho: a janela re-renderiza com o jogo; atualize só os espaços que mudaram para não
  reiniciar animações de todos a cada comando.
- Telas estreitas (≤ 640px): mantenha a lista de cartões que já existe como alternativa, ou a cena
  com rolagem horizontal própria (sem rolagem horizontal da página). Escolha e justifique.
- Textos em pt-BR em src/i18n/pt-BR.ts (t.garden). Estilos na seção do jardim em src/ui/ui.css,
  com classes próprias (não mexa em .menu__grid/.dialog--menu usados por outras janelas).
- Lógica pura (estágio da planta, hash de visual do cultivo, posição do popover) em funções testáveis
  em gardenViews.ts (ou arquivo vizinho) com testes vitest.
- Rodar npm test, npm run typecheck, npm run lint e prettier nos arquivos tocados.
- Deploy: como o bundle do servidor carrega garden.json, a ordem continua functions → site
  (anotar no ESTUFA.md).
- Commits locais pequenos e por etapa (dados → plantas/cena → interação → docs), sem push.

Antes de codar, me mostre um plano curto: arquivos que vai criar/alterar, a estrutura do DOM da cena
e de um espaço, e como vai tratar telas estreitas.
```
