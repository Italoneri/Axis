# Laboratório Arcano: bancadas e fabricação de poções

Data: 2026-10-19. Pedido do Ítalo (mestre). O que está marcado como **(escolha do Claude)** foi decidido por mim e pode ser revisto antes de implementar. As respostas do Ítalo às perguntas estão no fim ("Decisões").

## Por que existe

O Laboratório Arcano (`arcane_lab`) hoje só tem o posto de NPC "Destilar", que rende Aetherium. O Ítalo quer que ele vire um lugar de uso, como a Estufa:

1. No painel do laboratório construído, um botão abre a **oficina**: uma cena com as **bancadas** (destilarias e afins).
2. Clicar numa bancada abre as **receitas de poção** que cabem nela.
3. As receitas usam principalmente as **ervas colhidas na Estufa**, fechando o ciclo plantar → colher → fabricar.

A quantidade e o tipo de bancadas crescem com o nível, seguindo a arte (alambiques no nv1, caldeirão no nv2, círculo de transmutação no nv3).

## Objetivos

- Botão **Abrir laboratório** no painel do laboratório construído.
- Uma janela com a cena da oficina do nível em vigor e cada bancada como ponto clicável.
- Clicar numa bancada livre abre as receitas daquele tipo de bancada, mostrando ingredientes (tenho/preciso), dias e rendimento.
- **Preparar** consome os ingredientes na hora; a poção fica pronta depois de N dias de jogo.
- **Recolher** entrega as poções nos Materiais. **Recolher tudo** de uma vez.
- O mestre cadastra as receitas numa aba **Receitas**, ligando materiais que já existem.

## Fora do escopo

- **Poções indo direto para o Depósito.** O Depósito vive fora do `GameState` (tabelas com RLS), e os comandos do jogo rodam sobre o `GameState`. As poções entram nos **Materiais** (categoria Poções, criada pelo mestre). Mover para o Depósito fica para depois (ver "Ganchos").
- **Efeito mecânico das poções.** O efeito é da mesa de RPG: vai na descrição do material da poção (ex.: "Cura 2d4+2").
- **Falha aleatória/crítico na fabricação.** O jogo é determinístico (servidor e cliente chegam no mesmo resultado).
- **Pesquisa revelando receitas sozinha.** Nesta entrega o mestre revela na mão (ver "Receitas ocultas"); ligar a uma pesquisa fica como gancho.
- Textos de `party`/`axis` do laboratório: continuam do Ítalo.

## Não pode acontecer

- **Preparar sem ter os ingredientes** (a não ser o mestre, ver "Preparar").
- **Recolher duas vezes a mesma poção.**
- **Perder ingredientes numa melhoria ou num rebaixamento forçado** (ver "Acerto das bancadas").
- **Uma receita editada mudar o que já está no fogo.** A bancada guarda uma cópia do que foi preparado.

## As bancadas de cada nível

| Tipo        | O que é na cena                                   | Nv1 | Nv2 | Nv3 |
| ----------- | ------------------------------------------------- | --- | --- | --- |
| `alambique` | mesa de madeira com alambique de vidro (destilaria) | 2   | 3   | 4   |
| `caldeirao` | caldeirão de ferro sobre brasas (infusões)          | –   | 1   | 2   |
| `circulo`   | círculo de transmutação rúnico no chão              | –   | –   | 1   |

**(escolha do Claude)**: os números acima. Ids estáveis entre níveis (`alambique-1`…`alambique-4`, `caldeirao-1`, `caldeirao-2`, `circulo-1`), e nenhum some numa melhoria: só num rebaixamento forçado ou na remoção da construção.

O layout fica em `src/data/lab.json`: por nível, a lista de bancadas com `id`, `type` e a caixa (`x`, `y`, `w`, `h` de 0 a 1) na cena 16:10 desenhada por código, como `garden.json`.

## Receitas (catálogo do mestre)

