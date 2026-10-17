# Entreposto: aba de Comércio

Data: 2026-10-16. Decidido em conversa com o Ítalo (mestre). O que está marcado como **(escolha do Claude)** foi decidido por mim e pode ser revisto.

## Por que existe

As construções exigem madeira, ferro e aetherium. Hoje, para completar o que falta, a party precisa coletar ou fazer uma missão na Guilda. A aba de Comércio do Entreposto (`trading_post`) atende dois usos que o Ítalo descreveu:

1. **Completar material de uma obra**, como as 12 madeiras que faltam, sem precisar de missão.
2. **Passar pela loja para ver se apareceu algo raro**, como uma arma, uma poção ou um minério difícil de achar.

Quem decide o que vai à venda é o mestre. Os jogadores só compram.

## Objetivos

- Uma vitrine em cartões dentro do Entreposto construído, alimentada pelo mestre.
- O mestre cria cada item à venda dentro do jogo, com foto, nome e preço.
- A compra paga com moedas que já existem e entrega na hora: material vai para o estoque e equipamento vai para o Depósito.
- Um atalho no painel da construção para comprar só o que falta, mostrando o gasto e pedindo confirmação.

## Fora do escopo

- Leilão, negociação de preço ou troca entre jogadores.
- Estoque que se repõe sozinho com o tempo. A reposição é sempre manual, feita pelo mestre.
- Preço dinâmico por oferta e procura.
- Vender equipamento de volta. A venda de volta vale só para materiais (ver "Venda de volta").

## Não pode acontecer

- **Cobrar sem entregar, ou entregar sem cobrar.** Isso vale principalmente para o equipamento, que fica em outro armazenamento (veja "Restrições").
- **Comprar sem confirmar.** Toda compra mostra o total antes e precisa de confirmação.
- **Item vinculado ao material errado.** O mestre não digita o ID do material: escolhe numa lista.
- **Um jogador ver ou comprar item que o nível do Entreposto ainda não libera.**

## Como funciona para o jogador

### A tela (modelo A, escolhido pelo Ítalo: vitrine em cartões)

- Aba **Comércio** na janela do Entreposto, que só existe com a construção feita.
- Filtros: **Tudo**, **Básicos** e **Raros**. "Básicos" são os itens com estoque infinito. "Raros" são os demais. **(escolha do Claude: a regra do filtro)**
- No topo fica a faixa de **mercador de passagem**, com os itens que o mestre marcou como destaque. Se nenhum estiver marcado, a faixa não aparece.
- Cada cartão mostra foto ou ícone, nome, preço, estoque ("∞" ou o número) e o botão **Comprar**. Com estoque 0, o cartão fica apagado e com a marca **Esgotado**.
- O preço aparece nas moedas maiores, como no cardápio da Taverna. Por exemplo, `{ bronze: 12 }` aparece como "1 Prata e 2 Bronze". O formatador já existe em `src/ui/format.ts`.

### Comprar

1. Ao clicar em Comprar, abre uma confirmação com a quantidade, que começa em 1 e vai até o estoque disponível (sem limite no infinito).
2. O jogador escolhe quem paga: **Cofre do Acampamento** ou **minha carteira**. As carteiras já existem em `src/systems/Wallets.ts`. O cofre também pode pagar equipamento que vai para a área privada de quem comprou. **(decisão do Ítalo: ele confia na mesa)** Isso abre uma exceção na regra atual, em que só o mestre tira moedas do cofre; o servidor precisa permitir essa saída só no comando de compra.
   - **Mestre comprando (como um NPC): a compra é de graça.** Não cobra moeda nenhuma, o estoque limitado diminui e o equipamento vai para o depósito do grupo. Nesse caso, a confirmação não mostra a escolha de quem paga. **(decisão do Ítalo)**
