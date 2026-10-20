# Depósito: seções, itens e áreas privadas

Objetivo: uma janela no estilo do **Arquivo de registros** para guardar os itens do grupo (equipamentos, poções ou qualquer outro), organizados em **seções**, e uma **área privada** para cada personagem, que só o dono e o mestre veem.

## Onde abrir

A construção que era o **Arsenal** (`armory`, anel externo) foi renomeada para **Depósito** (só o nome e a descrição; o id continua `armory`, então saves antigos seguem valendo). A janela abre pelo painel dela construída (`DEPOT_BUILDING_ID` em `src/systems/Depot.ts`). O mestre também abre pelas ferramentas do mestre, mesmo sem a construção.

## Onde guardar: fora do `GameState`, como o Arquivo

Pelo mesmo motivo do Arquivo: a área privada de um personagem não pode chegar ao navegador dos outros jogadores, e o `GameState` vai inteiro para todos. Tabelas com RLS resolvem isso no banco.

| Modo    | Onde                                                      | Quem decide                                                       |
| ------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Online  | `depot_sections`, `depot_items` (Supabase, RLS, realtime) | as regras puras rodam no cliente; RLS e triggers são a autoridade |
| Offline | `localStorage['axis-base-builder:depot']`                 | as mesmas regras puras                                            |

Offline, a área privada fica só escondida pela janela: é o mesmo navegador para todos.

## Dados (`src/systems/Depot.ts`, zod)

- **Seção:** `id`, `name` (1–120), `icon?`, `ownerId` (`null` = depósito do grupo; id do personagem = área privada dele), `order`, `authorId`, `deletedAt`. O nome não se repete dentro da mesma área. Uma seção nunca muda de área.
- **Item:** `id`, `sectionId`, `name` (1–120), `kind` (`equipamento` | `pocao` | `outro`), `quantity` (0–99.999; 0 aparece "×0 em falta" e o item continua ligado), `notes` (até 2.000), `order`, `authorId`, `editedBy?`, `createdAt`, `updatedAt`, `deletedAt`. A área do item é a da sua seção; online, a linha guarda uma cópia (`owner_id`) para a RLS.

## Regras

`applyDepotCommand(depot, command, { viewer, now })`: `section_create/update/shift/remove/restore`, `item_create/update/adjust/move/shift/remove/restore` e `trash_empty` (só o mestre).

- Um jogador só vê, cria e mexe no depósito do grupo e na própria área; a área de outro personagem responde `not_found`, como se não existisse. Criar seção na área de outro responde `forbidden`.
- `item_move` entre áreas é como se guarda ou retira algo do depósito do grupo.
- O log (`depot_log` → entrada `depot_changed`) só recebe o que acontece no depósito do grupo. Mover da área privada para o grupo é `stored`, o contrário é `taken`, e nenhum dos dois cita a seção privada. Movimentos do mestre entre áreas privadas não entram no log.

## Banco (`supabase/migrations/20261015000000_depot.sql`)

- `my_character(game)` e `can_see_depot(game, owner)`: membro e (`owner` nulo, ou mestre, ou o próprio personagem).
- Políticas de select/insert/update por `can_see_depot`; delete só o mestre (esvaziar a lixeira).
- Triggers: o `owner_id` do item tem que ser o da seção; seção não muda de `owner_id`; seção com itens não vai para a lixeira.
- `replace_depot` (só o mestre) para importar um save.
- Testes em `supabase/tests/depot_rls.test.sql`.

## Estoque da Estufa e do Laboratório

Spec: `docs/superpowers/specs/2026-10-19-estoque-no-deposito-design.md`.

- **`StockRef`** (`src/model/schema.ts`): `{ source: 'material', materialId }` ou `{ source: 'depot', itemId }`. Cada ponta de cultivo (semente, colheita) e de receita (poção, ingredientes) é uma dessas; dá para misturar. Ajudantes em `src/systems/Stock.ts` (`refKey` = `m:<id>`/`d:<id>`, `sameRef`, `refName`, `refQuantity`, `refExists`).
- Só itens do **depósito do grupo** podem ser ligados ou movidos. Item privado, na lixeira ou apagado conta como ausente.
- **As regras veem o Depósito**: `applyCommand` recebe em `ctx.depot` um retrato só-leitura (`DepotItemView[]`: `id`, `name`, `quantity`, `live`, `updatedAt`) com **apenas os itens que o comando usa** (`depotItemsNeeded` em `src/commands/depotItemsNeeded.ts`). Com ele as regras conferem a existência (criar cultivo/receita com item ausente → `not_found`), a quantidade (jogador sem semente → `no_seed`, sem ingrediente → `missing_ingredients`) e gravam no log o **nome do item no momento**, como texto.
- **Movimentos**: as regras não mexem no Depósito; devolvem `stock: StockMove[]` (`{ itemId, delta, mode }`, um por item, via `sumMoves`). Gasto de jogador é `strict`, do mestre é `clamp` (gasta o que houver); entrada (colher, recolher, devolver no acerto) é delta positivo, até 99.999.
- **Entrada para item removido** não entrega nada e entra no log com `lost: true` e o último nome do item.
- **Offline** (`LocalRepository`): relê o Depósito local, roda as regras, aplica os movimentos com `applyStock` (tudo ou nada) e só então grava Depósito e jogo.
- **Online** (`handler.ts`): `load_depot_items(jogo, ids)` lê os itens do grupo, as regras rodam, e `commit_game_stock` grava jogo e movimentos numa transação só. Ela trava as linhas (`for update`, por id) e confere que cada linha lida continua igual (`updated_at` e lixeira); se mudou, responde `conflict` e o cliente tenta de novo, então o nome no log é sempre o que o banco tinha. Falta no último segundo → `stock_short` (vira `no_seed`/`missing_ingredients`); item sumido → `stock_missing`. Qualquer recusa desfaz tudo.
- **Na tela**: o `GameStore` mostra os movimentos no Depósito na hora (`DepotStore.preview`) e recarrega quando o comando assenta (salvo, recusado ou descartado).
- **Cartão do item**: selo 🔗 com o que usa o item (`itemLinks`), "×0 em falta", e remover um item ligado pede confirmação dizendo o que para de funcionar.
- Os movimentos automáticos não geram `depot_changed`: o log do jogo já conta a história.
- Migration: `supabase/migrations/20261019000000_depot_stock.sql`; testes em `supabase/tests/stock.test.sql`.

Ordem de deploy: **1)** `supabase db push` (quantidade 0, `load_depot_items`, `commit_game_stock`); **2)** `npm run deploy:functions` (save 11 e os movimentos); **3)** o site. Cultivos e receitas antigos continuam com materiais; o mestre religa nos formulários quando quiser.

## Limitação conhecida

O Realtime não avisa um jogador quando um item sai da vista dele (por exemplo, quando outro jogador retira algo do depósito do grupo para a própria área): o item some na próxima vez que a janela abre, porque ela recarrega tudo ao abrir.
