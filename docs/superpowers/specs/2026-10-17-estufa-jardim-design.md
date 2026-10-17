# Estufa de Ervas: jardim e madeira passiva

Data: 2026-10-17. Decidido em conversa com o Ítalo (mestre). O que está marcado como **(escolha do Claude)** foi decidido por mim e pode ser revisto.

## Por que existe

A Estufa de Ervas (`herb_garden`) hoje é só uma construção. O Ítalo quer que ela vire um lugar de uso:

1. **Um jardim** onde a party planta sementes, acompanha o crescimento e colhe ervas, que vão para os Materiais.
2. **Madeira passiva**: a estufa rende madeira todo dia, sem ninguém trabalhar nela.

O espaço do jardim cresce com o nível da construção, seguindo o que as artes de cada nível mostram.

## Objetivos

- Botão **Abrir jardim** no painel da estufa construída.
- Uma janela com a arte do nível atual e pontos clicáveis sobre cada espaço de plantio.
- Plantar escolhendo entre todas as sementes do catálogo, mesmo as que estão em falta. As comuns podem ser compradas ali mesmo.
- Ervas comuns são perenes: rebrotam depois de cada colheita. As raras esvaziam o espaço.
- Madeira passiva por dia, que aumenta com o nível.

## Fora do escopo

- **Trabalhadores na estufa.** Quando existir a skill de madeiraria/jardinagem, um NPC vai aumentar a madeira e acelerar o crescimento. Por enquanto a estufa não tem `jobs`. O desenho já deixa o gancho pronto (ver "Gancho para trabalhadores").
- Erva que murcha se ninguém colher.
- Colheita com variação aleatória. O jogo é determinístico (servidor e cliente chegam no mesmo resultado).
- Textos de `party`/`axis` da estufa: continuam do Ítalo.

## Não pode acontecer

- **Plantar semente que não se tem**, a não ser comprando na hora uma semente comum.
- **Comprar semente rara no jardim.** As raras vêm do Entreposto ou de missões.
- **Perder planta numa melhoria.** Quando um espaço some ao subir de nível, o que estava nele é colhido ou transferido (ver "Melhoria da estufa").
- **Colher duas vezes a mesma safra.**

## Os espaços de cada nível

Cada pedaço da arte é um **espaço** com um tipo. Uma fileira de 10 vasos da estufa de vidro conta como uma **bancada**, que se planta de uma vez e rende como 10 vasos (decisão do Ítalo).

| Tipo       | O que é na arte                                                | Nv1 | Nv2 | Nv3 |
| ---------- | -------------------------------------------------------------- | --- | --- | --- |
| `canteiro` | canteiros de flores no gramado                                 | 4   | 6   | 6   |
| `muda`     | sementeiras de vidro (nv1); depois, a mesa de mudas à esquerda | 4   | 4   | 4   |
| `estufa`   | fileira de 10 vasos comuns na estufa de vidro                  | –   | 2   | 1   |
| `arcana`   | fileira de 10 vasos que brilham (nv3)                          | –   | –   | 1   |
| `lago`     | lago de lírios em frente à glicínia (nv3)                      | –   | –   | 1   |

**(escolha do Claude)**: a sementeira do nv1 e a mesa de mudas do nv2+ são o mesmo tipo `muda` com os mesmos ids. Muda só o lugar na arte, então a planta acompanha sem precisar ser transferida.

**Glicínia (nv3)**: fica de fora desta entrega. É a árvore do centro, e o Ítalo decide depois se ela dá uma colheita especial ou se é só um efeito de `axis`. **(escolha do Claude)**

O layout fica em `src/data/garden.json`: por nível, a lista de espaços com `id`, `type` e a caixa na arte (`x`, `y`, `w`, `h` normalizados de 0 a 1, como as coordenadas do `fx`). Os ids são estáveis entre os níveis (`canteiro-1`…`canteiro-6`, `muda-1`…`muda-4`, `estufa-1`, `estufa-2`, `arcana-1`, `lago-1`).

## Sementes e ervas (catálogo do mestre)

O Ítalo cria nos Materiais duas categorias, **Sementes** e **Ervas**, com os itens que quiser. O jardim não inventa nenhuma planta.

O mestre transforma uma semente em **cultivo**, ligando duas coisas que já existem, sempre por lista, sem digitar id:

| Campo         | Significado                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `seedId`      | material da semente (um cultivo por semente)                                    |
| `harvestId`   | material que a colheita entrega                                                 |
| `plotType`    | tipo de espaço onde pode ser plantada                                           |
| `days`        | dias até ficar pronta (inteiro ≥ 1)                                             |
| `yield`       | quanto cada colheita entrega (inteiro ≥ 1; numa bancada já vale pelos 10 vasos) |
| `rare`        | rara: não se compra no jardim e não rebrota                                     |
| `priceBronze` | preço da semente no jardim; obrigatório se comum, ausente se rara               |

Fica em `state.garden.crops`, no save, como os itens da loja.

## Como funciona para o jogador

### Plantar

1. Clico num espaço vazio. Abre a aba **Sementes** com **todos** os cultivos que cabem nesse tipo de espaço, inclusive os de semente zerada. Cada um mostra a quantidade no estoque, os dias, o rendimento e o selo "Rara" quando for o caso.
2. Se tenho a semente: **Plantar** gasta 1.
3. Se não tenho e é comum: **Comprar e plantar · N bronze**. Paga, planta, e a semente comprada não passa pelo estoque. Quem paga é **sempre o acampamento** (decisão do Ítalo: sementes comuns são gasto do grupo; as raras saem do bolso dos jogadores no Entreposto). Sem bronze suficiente no acampamento, o botão fica desabilitado com o que falta. **(escolha do Claude: comprar junto com o plantio, num clique só)**
4. Se não tenho e é rara: o botão aparece desabilitado com a dica "Encontrada no Entreposto ou em missões".

