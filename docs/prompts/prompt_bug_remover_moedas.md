# Prompt — Bug: "Remover" moedas não remove (ajuste do mestre)

Projeto em `C:\Users\Perdido\.antigravity\clash`. **O jogo já está online com os jogadores.** Investigue primeiro, me mostre a causa confirmada e o plano, e **espere meu ok** antes de mudar código. Faça um commit só para a correção (e outro para testes, se ficar grande). No final, diga exatamente o que publicar e em que ordem.

## Sintoma

No painel de Ouro, como mestre, abri **Ajustar** numa carteira, digitei **5 Ouro + 50 Prata** (o "Valor do ajuste" mostrava 10 PO) e cliquei em **Remover**. **Nada aconteceu**: sem erro e sem mudança no saldo. Só funcionou quando digitei **500 Bronze**.

## Causa provável (confirme lendo o código e com um teste)

- `GoldPanel.adjustForm` envia `adjust_coins` com o delta **por moeda** (`{ gold: -5, silver: -50 }`).
- `adjustCoins` (`src/systems/Wallets.ts`) usa `applyResourceDelta` (`src/systems/ResourceSystem.ts`), que **limita cada moeda ao que a carteira tem daquela moeda** (`Math.max(amount, -(available[id] ?? 0))`).
- Se a carteira não tem prata nem ouro soltos (por exemplo, tudo consolidado em esmeralda e platina), o delta aplicado vira vazio, e `adjustCoins` devolve `ok(state)` **sem fazer nada e sem avisar**.
- Pior: se a carteira tem **algumas** das moedas, a remoção é **parcial e silenciosa**. Removeria só o que existe daquela denominação, e o mestre acharia que removeu 10 PO.
- O botão **Dar** não tem esse problema.

## Correção esperada

- **Remover** passa a cobrar o **valor total** digitado, em bronze, **com troco**, usando o mesmo `pay` (`src/systems/Coins.ts`) que paga as construções. Com saldo total suficiente, remove o valor exato quebrando moedas maiores. Com saldo insuficiente, **recusa** com `insufficient_coins` e mostra a mensagem na tela ("O Acampamento tem só X PO").
- Separe as duas operações no comando para ficar explícito: por exemplo, `adjust_coins` com `mode: 'give' | 'take'`, ou um comando `take_coins` com o valor. Mantenha compatibilidade com o formato atual, se ele ainda puder chegar de um cliente antigo aberto: delta só negativo = take pelo valor total, e misto = recusa como `invalid_command`.
- O log `coins_adjusted` registra o que **de fato** saiu da carteira: as moedas gastas e o troco devolvido, ou pelo menos o valor em PO. Assim o histórico não mente.
- Ajuste também qualquer outro lugar que use `applyResourceDelta` para **retirar** valor de carteira, se houver. **Materiais** continuam com a regra por item (é o certo para eles), mas um ajuste que não muda nada ou que é limitado deve **avisar**, e não ficar em silêncio.

## Verificar dados já afetados

Como o jogo está online, verifique se já houve remoções parciais:
- Procure no histórico (`game_log` online e `state.log`) entradas `coins_adjusted` com valores negativos e compare com o que provavelmente se pretendia.
- Me passe uma consulta SQL de leitura que eu possa rodar no SQL Editor do Supabase para listar essas entradas. **Não altere dados de produção.** Se algo precisar de correção, eu faço pelo ajuste do mestre.

## Testes

- Remover 5 Ouro + 50 Prata de uma carteira só com esmeralda e platina: remove 10 PO com troco certo.
- Remover mais do que o saldo total: recusa com `insufficient_coins` e o estado não muda.
- Remover com moedas exatas disponíveis: não gera troco desnecessário.
- Dar continua igual.
- Formato antigo do comando (compatibilidade).
- Log com o valor real.
- Paridade com a Edge Function (`npm run parity`).

## Publicação (o jogo está no ar)

A regra muda no servidor, então precisa de `npm run deploy:functions` **e** do novo build do site. Me diga a ordem segura para publicar sem quebrar quem estiver com a página aberta (esperado: a função primeiro, compatível com os dois formatos; depois o site) e se é melhor fazer fora do horário da sessão. Não precisa de `db push`.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