3. A confirmação mostra o total ("12 Madeira por 3 Prata e 6 Bronze") e os botões Confirmar e Cancelar.
4. Ao confirmar:
   - **Material:** a quantidade entra no estoque de materiais do Acampamento, mesmo quando quem pagou foi a carteira pessoal.
   - **Equipamento:** o item entra no **Depósito, na área privada do personagem que comprou**. Quando o comprador é o **mestre** (comprando como um NPC), entra no **depósito do grupo**.
   - O estoque limitado diminui.
   - A compra aparece no histórico (log) do Acampamento. Quando o equipamento vai para uma área privada, o log mostra só quem comprou e quanto pagou, sem dizer o item. Assim, a área privada continua sem aparecer no log, como no Depósito. **(escolha do Claude)**
5. Se faltar dinheiro, ou se o estoque acabar enquanto a confirmação estava aberta, a compra é recusada com a mensagem certa e nada muda.

### Destino no Depósito

O item comprado vai para uma seção chamada **"Compras do Entreposto"** dentro da área de destino. Se ela não existir, é criada na hora. O item recebe nome, tipo (equipamento, poção ou outro), a quantidade comprada e, nas notas, a descrição do item da loja. **(escolha do Claude: o nome da seção e a criação automática)** O Depósito não guarda imagem por item, então a foto da loja não vai junto. **(escolha do Claude)**

### Atalho na construção (comprar o que falta)

- Quando falta material para construir ou melhorar, o painel da construção mostra o botão **"Comprar o que falta no Entreposto — {total}"**.
- Só conta o que pode ser comprado: material que tem item na loja, liberado pelo nível do Entreposto e com estoque suficiente. Se algum material faltante não estiver à venda, o painel avisa quais ficaram de fora. **(escolha do Claude)**
- O clique abre a mesma confirmação, com a lista ("12 Madeira, 2 Aetherium") e o total.
- **Quem paga:** o cofre do Acampamento, porque as construções já são pagas por ele. **(escolha do Claude)**
- Só aparece com o Entreposto construído.
- Comprar não inicia a obra. Depois da compra, o botão de construir fica liberado e o jogador constrói como sempre. **(escolha do Claude)**

### Venda de volta (Entreposto no nível 3)

- No nível 3, o jogador pode vender material do estoque do Acampamento de volta, pela **metade do preço** do item da loja vinculado a ele. A metade é calculada sobre o **total** vendido e arredondada para baixo em bronze. Por exemplo, 10 madeiras a 3 Bronze rendem 15 Bronze. **(escolha do Claude)**
- Só pode vender material que tenha item na loja **visível**, ou seja, não oculto e liberado pelo nível. Ocultar o item também desliga a venda daquele material. **(escolha do Claude)** O dinheiro vai para o cofre do Acampamento. Antes de vender, também aparece uma confirmação.
- Vender não aumenta o estoque limitado da loja. **(escolha do Claude)**

## Como funciona para o mestre

### Criar e editar item da loja

Ferramenta do mestre, aberta pelo Entreposto ou pelas ferramentas do mestre, como acontece com o Depósito. Ao criar um item, o mestre escolhe um de dois tipos:

**Material**
- Escolhe numa **lista de materiais existentes**. Por dentro, o vínculo é pelo id oculto do material (ex.: `wood`). O mestre cria o material antes, em Materiais, como já faz hoje.
- O nome e o ícone vêm do material. A foto pode ser trocada.
- **Um item da loja por material.** A lista não oferece um material que já tenha item. Para dar desconto, o mestre usa a promoção do item que já existe. **(escolha do Claude)**

**Equipamento**
- Nome, descrição, foto (upload), tipo do Depósito (`equipamento`, `pocao` ou `outro`).

