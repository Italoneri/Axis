# Laboratório Arcano: bancadas e poções

Objetivo: a construção **Laboratório Arcano** (`arcane_lab`, `ARCANE_LAB_BUILDING_ID` em `src/model/catalog.ts`, reexportado por `src/systems/Lab.ts`) ganha uma **oficina** com bancadas onde a party prepara poções, principalmente com as ervas da Estufa. Spec: `docs/superpowers/specs/2026-10-19-laboratorio-pocoes-design.md`.

## Onde guardar

- **`state.lab`** no `GameState`: `{ recipes: Recipe[], stations: Record<stationId, Brew> }`. Viaja com o save, como o jardim.
- **Layout das bancadas:** `catalog.lab` (`src/data/lab.json`, carregado por `src/data/gameData.ts` e pelo bundle do servidor `src/server/catalog.ts`). Por nível, a lista de bancadas com `id`, `type` e a caixa na cena (`x`, `y`, `w`, `h` de 0 a 1).
- **Save:** `SAVE_VERSION` = 10 (`src/model/schema.ts`). Saves da versão 9 ganham `lab: { recipes: [], stations: {} }`.
- As poções vão para os **Materiais** (categoria Poções, criada pelo mestre). O Depósito fica para depois.

## Bancadas por nível

| Tipo        | Ids                           | Nv1 | Nv2 | Nv3 |
| ----------- | ----------------------------- | --- | --- | --- |
| `alambique` | `alambique-1` … `alambique-4` | 2   | 3   | 4   |
| `caldeirao` | `caldeirao-1`, `caldeirao-2`  | –   | 1   | 2   |
| `circulo`   | `circulo-1`                   | –   | –   | 1   |

- O `parseCatalog` exige (`labProblems`): o mesmo número de níveis do `arcane_lab`, ids únicos por nível, e que uma bancada **nunca** mude de tipo, de caixa ou suma numa melhoria. Caixa fixa entre níveis faz os contornos tracejados das bancadas futuras nunca cobrirem as que já existem.
- Obra de melhoria em andamento: vale o layout do nível em vigor (`stationsInForce`, via `builtLevel`). Sem o laboratório construído, não há bancadas.

## Receitas (catálogo do mestre)

O laboratório não inventa material: a receita liga materiais que já existem.

| Campo         | Significado                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `id`          | gerado pelo cliente (`newId('recipe')`), enviado no `lab_recipe_create`         |
| `outputId`    | material da poção                                                               |
| `outputQty`   | poções por preparo (1 a 9999)                                                   |
| `ingredients` | 1 a 6 `{ materialId, quantity }` (1 a 9999), sem repetir material e sem a poção |
| `stationType` | tipo de bancada                                                                 |
| `days`        | dias até ficar pronta (1 a 365)                                                 |
| `color`       | opcional: cor do líquido (hex); ausente = tom estável pelo `outputId`           |
| `hidden`      | oculta para os jogadores; toda receita nasce oculta e o mestre revela           |

- O schema (`recipeFieldsSchema` / `recipeSchema`) recusa ingrediente repetido e a poção entre os ingredientes.
- Receita com material apagado some da bandeja. Editar, ocultar ou apagar uma receita **não** mexe nos preparos em andamento: a bancada guarda uma cópia.

## Comandos (`src/commands/schema.ts`, regras em `src/systems/Lab.ts`)

| Comando                                                                        | Quem pode        |
| ------------------------------------------------------------------------------ | ---------------- |
| `lab_recipe_create` (`id`, `recipe`), `lab_recipe_update`, `lab_recipe_remove` | só o mestre      |
| `lab_brew` (`stationId`, `recipeId`)                                           | jogador e mestre |
| `lab_collect` (`stationId`; sem ele = recolher tudo)                           | jogador e mestre |
| `lab_discard` (`stationId`)                                                    | jogador e mestre |

Erros: `lab_not_built`, `unknown_station`, `station_busy`, `station_empty`, `not_ready`, `wrong_station_type`, `missing_ingredients`, `recipe_already_exists`, `not_found` (também para receita oculta pedida por jogador) e `nothing_changed`.

## Regras

- **Preparar:** ordem das checagens: laboratório construído → bancada do nível em vigor → livre → receita existe (e revelada, para jogador) → tipo de bancada → estoque. Jogador precisa de **todos** os ingredientes; senão nada é gasto. Mestre gasta o que houver e o resto sai de graça.
- A bancada guarda `{ recipeId, outputId, outputQty, days, spent, color?, progressTenths }`; `spent` é o que saiu **de verdade** do estoque.
- **Progresso:** +10 décimos por dia (`BREW_TENTHS_PER_DAY`); pronta com `days × 10`.
- **Recolher:** entrega `outputQty` da poção e libera a bancada; poção apagada não entrega nada. Recolher tudo soma por material num só `lab_collected`.
- **Descartar:** libera a bancada sem devolver ingredientes.

