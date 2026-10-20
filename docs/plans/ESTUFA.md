# Estufa de Ervas: jardim e madeira passiva

Objetivo: a construção **Estufa de Ervas** (`herb_garden`, `HERB_GARDEN_BUILDING_ID` em `src/model/catalog.ts`, reexportado por `src/systems/Garden.ts`) ganha um **jardim** onde a party planta sementes e colhe ervas, e rende **madeira passiva** todo dia. Spec original: `docs/superpowers/specs/2026-10-17-estufa-jardim-design.md`.

## Onde guardar

- **`state.garden`** no `GameState`: `{ crops: Crop[], plots: Record<plotId, { cropId, growthTenths }> }`. Viaja com o save, como a loja.
- **Layout dos espaços:** `catalog.garden` (`src/data/garden.json`, carregado por `src/data/gameData.ts`). Por nível, a lista de espaços com `id`, `type` e a caixa na arte (`x`, `y`, `w`, `h` de 0 a 1). Os ids são estáveis entre os níveis.
- **Madeira passiva:** campo `produces` por nível em `src/data/buildings.json`.
- **Save:** `SAVE_VERSION` = 11 (`src/model/schema.ts`). Saves da versão 8 ganham `garden: { crops: [], plots: {} }`; os da 10 passam a usar `StockRef` (cultivo `{ id: seedId, seed: material, harvest: material }`, espaço `{ cropId: seedId }`).

## Espaços por nível

| Tipo       | Ids                          | Nv1 | Nv2 | Nv3 |
| ---------- | ---------------------------- | --- | --- | --- |
| `canteiro` | `canteiro-1` … `canteiro-12` | 6   | 9   | 12  |
| `muda`     | `muda-1` … `muda-4`          | 4   | 4   | 4   |
| `estufa`   | `estufa-1` … `estufa-6`      | –   | 6   | 3   |
| `arcana`   | `arcana-1` … `arcana-4`      | –   | –   | 4   |
| `lago`     | `lago-1`, `lago-2`           | –   | –   | 2   |

- A caixa (`x`, `y`, `w`, `h`) é relativa à cena do jardim desenhada por código (proporção 16:10), não à arte da construção.
- Cada `estufa-N` é **uma bandeja com 2 vasos**: um espaço, uma semente, os dois vasos crescem juntos; o `yield` do cultivo vale pela bandeja. Cada `arcana-N` é uma bacia e cada `lago-N` um lago, todos independentes.
- No nv2 há duas bancadas de estufa (`estufa-1` … `estufa-3` à esquerda, `estufa-4` … `estufa-6` à direita). No nv3 a bancada da direita vira a bancada arcana (`arcana-1` … `arcana-4`) e `estufa-4` … `estufa-6` deixam de existir. É o único caso em que a regra de acerto (abaixo) mexe de verdade em plantas.
- Os ids das versões anteriores (`canteiro-1` … `canteiro-6`, `muda-1` … `muda-4`, `estufa-1`, `estufa-2`, `arcana-1`, `lago-1`) continuam nos mesmos níveis, então saves antigos não precisam de migração (`catalog.test.ts`).
- Obra de melhoria em andamento: vale o layout do nível em vigor (`plotsInForce`, via `builtLevel`). Sem a estufa construída, não há espaços.
- A glicínia do nv3 ficou de fora.

## Cultivos (catálogo do mestre)

O mestre liga uma semente a uma colheita. Cada ponta é um **material** ou um **item do Depósito do grupo** (`StockRef`, ver `DEPOSITO.md` › Estoque), e o formulário tem "+ Criar no Depósito". O jardim não inventa plantas. Um cultivo por semente:

| Campo      | Significado                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------- |
| `id`       | gerado pelo cliente (`newId('crop')`); cultivos migrados guardam o antigo `seedId`                 |
| `seed`     | `StockRef` da semente                                                                              |
| `harvest`  | `StockRef` entregue na colheita                                                                    |
| `plotType` | tipo de espaço onde pode ser plantada                                                              |
| `days`     | dias até ficar pronta (inteiro ≥ 1)                                                                |
| `yield`    | quanto cada colheita entrega (inteiro ≥ 1)                                                         |
| `rare`     | rara: não se compra no jardim e não rebrota                                                        |
| `price`    | preço da semente em moedas; obrigatório se comum, ausente se rara                                  |
| `look`     | opcional: `{ kind: 'foliage' \| 'flower', hue }` (hue inteiro de -180 a 180); ausente = automática |

`look` é a **Aparência** escolhida no formulário (Automática, Folhagem ou Flor com cor). Ausente, `cropLook` sorteia por um hash estável da semente (o id do material, ou `d:<itemId>` para item do Depósito), então cultivos antigos mantêm a cor. Folhagem guarda `hue: 0` (não tem cor).

`cropsFor` só lista cultivos cujas pontas (semente e colheita) ainda existem, por nome da semente; o mestre vê os quebrados na aba Cultivos com aviso. Semente do Depósito sai como movimento (`strict` jogador, `clamp` mestre); colheita e devolução entram no item.

## Comandos (`src/commands/schema.ts`, regras em `src/systems/Garden.ts`)

| Comando                                                                                     | Quem pode        |
| ------------------------------------------------------------------------------------------- | ---------------- |
| `garden_crop_create` (`id`, `crop`), `garden_crop_update` / `garden_crop_remove` (`cropId`) | só o mestre      |
| `garden_plant` (`plotId`, `cropId`, `buy`)                                                  | jogador e mestre |
| `garden_harvest` (`plotId`; sem `plotId` = colher tudo o que está pronto)                   | jogador e mestre |
| `garden_clear` (`plotId`)                                                                   | jogador e mestre |

Os três do jogador estão em `PLAYER_COMMANDS` (`src/commands/applyCommand.ts`); os de cultivo caem na regra "todo o resto é do mestre". Não há `payer`: a compra sempre debita o acampamento.

Erros: `garden_not_built`, `unknown_plot` (não existe no nível em vigor), `plot_occupied`, `plot_empty`, `not_ready`, `wrong_plot_type`, `no_seed`, `rare_not_for_sale`, `crop_already_exists`, `crop_in_use` (remover cultivo com plantas no chão), `not_found` (cultivo ou material desconhecido), `insufficient_coins` (acampamento sem bronze) e `nothing_changed` (colher tudo sem nada pronto).

## Regras

- **Crescimento:** `passDay` soma `GROWTH_TENTHS_PER_DAY` (10 décimos) a cada planta de espaço em vigor. Pronta quando `growthTenths >= days × 10` (`isReady`). O contador (e não "plantada no dia X") deixa o trabalhador futuro só somar décimos.
- **Plantar:** a semente vem, nesta ordem, do estoque (gasta 1), da graça do mestre (sem estoque, o mestre planta sem pagar) ou, para jogador sem semente com `buy: true`, de uma compra pelo acampamento. Sem `buy`: `no_seed`, rara ou não. Com `buy: true`, rara sem semente: `rare_not_for_sale`. A semente comprada não passa pelo estoque. O tipo do espaço precisa bater com `plotType` (`wrong_plot_type`).
- **Colher:** entrega `yield` do material de colheita. **Comum (perene):** o espaço continua plantado e o crescimento volta a 0. **Rara:** o espaço fica vazio. Colher já pronta duas vezes é impossível, porque o crescimento zera ou o espaço esvazia. Material de colheita apagado entrega nada.
- **Colher tudo** (`garden_harvest` sem `plotId`): colhe todos os espaços prontos em vigor, somando por material em um `garden_harvested` cada; `nothing_changed` se não houver nenhum.
- **Arrancar** (`garden_clear`): esvazia o espaço sem colher, e a semente não volta.
- **Remover cultivo** com planta no chão é recusado (`crop_in_use`).

## Regra de acerto (`settleGarden`)

Plantas em espaços que **não existem** no nível em vigor passam por esta regra:

1. **Pronta:** é colhida para os Materiais. Uma perene acaba ali, sem rebrotar.
2. **Não pronta:** vai para o primeiro espaço livre do mesmo tipo no nível em vigor, mantendo o crescimento.
3. **Não pronta e sem espaço livre do tipo:** a semente volta ao estoque (`garden_seed_returned`; semente apagada não devolve nada).
4. **Cultivo apagado:** a planta é descartada.

Quando roda:

- Todo `passDay`, depois de `completeConstructions` (`src/systems/TimeSystem.ts`), então cobre o fim de uma obra de melhoria.
- Depois de `force_building` e de `remove_building` (`src/commands/applyCommand.ts`), para o nível forçado ou a estufa removida (sem construção, todo espaço some e tudo é acertado).

## Madeira passiva

- `produces: { "wood": N }` por nível de `herb_garden`: **3 / 6 / 10** madeira por dia nos níveis 1 / 2 / 3. O campo é genérico e serve a qualquer construção.
- `produceOneDay` (`src/systems/Production.ts`) roda em `passDay` depois do trabalho dos NPCs e antes de `completeConstructions`, usando o nível em vigor, então vale também durante uma obra de melhoria.
- Material apagado pelo mestre não recebe nada.
- O log soma o avanço inteiro: `building_produced` (construção, material, total).

## Gancho para trabalhadores

Ainda não há `jobs` na estufa. Quando existir a skill de madeiraria/jardinagem:

- **Mais madeira:** o efeito `produce` com `material: "wood"` já existe, sem código novo.
- **Crescimento mais rápido:** efeito novo `growth`, que soma décimos às plantas. O modelo já comporta (`growthTenths`).

## Ordem do dia (`passDay`)

1. Trabalho dos NPCs (`workOneDay`).
2. Produção passiva (`produceOneDay`).
3. Crescimento do jardim (`growGarden`), ainda com os espaços antigos em vigor: a planta que fica pronta no dia em que a obra termina é colhida, não devolvida como semente.
4. Obras que terminam (`completeConstructions`).
5. Acerto do jardim (`settleGarden`).
6. NPCs liberados e NPCs de volta das missões.

## Log

`garden_planted` (espaço, semente, bronze pago pelo acampamento), `garden_harvested` (material e quantidade), `garden_seed_returned`, `garden_cleared`, `building_produced`.

## Interface

- `SlotPanel.extraSections`: seção **Jardim** com resumo e botão **Abrir jardim**, como Taverna e Guilda.
- `src/ui/garden/GardenWindow.ts`: cabeçalho com **Colher tudo (N)**, a cena, a faixa de baixo e a lista de cartões (telas estreitas). A aba **Cultivos** (só o mestre) usa `CropForm.ts` para criar, editar e remover cultivos.
- `src/ui/garden/GardenScene.ts`: a cena 16:10 desenhada por código (sem a arte da construção). Moldura de pedra, gramado, dois caminhos em cruz e sombras de árvore; atrás dos espaços, as bancadas do nível em vigor (estufa: madeira com cobertura de vidro e moldura dourada; arcana: laje escura com borda violeta). O que só existe em nível acima aparece tracejado ("Estufa · Nível 2", "Lagos · Nível 3", "Nível 2").
- Cada espaço é um `<button>` com `aria-label` do estado ("Canteiro 3: Hortelã, faltam 2 dias") e cara própria: canteiro = caixote com terra; muda = vaso de barro; bandeja da estufa = bandeja com 2 vasos redondos; bacia arcana = bacia com anel de runas girando; lago = água animada com borda de pedra.
- **Plantas montadas por código** a partir de recortes dos renders `nettle_plant` (folhas) e `periwinkle_plant` (flores). Tufos por tipo: canteiro 2×4, muda 1, bandeja 2 (um por vaso), bacia 1, lago 3. Estágio pelo progresso: montinhos de terra, broto (< 0,34), planta jovem (< 0,67), planta cheia (flor em botão) e pronta (florida ou folhagem viçosa). A cara do cultivo (folhagem ou flor, e o tom da flor, via `hue-rotate`) vem de `look` quando o mestre escolheu; senão, de um hash estável do `seedId`. A planta desenhada nos espaços é sempre sprite, mesmo com foto no material.
- **Interação:** tocar num espaço vazio abre a bandeja de sementes do tipo do espaço (estoque "×N", preço com ícone de moeda, "rara" ou sem bronze desabilitados); tocar na semente planta, e **arrastar** a semente planta cada espaço vazio compatível por onde passar (um `garden_plant` por espaço, parando na primeira recusa). Tocar num espaço pronto colhe; segurar e arrastar com a foice colhe todos por onde passar. Tocar numa planta crescendo abre nome, progresso e **Arrancar** com confirmação dentro do popover. Esc e clique fora fecham o popover.
- **Ícone do cultivo** (`cropIcon`): se o material tiver ícone/foto (`icon`, o mesmo do `set_image` em Materiais), o jardim usa essa imagem pelo caminho de sempre (`pictureOr` em `src/ui/widgets.ts`, que também serve o `thumb()`; fotos enviadas via `GameImages`). De onde vem cada um:

  | Onde aparece                                                           | Material |
  | ---------------------------------------------------------------------- | -------- |
  | bandeja de sementes, fantasma ao arrastar, chips "Sementes no estoque" | semente  |
  | balão de "pronta", ícones que voam ao colher, chips "Colhido"          | colheita |

  Sem imagem no material, fica o sprite (flor tingida ou folha). Foto enviada aparece com o sprite no lugar enquanto carrega; o ícone que voa vai num invólucro para a troca não acontecer no nó animado.

