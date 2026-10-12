# Prompt — Quadro de Missões da Guilda

Projeto em `C:\Users\Perdido\.antigravity\clash`. O **Salão da Guilda** (`guild`) já existe com arte e efeitos. Quero um **quadro de missões** onde eu e os jogadores penduramos contratos. Cada missão pode ser feita pelo **grupo** ou por **NPCs** enviados pela Axis.

**Referência visual:** `docs/reference/quadro_missoes_referencia.png`. Veja a imagem antes de começar.

Leia o código (principalmente NPCs, carteiras/Coins, `applyCommand`, `TimeSystem` e o padrão de janela do Arquivo e do Cardápio). Registre o design em `docs/plans/MISSOES.md`, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte. No final, diga quais comandos de publicação a mudança exige. Ela muda regras, então deve precisar de `npm run deploy:functions`.

## Visual (como na referência)

- No painel da Guilda construída, o botão **"Abrir quadro de missões"** abre uma janela grande (`<dialog>`).
- **Fundo:** um quadro de **madeira escura** com moldura grossa e uma **gema azul** no topo, ao centro.
- **Cada missão é um pergaminho** pregado no quadro:
  - cores variadas (laranja, bege, roxo, amarelo-claro), com bordas rasgadas e as pontas enroladas;
  - levemente rotacionado; a rotação e a cor vêm do id, então são estáveis entre redraws e entre jogadores;
  - **título grande** em fonte medieval, e embaixo, em itálico: **Solicitante**, **Local**, **Descrição** (truncada) e **Recompensa**;
  - um **selo de cera** cuja cor indica a dificuldade: **verde** fácil, **amarelo** média, **vermelho** difícil.
- Faça tudo em CSS (gradientes, `clip-path`, sombras, textura em `src/data/assets.json`, se precisar). Nada de imagem por pergaminho. Os pergaminhos se espalham pelo quadro numa grade irregular e, no celular, viram uma coluna.
- **Abas:** Abertas · Em andamento · Concluídas, com a contagem de cada uma.
- **Clicar num pergaminho** coloca a missão **em primeiro plano**: o pergaminho cresce até o centro da tela, com o quadro escurecido atrás, e mostra o texto completo e as ações. Fecha com Esc, no X ou clicando fora.

## Missão

- Campos:
  - **título**;
  - **solicitante**;
  - **local**;
  - **descrição**, com o mesmo markdown do Arquivo;
  - **recompensa** em moedas, digitada com os campos de moeda que já existem;
  - **tempo esperado** em dias de jogo;
  - **dificuldade** (fácil, média ou difícil).
- Também registra quem criou, o dia de criação e o status.
- **Quem cria e edita:** **mestre e jogadores**, por um formulário "Nova missão" no próprio quadro, com os campos acima. Qualquer um edita ou remove uma missão **aberta**. Remover vai para o log.

## Ações no primeiro plano (missão aberta)

**1. "O grupo vai"**
- A missão passa para **Em andamento (grupo)**.
- Quando o grupo voltar, o **mestre** marca **Concluída** ou **Falhou**:
  - **Concluída:** o **Acampamento recebe 100%** da recompensa;
  - **Falhou:** ninguém recebe nada.
- A missão fica em Concluídas, com o resultado.

**2. "Enviar NPCs"**
- Escolha um ou mais NPCs. Mostre a habilidade, o status e onde trabalham hoje, e aceite só quem estiver `disponivel` ou `trabalhando`.
- Os NPCs ficam com status **`em_missao`**, que já existe. Pela regra atual, eles mantêm casa e posto, mas não trabalham nem recebem salário.
- A missão registra o **dia previsto de retorno**: dia atual + tempo esperado.
- Ao avançar os dias e chegar ao retorno, a missão passa para **"Aguardando o mestre"** e entra no log ("Os NPCs voltaram da missão X").
- O **mestre** decide:
  - **Sucesso:** a recompensa é dividida, **80% para os NPCs e 20% de comissão para o Acampamento**. No exemplo, 2 PO viram 1,6 PO para os NPCs e 0,4 PO para o Acampamento.
  - **Falha:** ninguém recebe, e o mestre pode marcar NPCs como `ferido` ali mesmo.
- Em qualquer resultado, os NPCs voltam ao status de antes (`disponivel` ou `trabalhando`), exceto os marcados como feridos.
- **Parte dos NPCs:** eles não têm carteira. Acrescente ao NPC um total **`earnings`** (ganhos acumulados em bronze), mostrado no card ("Ganhou 1,6 PO em missões"). Com vários NPCs, divida igualmente em bronze. O resto da divisão vai para o Acampamento, para não perder moeda.
- A comissão (20%) fica configurável num JSON de missões (`src/data/missions.json`).
- **Salão da Guilda nv. 2:** o efeito diz "contratos pagam 10% a mais em ouro". Aplique esse +10% sobre a recompensa nos dois modos (grupo e NPCs) enquanto o nível em vigor for ≥ 2, e mostre isso no primeiro plano.

Tudo é decidido pelo mestre, sem `Math.random`, então servidor e cliente chegam ao mesmo resultado.

## Regras e dados

- As missões ficam no `GameState` (`state.missions`), com uma migração de save para uma versão nova (`missions: []`). Elas mexem em moedas e no status dos NPCs, então precisam passar pelos comandos.
- Comandos novos no `applyCommand`:
  - `mission_create`, `mission_update`, `mission_remove`, `mission_take_party`, `mission_send_npcs`: **jogador e mestre**;
  - `mission_resolve` (sucesso ou falha, e quais NPCs ficam feridos): **só mestre**.
  
  Todos registram o `actor` no log.
- **Remover um NPC em missão:** ele sai da missão. Se a missão ficar sem ninguém, ela volta para Abertas, com registro no log.
- **Remover ou rebaixar a Guilda:** as missões e os NPCs em missão continuam. Só o botão some até reconstruir, como no Arquivo.
- **Limites:** título até 120 caracteres, descrição até 4.000, tempo de 1 a 365 dias, recompensa maior que 0.

## Testes

- Divisão 80/20 com 1 e com 3 NPCs, incluindo o resto em bronze.
- Bônus de +10% da Guilda nv. 2.
- Grupo: Acampamento recebe 100%.
- Falha não paga.
- Retorno dos NPCs no dia certo durante o `advanceDays`.
- Status dos NPCs restaurado depois da missão.
- Ferido aplicado na falha.
- NPC removido durante a missão.
- Permissões: jogador não resolve missão.
- Migração do save.
- Paridade com a Edge Function.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`, e atualize o README (seção Guilda).