O mestre cria nos Materiais a categoria **Poções** (e os itens), e já tem as **Ervas** da Estufa. O laboratório não inventa material nenhum. Uma receita liga coisas que já existem, sempre por lista:

| Campo         | Significado                                                                   |
| ------------- | ----------------------------------------------------------------------------- |
| `id`          | gerado pelo cliente (`newId('recipe')`) e enviado no comando, porque a mesma poção pode ter mais de uma receita |
| `outputId`    | material da poção                                                             |
| `outputQty`   | quantas poções cada preparo entrega (inteiro de 1 a 9999)                     |
| `ingredients` | 1 a 6 itens `{ materialId, quantity }` (1 a 9999), sem repetir material e sem a própria poção |
| `stationType` | tipo de bancada onde se prepara                                               |
| `days`        | dias até ficar pronta (inteiro de 1 a 365, como os cultivos)                  |
| `color`       | opcional: cor do líquido na cena (hex); ausente = tom estável pelo `outputId` |
| `hidden`      | `true` = os jogadores não veem a receita (ver "Receitas ocultas")             |

Fica em `state.lab.recipes`, no save, como os cultivos.

### Receitas ocultas

Decisão do Ítalo: toda receita nasce **oculta** (`hidden: true`). O mestre revela quando quiser, por exemplo quando os jogadores pesquisarem a poção.

- Jogador: a bandeja da bancada só mostra receitas reveladas. Se nenhuma está revelada, mostra "Nenhuma receita conhecida para esta bancada".
- Mestre: vê todas, com o selo **Oculta** nas escondidas, e pode preparar qualquer uma.
- Na aba **Receitas**, cada receita tem o botão **Revelar** / **Ocultar** (manda `lab_recipe_update` com `hidden` trocado).
- `lab_brew` de jogador numa receita oculta é recusado com `not_found` (para o jogador ela não existe).
- Ocultar uma receita com bancada em uso não muda o preparo: a bancada termina com a cópia.

Sugestões para o Ítalo cadastrar depois do deploy (só exemplo, não entram no código):

| Poção                    | Bancada   | Ingredientes                            | Dias | Rende |
| ------------------------ | --------- | --------------------------------------- | ---- | ----- |
| Poção de Cura Menor      | alambique | 3 Hortelã + 1 Camomila                  | 1    | 2     |
| Tônico de Vigor          | alambique | 2 Ginseng + 1 Mel                       | 2    | 2     |
| Elixir de Mana           | caldeirao | 2 Flor-da-lua + 1 Aetherium             | 3    | 3     |
| Essência da Transmutação | circulo   | 1 Lírio Arcano (rara) + 5 Aetherium     | 5    | 1     |

## Como funciona para o jogador

### Preparar

1. Clico numa bancada livre. Abre a bandeja **Receitas** com todas as receitas **reveladas** daquele tipo de bancada, inclusive as que não consigo fazer. Cada uma mostra o ícone da poção, os ingredientes como chips "Hortelã 2/3" (em vermelho quando falta), os dias e o rendimento.
2. Se tenho tudo: **Preparar** gasta os ingredientes do estoque do grupo e a bancada começa a borbulhar.
3. Se falta algo: o botão fica desabilitado e diz o que falta. Se o ingrediente que falta é a colheita de algum cultivo da Estufa, o chip ganha o selo **Estufa** e a dica "Plante na Estufa de Ervas" (com atalho **Abrir jardim** se a estufa estiver construída).
4. **Mestre**: prepara mesmo sem estoque; gasta o que houver e o resto sai de graça, como plantar no jardim. **(escolha do Claude)**

### Preparando

- Todo dia que o mestre avança, cada bancada em uso ganha **10 décimos**. Fica pronta com `days × 10` (mesmo contador da Estufa, `progressTenths`), para um trabalhador futuro só somar décimos.
- A bancada mostra "faltam 2 dias" e uma barra. Pronta, ganha brilho e um frasco flutuando.

### Recolher

