# Entreposto: comércio curado pelo mestre

Objetivo: a construção **Entreposto** (`trading_post`, `TRADING_POST_BUILDING_ID` em `src/systems/Shop.ts`) ganha uma loja ("Comércio") montada pelo mestre, onde os jogadores compram materiais e equipamentos.

## Onde guardar

- **`state.shop`** no `GameState` (`items`): a loja viaja com o save, como os materiais. Não há dado sensível, então não precisa de tabela própria.
- **Itens iniciais:** os 3 de `src/data/shop.json`, carregados por `src/data/gameData.ts`: Madeira (3 bronze), Ferro (1 prata) e Aetherium (5 pratas), todos com estoque infinito e nível mínimo 1.
- **Equipamento comprado** vai para o depósito (`depot_sections`/`depot_items`, fora do `GameState`); ver "Entrega atômica".

## Comandos (`src/commands/schema.ts`, regras em `src/systems/Shop.ts`)

| Comando                                                                 | Quem pode                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `shop_item_create`, `shop_item_update`, `shop_item_remove`              | só o mestre                                                     |
| `shop_set_promotion` (`null` encerra a promoção)                        | só o mestre                                                     |
| `shop_buy` (um item, com `payer` e `deliveryId`)                        | jogador (paga do acampamento ou do próprio personagem) e mestre |
| `shop_buy_materials` (até 20 linhas, só materiais, paga do acampamento) | jogador e mestre                                                |
| `shop_sell`                                                             | jogador e mestre                                                |

Em `shop_buy`, um jogador só paga do acampamento ou da própria carteira (`isAllowed` em `src/commands/applyCommand.ts`).

## Regras

- **Promoção:** `discountPercent` inteiro de 1 a 90. Preço unitário = `max(1, floor(base × (100 − d) / 100))` bronze, ou seja, nunca sai de graça (mínimo 1 bronze).
- **Venda de volta:** só com o Entreposto no nível 3 (`SELL_BACK_LEVEL`). Paga `floor(preço base × quantidade / 2)` bronze ao acampamento, calculado sobre o total e sobre o preço base (promoção nunca baixa). Só vale para material cujo item da loja está visível (não oculto e dentro do nível do Entreposto). Vender mais do que se tem responde `invalid_quantity`.
- **Compras do mestre** são de graça (o log registra bronze 0, sem carteira).
- **Cofre:** o jogador escolhe quem paga, o acampamento ou o próprio personagem, inclusive para equipamento que vai para a área privada. O atalho do painel da construção (comprar o que falta) sempre paga do acampamento.
- **Um item da loja por material** (`material_already_listed`).
- **Visibilidade:** jogadores veem o que não está oculto e cabe no nível do Entreposto; o mestre vê tudo. Estoque `null` é infinito.
- **Log:** a entrada `shop_purchased` nunca cita o nome de um item entregue a uma área privada (só quantidade, valor e carteira). O depósito do grupo (compra do mestre) pode citar.

## Entrega atômica do equipamento

Equipamento vai para a área do comprador no depósito (área privada do personagem; o mestre compra para o depósito do grupo, `ownerId` nulo), na seção **"Compras do Entreposto"**. `buyFromShop` devolve um `DepotDelivery` junto com o novo estado.

- **Online:** o handler chama a função SQL `commit_shop_purchase` (`supabase/migrations/20261017000000_shop.sql`), que salva o jogo (`commit_game_update`) e grava o item no depósito na mesma transação: um conflito de revisão nunca deixa item pago sem entrega, nem entregue sem pagar. Retorna `false` em conflito de revisão. Só o `service_role` executa.
- **Offline:** `DepotStore.deliver` (`src/depotStore.ts`) aplica `deliverToDepot` (`src/systems/Depot.ts`).
- **Seção:** a busca é a mesma nos dois lados (`shopSectionFor` / SQL), sempre dentro da área da entrega, porque os ids de seção são escolhidos pelo cliente:
  1. seção viva com o id `entreposto-<dono>` (`entreposto-grupo` para o grupo, cortado em 64 caracteres);
  2. senão, a primeira seção viva da área chamada "Compras do Entreposto";
  3. senão, restaura a do id acima se estiver na lixeira;
  4. senão, cria. Se o id já pertence a outra área, usa o id de fallback `entreposto-<id do item entregue>`.

A migration também inclui `shop_item` entre os tipos de foto aceitos pelo Storage (`can_access_game_image`).

## Ordem de deploy

1. `supabase db push` (aplica `20261017000000_shop.sql`);
2. `npm run deploy:functions`;
3. o site.

A função SQL precisa existir antes das funções, e as funções antes do site, para que nenhum cliente envie `shop_buy` a um servidor que não o conhece.