### Crescer

- Todo dia que o mestre avança, cada planta ganha **10 décimos** de crescimento. Fica pronta com `days × 10`.
- **(escolha do Claude)**: o crescimento é guardado como um contador (`growthTenths`) e não como "plantada no dia X". Assim o trabalhador do futuro só soma décimos a mais, sem mudar o modelo.
- O espaço mostra "faltam 2 dias" e uma barra de progresso. Pronta, ganha um brilho.

### Colher

- **Colher** entrega `yield` do material de colheita nos Materiais.
- **Comum (perene)**: o espaço continua com a planta e o crescimento volta a 0.
- **Rara**: o espaço fica vazio.
- **Colher tudo**: colhe todos os espaços prontos de uma vez.
- **Arrancar**: esvazia o espaço sem colher (para trocar uma perene). A semente não volta.

## Melhoria da estufa

Quando uma obra de melhoria termina (`completeConstructions`), cada planta num espaço que **não existe** no novo nível passa por esta regra (decisão do Ítalo):

1. **Pronta**: é colhida para os Materiais. Uma perene não rebrota em lugar nenhum: acaba ali.
2. **Não pronta**: vai para um espaço vazio do mesmo tipo no novo nível, mantendo o crescimento.
3. **Não pronta e sem espaço livre do mesmo tipo**: a semente volta ao estoque. **(escolha do Claude)**

Com o layout acima, isso acontece de verdade em um caso: no nv3, `estufa-2` vira `arcana-1`. O que estava em `estufa-2` passa por essa regra.

Enquanto a obra não termina, o jardim usa o nível em vigor (`activeLevel`).

## Madeira passiva

- Campo novo e genérico por nível em `buildings.json`: `"produces": { "wood": 3 }`. Fica reutilizável para outras construções.
- Valores: **3 / 6 / 10 madeira por dia** nos níveis 1 / 2 / 3.
- É aplicado em `passDay`, depois do trabalho dos NPCs, para construções `done` e para as que estão em obra de melhoria (no nível em vigor).
- Se o material não existir mais (o mestre apagou), não entrega nada, igual ao `produce` dos NPCs.
- O log soma tudo no fim do avanço: `building_produced` com construção, material e total.

## Gancho para trabalhadores

Quando existir a skill, basta adicionar `jobs` aos níveis da estufa:

- **Mais madeira**: o efeito `produce` com `material: "wood"` **já existe** (`jobEffectSchema`). Não precisa de código novo.
- **Crescimento mais rápido**: um efeito novo, `growth`, que soma décimos a todas as plantas da estufa (via `yieldTenths`). Fica para quando a skill existir.

## Comandos

| Comando                                                          | Quem pode        |
| ---------------------------------------------------------------- | ---------------- |
| `garden_crop_create`, `garden_crop_update`, `garden_crop_remove` | só o mestre      |
| `garden_plant` (`plotId`, `seedId`, `buy?: true`)                | jogador e mestre |
| `garden_harvest` (`plotIds`: um ou "colher tudo")                | jogador e mestre |
| `garden_clear` (`plotId`)                                        | jogador e mestre |

Regras em `src/systems/Garden.ts` (funções puras), validação em `src/commands/schema.ts`. A compra sempre debita o acampamento, então não há `payer` nem regra nova em `isAllowed`. O mestre planta sem pagar, como compra de graça no Entreposto.

Erros: `garden_not_built`, `unknown_plot` (não existe no nível em vigor), `plot_occupied`, `plot_empty`, `not_ready`, `wrong_plot_type`, `unknown_crop`, `no_seed`, `rare_not_for_sale`, `crop_already_exists`, `insufficient_funds`. Remover um cultivo com plantas no chão é recusado (`crop_in_use`). **(escolha do Claude)**

## Onde guardar

- `state.garden = { crops: Crop[], plots: Record<plotId, { seedId, growthTenths }> }`.
- O save vai da versão **8 para a 9**: os saves antigos ganham `garden: { crops: [], plots: {} }`.
- Sem migration SQL: tudo fica no `GameState`. **Deploy:** `npm run deploy:functions` e depois o site.

## Log

- `garden_planted` (espaço, semente, bronze pago pelo acampamento, quando houver compra)
- `garden_harvested` (material e quantidade somados por comando)
- `garden_cleared`
- `building_produced` (somado por avanço)

## Interface

- `SlotPanel.extraSections`: seção **Jardim** com um resumo ("3 prontas · 2 crescendo · 4 vazias") e o botão **Abrir jardim**, como Taverna e Guilda.
- `src/ui/garden/GardenWindow.ts`: a arte do nível em vigor com os espaços como botões posicionados. Clicar num espaço abre um popover para plantar, ver o progresso, colher ou arrancar. No topo, o botão **Colher tudo**.
- No celular (tela estreita), uma lista de cartões por espaço no lugar dos hotspots.
- O mestre ganha a aba **Cultivos** na mesma janela para criar, editar e remover cultivos, com selects de material filtrados pelas categorias.
- Textos em `t.garden`.

## Testes

- `Garden.test.ts`, table-driven: plantar (com semente, comprando, rara sem semente, tipo errado, espaço ocupado, espaço fora do nível), crescer, colher perene e rara, colher tudo, arrancar, as três saídas da regra de melhoria.
- `TimeSystem.test.ts`: madeira passiva por nível, durante uma obra e com o material apagado.
- `SaveSystem.test.ts`: migração 8→9.
- Views puras do jardim (resumo e estado de cada espaço) com testes, como `shopViews.test.ts`.