- **Recolher** entrega `outputQty` do material da poção nos Materiais e libera a bancada.
- **Recolher tudo**: recolhe todas as bancadas prontas.
- **Descartar**: esvazia uma bancada em preparo, **sem devolver os ingredientes**, com confirmação. **(escolha do Claude)**
- Material da poção apagado pelo mestre: recolher entrega nada, mas libera a bancada.

### Cópia do preparo

Ao preparar, a bancada guarda `{ recipeId, outputId, outputQty, days, spent, color, progressTenths }`, onde `spent` é o que saiu **de verdade** do estoque (para o jogador, os ingredientes da receita; para o mestre sem estoque, só o que havia). Assim:

- Editar a receita não muda o que já está no fogo.
- Apagar uma receita com bancada em uso é permitido: a bancada termina com a cópia. **(escolha do Claude: menos erro para o mestre que a Estufa, que recusa)**
- O acerto devolve exatamente o que foi gasto, nunca cria material do nada.

## Acerto das bancadas (`settleLab`)

Bancadas em uso que **não existem** no nível em vigor (só acontece com `force_building` para baixo ou `remove_building`):

1. **Pronta**: é recolhida para os Materiais.
2. **Em preparo**: vai para a primeira bancada livre do mesmo tipo, mantendo o progresso.
3. **Em preparo e sem bancada livre do tipo**: o `spent` da cópia volta ao estoque (`lab_ingredients_returned`; material apagado não devolve nada).

Roda em todo `passDay` depois de `completeConstructions` e depois de `force_building`/`remove_building`, como `settleGarden`. No `passDay` ele é só proteção: obra só sobe nível, então o acerto de verdade acontece nos dois comandos.

## NPCs

- O posto **Destilar** (Alquimia → Aetherium) continua como está.
- **Entra nesta entrega (decisão do Ítalo)**: efeito novo `brewing` nos `jobs`: o rendimento do NPC (em décimos, via `postYieldTenths`) é somado a **cada** bancada em preparo do laboratório. Como haverá poucos NPCs, um só supervisiona todas. Um alquimista bom acelera tudo; um que atrapalha (rendimento negativo) atrasa, sem deixar o progresso abaixo de 0. É um segundo posto no nv2+: "Supervisionar preparos" (habilidade `alchemy`). **(escolha do Claude: nv2+)**

## Comandos

| Comando                                                        | Quem pode        |
| -------------------------------------------------------------- | ---------------- |
| `lab_recipe_create`, `lab_recipe_update`, `lab_recipe_remove`  | só o mestre      |
| `lab_brew` (`stationId`, `recipeId`)                           | jogador e mestre |
| `lab_collect` (`stationId`; sem `stationId` = recolher tudo)   | jogador e mestre |
| `lab_discard` (`stationId`)                                    | jogador e mestre |

Regras em `src/systems/Lab.ts` (funções puras), validação em `src/commands/schema.ts`.

Erros: `lab_not_built`, `unknown_station` (não existe no nível em vigor), `station_busy`, `station_empty`, `not_ready`, `wrong_station_type`, `missing_ingredients`; e os que já existem: `not_found` (receita ou material desconhecido, ou receita oculta pedida por jogador) e `nothing_changed` (recolher tudo sem nada pronto). A receita inválida (ingrediente repetido, poção entre os ingredientes) é recusada pelo schema.

## Onde guardar

- `state.lab = { recipes: Recipe[], stations: Record<stationId, Brew> }`.
- O save vai da versão **9 para a 10**: os saves antigos ganham `lab: { recipes: [], stations: {} }`.
- Sem migration SQL. **Deploy:** depois do merge, `npm run deploy:functions` **a partir do master** e depois o site.

## Log

- `lab_brewed` (bancada, poção, ingredientes gastos)
- `lab_collected` (material e quantidade somados por comando)
- `lab_discarded`
- `lab_ingredients_returned`

## Interface