**Campos que os dois tipos têm**
- **Preço**, em moedas.
- **Estoque:** infinito ou uma quantidade.
- **Nível mínimo do Entreposto** (1, 2 ou 3).
- **Destaque de mercador de passagem** (sim ou não).
- **Promoção** (decisão do Ítalo; a forma é escolha do Claude):
  - O mestre clica num item da vitrine e escolhe um **desconto em porcentagem**: atalhos de 10%, 25% e 50%, ou um valor de 1 a 90%.
  - O preço base fica guardado. Tirar a promoção volta o item ao preço normal.
  - No cartão aparece uma **faixa de promoção** no canto com o desconto (ex.: "−25%"), o preço antigo riscado e o preço novo em destaque.
  - O preço com desconto é arredondado para baixo em bronze e nunca fica abaixo de 1 Bronze.
  - Cobrança, confirmação e atalho da construção usam o preço com desconto.
  - A venda de volta usa o menor entre o preço base e o promocional, para que a promoção não seja usada para lucrar.
  - A promoção não acaba sozinha: o mestre tira quando quiser.

O mestre também pode editar, repor estoque, ocultar ou remover um item.

### O que o mestre vê

- Todos os itens, inclusive os acima do nível atual, com a marca "libera no Nv X".
- A vitrine como o jogador vê.

### Itens iniciais

| Item | Tipo | Material | Preço | Estoque | Nível |
|---|---|---|---|---|---|
| Madeira | material | `wood` | 3 Bronze | infinito | 1 |
| Ferro | material | `iron` | 1 Prata | infinito | 1 |
| Aetherium | material | `aetherium` | 5 Prata | infinito | 1 |

Outros preços que o Ítalo aprovou, para quando ele criar os itens variáveis: Mithril 5 Ouro, Adamantina 50 Ouro. O Minério de Ouro é bem raro e só aparece no nível 3. O nome evita confusão com a moeda, e o mestre define o preço. Esses itens o mestre cria; eles não vêm prontos.

## Restrições

- **Onde as coisas ficam hoje:**
  - Moedas, materiais e construções ficam no `GameState`. Online, as regras são aplicadas pela Edge Function `game`, com revisão, conforme `docs/plans/FASE3_SUPABASE.md`.
  - O Depósito fica **fora** do `GameState`, nas tabelas `depot_sections` e `depot_items` com RLS (`docs/plans/DEPOSITO.md`). Online, as regras rodam no cliente e a RLS é quem tem a autoridade.
- **Equipamento tem que ser atômico.** A cobrança, a baixa de estoque e a criação do item no Depósito acontecem tudo ou nada. Online, isso pede o servidor fazendo as duas gravações numa única transação, sem que o cliente faça a segunda depois. Offline, as duas lojas locais são atualizadas juntas.
- **Os itens da loja são públicos para todos os membros.** Por isso podem ficar no `GameState`. Itens acima do nível só ficam escondidos na interface, e o servidor recusa a compra.
- **Fotos:** usar o sistema de imagens existente (`src/systems/GameImages.ts`, `set_image`, upload no Storage) com um novo tipo de alvo para item da loja.
- **Saves antigos** (`migrateSave`) ganham a loja com os 3 itens iniciais.
- **Deploy:**
  - O servidor aplica as regras da loja a partir do bundle, então `npm run deploy:functions` vai antes do site.
  - Se houver migração (tabela ou função SQL para a compra atômica), `supabase db push` vai antes de tudo.
  - O Ítalo publica em lote e faz todos os pushes ele mesmo.
- O preço é um conjunto de moedas (`CoinBag`) e o pagamento usa `pay`/`takeCoins`, que já existem e dão o troco.
- Textos em pt-BR, em `src/i18n/pt-BR.ts`.

## Fica para quem for construir

- O formato dos dados da loja no `GameState` e os nomes dos comandos.
- Como garantir a compra atômica de equipamento online: uma rota nova na função, uma função SQL ou outra saída. Só precisa respeitar a atomicidade e a RLS do Depósito.
- O que fazer com um item da loja cujo material foi removido. Sugestão: ele some da vitrine e aparece para o mestre como "material removido".
- O layout exato da janela do mestre, seguindo o estilo do Depósito e do Arquivo.
- A forma do registro no log.
