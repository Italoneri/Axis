# Estufa de Ervas: jardim e madeira passiva

Objetivo: a construção **Estufa de Ervas** (`herb_garden`, `HERB_GARDEN_BUILDING_ID` em `src/model/catalog.ts`, reexportado por `src/systems/Garden.ts`) ganha um **jardim** onde a party planta sementes e colhe ervas, e rende **madeira passiva** todo dia. Spec original: `docs/superpowers/specs/2026-10-17-estufa-jardim-design.md`.

## Onde guardar

- **`state.garden`** no `GameState`: `{ crops: Crop[], plots: Record<plotId, { seedId, growthTenths }> }`. Viaja com o save, como a loja.
- **Layout dos espaços:** `catalog.garden` (`src/data/garden.json`, carregado por `src/data/gameData.ts`). Por nível, a lista de espaços com `id`, `type` e a caixa na arte (`x`, `y`, `w`, `h` de 0 a 1). Os ids são estáveis entre os níveis.
- **Madeira passiva:** campo `produces` por nível em `src/data/buildings.json`.
- **Save:** `SAVE_VERSION` = 9 (`src/model/schema.ts`). Saves da versão 8 ganham `garden: { crops: [], plots: {} }`.

## Espaços por nível

| Tipo       | Ids                         | Nv1 | Nv2 | Nv3 |
| ---------- | --------------------------- | --- | --- | --- |
| `canteiro` | `canteiro-1` … `canteiro-6` | 4   | 6   | 6   |
| `muda`     | `muda-1` … `muda-4`         | 4   | 4   | 4   |
| `estufa`   | `estufa-1`, `estufa-2`      | –   | 2   | 1   |
| `arcana`   | `arcana-1`                  | –   | –   | 1   |
| `lago`     | `lago-1`                    | –   | –   | 1   |

- Uma bancada (`estufa`, `arcana`) é um espaço só e se planta de uma vez; o `yield` do cultivo já vale pela fileira inteira.
- `muda` tem os mesmos ids nos três níveis (muda só o lugar na arte), então a planta acompanha sem transferência.
- No nv3, `estufa-2` deixa de existir e `arcana-1` aparece. É o único caso em que a regra de acerto (abaixo) mexe de verdade em plantas.
- Obra de melhoria em andamento: vale o layout do nível em vigor (`plotsInForce`, via `builtLevel`). Sem a estufa construída, não há espaços.
- A glicínia do nv3 ficou de fora.

## Cultivos (catálogo do mestre)

O mestre cria as categorias **Sementes** e **Ervas** nos Materiais e liga uma semente a uma colheita. O jardim não inventa plantas. Um cultivo por semente (`seedId`):

| Campo       | Significado                                                       |
| ----------- | ----------------------------------------------------------------- |
| `seedId`    | material da semente                                               |
| `harvestId` | material entregue na colheita                                     |
| `plotType`  | tipo de espaço onde pode ser plantada                             |
| `days`      | dias até ficar pronta (inteiro ≥ 1)                               |
| `yield`     | quanto cada colheita entrega (inteiro ≥ 1)                        |
| `rare`      | rara: não se compra no jardim e não rebrota                       |
| `price`     | preço da semente em moedas; obrigatório se comum, ausente se rara |

`cropsFor` só lista cultivos cujos materiais (semente e colheita) ainda existem, por nome da semente.

## Comandos (`src/commands/schema.ts`, regras em `src/systems/Garden.ts`)

| Comando                                                                   | Quem pode        |
| ------------------------------------------------------------------------- | ---------------- |
| `garden_crop_create`, `garden_crop_update`, `garden_crop_remove`          | só o mestre      |
| `garden_plant` (`plotId`, `seedId`, `buy`)                                | jogador e mestre |
| `garden_harvest` (`plotId`; sem `plotId` = colher tudo o que está pronto) | jogador e mestre |
| `garden_clear` (`plotId`)                                                 | jogador e mestre |

Os três do jogador estão em `PLAYER_COMMANDS` (`src/commands/applyCommand.ts`); os de cultivo caem na regra "todo o resto é do mestre". Não há `payer`: a compra sempre debita o acampamento.

Erros: `garden_not_built`, `unknown_plot` (não existe no nível em vigor), `plot_occupied`, `plot_empty`, `not_ready`, `wrong_plot_type`, `no_seed`, `rare_not_for_sale`, `crop_already_exists`, `crop_in_use` (remover cultivo com plantas no chão), `not_found` (cultivo ou material desconhecido), `insufficient_coins` (acampamento sem bronze) e `nothing_changed` (colher tudo sem nada pronto).

## Regras

- **Crescimento:** `passDay` soma `GROWTH_TENTHS_PER_DAY` (10 décimos) a cada planta de espaço em vigor. Pronta quando `growthTenths >= days × 10` (`isReady`). O contador (e não "plantada no dia X") deixa o trabalhador futuro só somar décimos.
- **Plantar:** a semente vem, nesta ordem, do estoque (gasta 1), da graça do mestre (o mestre planta sem pagar nem gastar estoque) ou, para jogador sem semente com `buy: true`, de uma compra pelo acampamento. Sem `buy`: `no_seed`. Rara sem semente: `rare_not_for_sale`. A semente comprada não passa pelo estoque. O tipo do espaço precisa bater com `plotType` (`wrong_plot_type`).
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
3. Obras que terminam (`completeConstructions`).
4. Acerto do jardim (`settleGarden`), depois crescimento (`growGarden`).
5. NPCs liberados e NPCs de volta das missões.

## Log

`garden_planted` (espaço, semente, bronze pago pelo acampamento), `garden_harvested` (material e quantidade), `garden_seed_returned`, `garden_cleared`, `building_produced`.

## Interface

- `SlotPanel.extraSections`: seção **Jardim** com resumo e botão **Abrir jardim**, como Taverna e Guilda.
- `src/ui/garden/GardenWindow.ts`: a arte do nível com um botão por espaço; clicar abre um popover para plantar, colher ou arrancar. No topo, **Colher tudo**. Abaixo, uma lista de cartões por espaço (a única visão no celular).
- Aba **Cultivos** (só o mestre) com `CropForm.ts`: criar, editar e remover cultivos por selects de material.
- Estado e resumo dos espaços em `gardenViews.ts`; textos em `t.garden`.

## Ordem de deploy

1. `npm run deploy:functions` (o bundle carrega `garden.json`);
2. o site.

Sem `supabase db push`: não há migration, tudo fica no `GameState`. O save sobe de 8 para 9; a função precisa vir antes do site para nenhum cliente enviar `garden_*` a um servidor que não os conhece.

Depois do deploy, no jogo: o mestre cria as categorias **Sementes** e **Ervas** nos Materiais e os cultivos na aba **Cultivos**.
