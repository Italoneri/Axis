# Estufa e Laboratório usando o Depósito como estoque

Data: 2026-10-19. Pedido do Ítalo (mestre), depois de o Laboratório estar pronto. O que está marcado como **(escolha do Claude)** pode ser revisto.

## Por que existe

Hoje cultivos e receitas só ligam **materiais** (`seedId`, `harvestId`, `outputId`, ingredientes). Para cada semente, erva ou poção, o mestre precisa criar um material, e muitas vezes uma categoria nova nos Materiais. O Ítalo quer que essas coisas vivam no **Depósito do grupo**, como itens com contador ("porção de cavalo ×2"), e que estufa e laboratório gastem e somem direto lá.

Decidido com o Ítalo:

1. **Tudo do jardim e do laboratório** pode morar no Depósito: sementes, ervas colhidas, poções e ingredientes.
2. No formulário, o mestre **liga a um item que já existe** no Depósito (com atalho para criar o item ali mesmo).
3. **Pode misturar**: cada ponta (semente, colheita, poção, ingrediente) pode ser um item do Depósito ou um material (Aetherium, ferro…).
4. Cada coisa é um **item com contador** no Depósito.

## Objetivos

- Cultivo: semente e colheita podem ser item do Depósito ou material.
- Receita: poção e cada ingrediente podem ser item do Depósito ou material.
- Plantar e preparar **gastam** do item; colher e recolher **somam** no item. O contador do Depósito muda na hora, para todos (realtime que já existe).
- Nada de categoria nova obrigatória nos Materiais.
- Cultivos e receitas antigos (com materiais) continuam funcionando sem o mestre mexer.

## Fora do escopo

- Ligar a itens das **áreas privadas**. Só o Depósito do grupo. **(escolha do Claude)**: a estufa e o laboratório são do grupo, e a área privada não chega ao navegador dos outros.
- Mudar o Entreposto, os materiais de construção ou os NPCs (o "Destilar" continua rendendo o material Aetherium).
- Converter automaticamente os materiais existentes em itens do Depósito. O mestre religa quando quiser.

## Não pode acontecer

- **Gastar o que não tem**: se o item tem 2 sementes e dois jogadores plantam ao mesmo tempo, o segundo é recusado e nada muda (nem o jogo, nem o Depósito).
- **O jogo mudar e o Depósito não** (ou o contrário). Os dois são gravados juntos.
- **Contador negativo** ou acima de 99.999.
- **Perder sementes/ingredientes** num acerto (rebaixamento, remoção): a devolução vai para o item ligado.

## A referência de estoque (`StockRef`)

Um tipo novo, usado em todas as pontas:

```ts
type StockRef =
  | { source: 'material'; materialId: string }
  | { source: 'depot'; itemId: string };
```

| Onde           | Antes                     | Depois                                      |
| -------------- | ------------------------- | ------------------------------------------- |
| Cultivo        | `seedId`, `harvestId`     | `id`, `seed: StockRef`, `harvest: StockRef` |
| Espaço plantado| `{ seedId, growthTenths }`| `{ cropId, growthTenths }`                  |
| Receita        | `outputId`, `ingredients[].materialId` | `output: StockRef`, `ingredients[].ref: StockRef` |
| Preparo (cópia)| `outputId`, `spent[].materialId` | `output: StockRef`, `spent[].ref`  |

- O cultivo ganha `id` próprio (`newId`), porque a semente deixa de ser sempre um material. Saves antigos: `id = seedId`.
- As regras de "ingrediente repetido" e "a poção não pode ser ingrediente dela mesma" passam a comparar `StockRef` (mesma fonte e mesmo id).

## Contador zero

Hoje um item do Depósito tem quantidade de 1 a 99.999. Com a ligação, a semente acaba e o item não pode sumir (a ligação quebraria). **Passa a valer 0 a 99.999** (no zod e no `check` do banco). O cartão mostra "×0" apagado com "em falta". O mestre ainda pode remover o item de propósito.

## Como o gasto chega ao Depósito

O Depósito fica fora do `GameState`, então `applyCommand` não sabe quantas sementes há lá. A solução segue a compra de equipamento do Entreposto (`commit_shop_purchase`):

1. `applyCommand` continua puro e devolve, além do novo estado, uma lista de **movimentos de estoque** do Depósito:
   `{ itemId, delta, mode: 'strict' | 'clamp' }` (somados por item).
   - Gasto de jogador: `strict` (falta → recusa).
   - Gasto do mestre: `clamp` (gasta o que houver, o resto sai de graça, como já é hoje).
   - Entrada (colher, recolher, devolver): delta positivo, limitado a 99.999.