- `SlotPanel.extraSections`: seção **Laboratório** com resumo ("1 pronta · 2 preparando · 1 livre") e o botão **Abrir laboratório**.
- `src/ui/lab/LabWindow.ts`: cabeçalho com **Recolher tudo (N)**, a cena, a faixa de baixo (**Recolhido** nesta sessão e **Ingredientes no estoque**) e a lista de cartões em telas de até 640px.
- `src/ui/lab/LabScene.ts`: cena 16:10 desenhada por código. Piso de pedra escura, estantes com frascos ao fundo, velas. Bancadas: alambique (mesa de madeira, frasco de vidro com serpentina, líquido na cor da receita), caldeirão (ferro sobre brasas), círculo (runas no chão girando, na paleta violeta dos `fx` do laboratório). Bancada de nível acima aparece tracejada ("Caldeirão · Nível 2").
- Estados de cada bancada (`<button>` com `aria-label`, ex.: "Alambique 2: Poção de Cura Menor, falta 1 dia"): livre (apagada), preparando (bolhas e vapor animados, barra), pronta (brilho e frasco flutuando).
- **Interação**: livre → bandeja de receitas; preparando → nome, progresso e **Descartar** com confirmação no popover; pronta → toque recolhe, com o ícone da poção voando até a faixa **Recolhido**. Esc e clique fora fecham.
- O mestre ganha a aba **Receitas** (`RecipeForm.ts`): select da poção (filtrado pela categoria Poções, mas pode trocar), lista de ingredientes com "+ Ingrediente" e remover, select do tipo de bancada, dias, rendimento, cor opcional com prévia do frasco. Na lista, selo **Oculta** e botão **Revelar** / **Ocultar** em cada receita.
- Re-render só das bancadas que mudaram (como o jardim), `prefers-reduced-motion` desliga bolhas, runas e voo.
- Lógica pura em `src/ui/lab/labViews.ts` e `src/ui/lab/labSceneLayout.ts`; textos em `t.lab`.

## Ganchos

- **Depósito**: comando futuro "Guardar no Depósito" que tira do material e cria o item `kind: 'pocao'` pela API do Depósito.
- **Pesquisa que revela receita**: ligar uma pesquisa concluída a `hidden: false` sozinho, sem o mestre.

## Testes

- `Lab.test.ts`, table-driven: preparar (com tudo, faltando, mestre sem estoque, tipo errado, ocupada, fora do nível em vigor, construção ausente, receita oculta para jogador e para mestre), progresso, recolher (com material apagado), recolher tudo, descartar, edição, ocultação e remoção de receita com bancada em uso, as três saídas do acerto, acerto do mestre sem estoque devolve só o `spent`.
- `TimeSystem.test.ts`: ordem do dia (NPC → progresso → obras → acerto) e obra do nv2 que termina no dia: os preparos já avançaram, e `caldeirao-1` só fica usável depois.
- `NpcWork.test.ts`: supervisor bom acelera todas as bancadas, um que atrapalha atrasa sem ficar abaixo de 0, sem preparo não faz nada.
- `SaveSystem.test.ts`: migração 9→10.
- `applyCommand.test.ts`: permissões (jogador não cria receita) e acerto após `force_building`/`remove_building`.
- `labViews.test.ts`: resumo, estado de cada bancada, opções de receita (falta, selo Estufa, mestre).
- `catalog.test.ts`: `lab.json` válido, mesmo número de níveis do `arcane_lab`, ids únicos por nível, id nunca muda de tipo entre níveis, nenhum id some numa melhoria.

## Decisões (revisão com o Ítalo, 2026-10-19)

1. Bancadas por nível 2 / 3+1 / 4+2+1: ok.
2. Poções nos Materiais, Depósito depois: ok.
3. Descartar não devolve ingredientes.
4. O posto que acelera os preparos **entra agora** e vale para **todas** as bancadas: haverá poucos NPCs.
5. Receitas nascem **ocultas**; o mestre revela (por exemplo, depois de uma pesquisa dos jogadores).