## Regra de acerto (`settleLab`)

Preparos em bancadas que não existem no nível em vigor (só com `force_building` para baixo ou `remove_building`):

1. pronto: é recolhido;
2. em preparo: vai para a primeira bancada livre do mesmo tipo, com o progresso;
3. sem bancada livre: o `spent` volta ao estoque (`lab_ingredients_returned`; material apagado não volta).

Roda depois de `force_building`/`remove_building` (`settleBuildings` em `applyCommand.ts`) e, como proteção, em todo `passDay`.

## Trabalhadores

Posto **Supervisionar preparos** (Alquimia) no nv2 e nv3, efeito `brewing`: cada dia inteiro de rendimento soma 1 dia a **cada** preparo do laboratório; rendimento negativo atrasa sem passar de 0. Sem preparo, a fração é descartada. O posto **Destilar** continua igual. Ver `docs/plans/NPCS.md`.

## Ordem do dia (`passDay`)

1. Trabalho dos NPCs (inclusive o `brewing`).
2. Produção passiva.
3. Crescimento do jardim (`growGarden`) e progresso dos preparos (`brewLab`), no layout do dia.
4. Obras que terminam.
5. Acerto do jardim e do laboratório.
6. NPCs liberados e de volta das missões.

## Log

`lab_brewed` (bancada, poção, ingredientes gastos), `lab_collected` (poção e quantidade), `lab_discarded`, `lab_ingredients_returned`, `npc_worked` com efeito `brewing`.

## Interface

- `SlotPanel.extraSections`: seção **Laboratório Arcano** com resumo ("1 pronta · 2 preparando · 4 livres") e **Abrir laboratório**.
- `src/ui/lab/LabWindow.ts`: cabeçalho com **Recolher tudo (N)**, a cena, a faixa **Recolhido** / **Ingredientes no estoque** e os cartões das telas estreitas. Aba **Receitas** só para o mestre: lista por tipo de bancada com **Revelar/Ocultar**, **Editar** e **Remover**; formulário em `RecipeForm.ts` (poção com a categoria Poções primeiro, linhas de ingrediente, tipo, dias, rendimento, cor com prévia do frasco, "Oculta para os jogadores").
- `src/ui/lab/LabScene.ts`: cena 16:10 desenhada só com CSS: piso de lajes, parede com prateleiras de frascos e duas velas. Alambique = mesa, frasco com o líquido na cor da receita, serpentina de cobre e chama; caldeirão = panela de ferro sobre brasas; círculo = runas girando ao redor de um orbe. Bancadas de níveis acima aparecem tracejadas ("Caldeirão · Nível 2").
- Estados: livre (apagada), preparando (bolhas; fervendo na segunda metade, com vapor), pronta (brilho e balão com a poção). Cada bancada é um `<button>` com `aria-label` ("Alambique 2: Poção de Cura, falta 1 dia").
- Interação: livre → bandeja de receitas (chips "Hortelã 2/3", vermelho quando falta, selo **Estufa** e "Plante na Estufa de Ervas" com **Abrir jardim** se a estufa existir); preparando → progresso e **Descartar** com confirmação; pronta → toque recolhe e os frascos voam até a faixa.
- Reaproveita o chrome do jardim (`garden-pop`, `garden-status`, `garden-bubble`, `garden-strip`, `garden-chip`, `garden-cards`, `garden-locked`) e o `popoverPosition`.
- Lógica pura em `labViews.ts` (estados, resumo, opções de receita, bancadas futuras) e `labSceneLayout.ts` (cor do líquido, estágio, assinatura para redesenho); textos em `t.lab`.
- `prefers-reduced-motion` desliga velas, bolhas, vapor, runas, orbe e voo.

## Ordem de deploy

Depois do merge no master:

1. `npm run deploy:functions` **a partir do master** (o servidor precisa conhecer `lab_*`, o efeito `brewing` e o save 10 antes de qualquer cliente);
2. o site.

Sem `supabase db push`. Depois do deploy, no jogo: criar a categoria **Poções** e os itens nos Materiais, cadastrar as receitas na aba **Receitas** e **revelar** as que o grupo já conhece.