2. **Online**: o servidor grava jogo + movimentos numa função SQL nova, `commit_game_stock`, numa transação só. Ela trava as linhas dos itens, confere que são do grupo e não estão na lixeira, aplica e devolve `ok`, `conflict` (revisão), `stock_short` ou `stock_missing`. Qualquer recusa desfaz tudo.
3. **Offline**: a mesma regra em TypeScript (`applyStock` em `src/systems/Depot.ts`), aplicada no Depósito local antes de aceitar o comando.
4. **Na tela**: as janelas leem o Depósito do grupo (já carregado e com realtime) para mostrar "Hortelã 2/3" e desabilitar o botão. A conferência de verdade é a do banco.

Materiais continuam conferidos dentro de `applyCommand`, como hoje. Uma receita mista confere as duas coisas.

Recusas novas: `stock_short` vira `missing_ingredients` (preparar) ou `no_seed` (plantar) na mensagem; `stock_missing` vira "o item ligado foi removido do Depósito".

### Entradas que caem num item removido

Colher/recolher/devolver para um item que está na lixeira ou foi apagado não entrega nada, igual ao material apagado hoje, e entra no log como perdido. **(escolha do Claude)**

## O avanço de dia

`passDay` pode gerar entradas no Depósito pelo acerto (espaço/bancada que some e devolve sementes ou ingredientes, ou colhe o que estava pronto). Esses movimentos seguem pelo mesmo caminho (`commit_game_stock`), todos positivos, então o avanço nunca é recusado por estoque.

## Interface

### Formulários do mestre (Cultivo e Receita)

- Cada ponta vira um **seletor de estoque** com dois grupos:
  - **Depósito do grupo**: itens por seção ("porções › porção de cavalo ×2").
  - **Materiais**: como hoje.
- Botão **+ Criar no Depósito** ao lado: pede nome, seção (lista as seções do grupo, com "+ Nova seção") e tipo (`pocao`/`outro`), cria o item com 0 e já liga. Usa os comandos do Depósito que já existem (`section_create`, `item_create`).
- A cor automática do líquido e a aparência automática da planta passam a usar o hash do id do item quando a ponta é do Depósito.

### Jardim e Laboratório

- Chips, estoques e "Sementes no estoque" / "Ervas no estoque" leem `StockRef` (material ou item).
- O selo **Estufa** continua: um ingrediente é "da estufa" quando algum cultivo tem `harvest` igual a ele.
- Item na lixeira/removido: o cultivo ou a receita some da bandeja dos jogadores; o mestre vê com aviso "item do Depósito removido".

### Depósito

- No cartão do item ligado, um selo **🔗** com o que usa ele ("Semente de Hortelã", "Poção da receita X", "Ingrediente de 2 receitas"), lido do `GameState`.
- Remover um item ligado pede confirmação dizendo o que vai parar de funcionar.
- `×0` aparece apagado, com "em falta".

## Log

- As entradas do jardim e do laboratório passam a guardar o **nome** da ponta (material ou item) no momento, para o histórico não depender do item existir depois.
- O Depósito não ganha `depot_changed` para esses movimentos (o log do jogo já conta a história). **(escolha do Claude)**

## Onde guardar

- `SAVE_VERSION` **10 → 11**. Migração:
  - cultivo `{ seedId, harvestId, … }` → `{ id: seedId, seed: { source: 'material', materialId: seedId }, harvest: { source: 'material', materialId: harvestId }, … }`;
  - espaço `{ seedId }` → `{ cropId: seedId }`;
  - receita e preparo: `outputId`/`materialId` → `{ source: 'material', … }`.
- Migration SQL nova: `check (quantity between 0 and 99999)` em `depot_items` e a função `commit_game_stock` (só `service_role`).

## Deploy

1. `supabase db push` (migration nova).
2. `npm run deploy:functions` (save v11 e os movimentos de estoque).
3. O site.

## Testes

- `Depot.test.ts`: `applyStock` (strict falta, clamp, limite, item privado, item na lixeira, soma por item).
- `Garden.test.ts` e `Lab.test.ts`: plantar/colher/preparar/recolher com item do Depósito, com material e misto; movimentos devolvidos corretos; mestre em `clamp`.
- `SaveSystem.test.ts`: migração 10→11 de cultivos, espaços, receitas e preparos.
- `handler.test.ts` (com `memoryDb`): `stock_short` recusa e não grava; `conflict`; sucesso grava os dois.
- `supabase/tests/stock.test.sql`: a função trava e desfaz, recusa item privado e item na lixeira.
- Views: chips "2/3" lendo do Depósito; selo 🔗 no cartão do Depósito.