- **Aparência no formulário** (`CropForm.ts`): Automática (padrão), Folhagem ou Flor; 9 botões de cor (o próprio sprite com `hue-rotate`, `aria-label` com o nome e `aria-pressed`) e um controle deslizante de ajuste fino, desabilitados fora de Flor; pré-visualização ao vivo do ícone e de uma planta pronta num vaso. Os giros das cores foram medidos nas pétalas rosa do `flower3`.
- Efeitos: "+4 Hortelã" subindo e ícones voando até o chip da faixa **Colhido** (o que foi colhido com a janela aberta); terra espirrando ao plantar. A faixa também mostra as **Sementes no estoque**.
- A janela re-renderiza com o jogo, mas só redesenha os espaços cujo desenho mudou, para não reiniciar as animações. `prefers-reduced-motion` desliga balanço, quique, runas e voo dos ícones.
- **Telas de até 640px:** a cena some e fica a lista de cartões por espaço. Arrastar sementes exige `touch-action: none` nos espaços, que cobririam quase toda uma cena com rolagem lateral e travariam a rolagem da página no celular.
- Lógica pura (estágio, hash do visual, tufos, posição do popover, cenário por nível) em `src/ui/garden/sceneLayout.ts`; estado e resumo dos espaços em `gardenViews.ts`; textos em `t.garden`.
- Texturas e sprites em `public/assets/garden/` (créditos em `src/data/credits.json`): pedra Stone Wall 23 dessaturada, madeira de `wooden_crate_02`, grama Grass004 e terra Ground048 do ambientCG, folhas e flores do Poly Haven. Todas CC0.

## Ordem de deploy

1. `npm run deploy:functions` (o bundle carrega `garden.json`; o layout novo dos espaços também precisa chegar primeiro ao servidor);
2. o site.

Sem `supabase db push`: não há migration, tudo fica no `GameState`. O save sobe de 8 para 9; a função precisa vir antes do site para nenhum cliente enviar `garden_*` a um servidor que não os conhece.

**Campo `look` do cultivo:** o schema do cultivo mudou, então de novo `npm run deploy:functions` primeiro (o servidor valida `garden_crop_create`/`garden_crop_update` com o schema novo e recusaria o campo) e depois o site (merge no master). Sem migration SQL e sem subir a versão do save: o campo é opcional.

Depois do deploy, no jogo: o mestre cria as categorias **Sementes** e **Ervas** nos Materiais e os cultivos na aba **Cultivos**.
