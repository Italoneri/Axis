# Depósito: seções, itens e áreas privadas no Arsenal

Objetivo: uma janela no estilo do **Arquivo de registros** para guardar os itens do grupo (equipamentos, poções ou qualquer outro), organizados em **seções**, e uma **área privada** para cada personagem, que só o dono e o mestre veem.

## Onde abrir

Não existia um prédio "Depósito" no `buildings.json`; o mais próximo é o **Arsenal** (`armory`, anel externo), então a janela abre pelo painel do Arsenal construído (`DEPOT_BUILDING_ID` em `src/systems/Depot.ts`). Trocar o prédio é mudar essa constante. O mestre também abre pelas ferramentas do mestre, mesmo sem o Arsenal.

## Onde guardar: fora do `GameState`, como o Arquivo

Pelo mesmo motivo do Arquivo: a área privada de um personagem não pode chegar ao navegador dos outros jogadores, e o `GameState` vai inteiro para todos. Tabelas com RLS resolvem isso no banco.

| Modo    | Onde                                                      | Quem decide                                                       |
| ------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Online  | `depot_sections`, `depot_items` (Supabase, RLS, realtime) | as regras puras rodam no cliente; RLS e triggers são a autoridade |
| Offline | `localStorage['axis-base-builder:depot']`                 | as mesmas regras puras                                            |

Offline, a área privada fica só escondida pela janela: é o mesmo navegador para todos.

## Dados (`src/systems/Depot.ts`, zod)

- **Seção:** `id`, `name` (1–120), `icon?`, `ownerId` (`null` = depósito do grupo; id do personagem = área privada dele), `order`, `authorId`, `deletedAt`. O nome não se repete dentro da mesma área. Uma seção nunca muda de área.
- **Item:** `id`, `sectionId`, `name` (1–120), `kind` (`equipamento` | `pocao` | `outro`), `quantity` (1–99.999), `notes` (até 2.000), `order`, `authorId`, `editedBy?`, `createdAt`, `updatedAt`, `deletedAt`. A área do item é a da sua seção; online, a linha guarda uma cópia (`owner_id`) para a RLS.

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

## Limitação conhecida

O Realtime não avisa um jogador quando um item sai da vista dele (por exemplo, quando outro jogador retira algo do depósito do grupo para a própria área): o item some na próxima vez que a janela abre, porque ela recarrega tudo ao abrir.
