# Prompt — Gerador LPC local: criar o sprite de cada NPC por script

Projeto em `C:\Users\Perdido\.antigravity\clash`. O protótipo dos NPCs andando ficou bom (sprites LPC, `npm run import:npcs`, `src/map/npcSprites.ts`, `src/scenes/WalkingNpcs.ts`). Hoje, para cada personagem eu monto no site do **Universal LPC Spritesheet Generator**, baixo o "ZIP: Split by animation" e extraio em `art-sources/npcs/<nome>/`. Quero **automatizar** isso: clonar o repositório do gerador e criar sprites por script, a partir de uma **receita** (o mesmo JSON que o site exporta) ou de uma **descrição em texto** que você transforma em receita.

Leia `scripts/import-npc-sprites.ts`, `src/map/npcSprites.ts` e o exemplo `art-sources/npcs/aventureira/`, que tem a receita `character.json` e o resultado exportado pelo site (`walk.png`, `idle.png`, `run.png`, `credits.csv`). Investigue o repositório, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte. Isto é **só ferramenta de desenvolvimento e arte**: não muda o jogo, o save nem o servidor.

## 1. Clonar sem pesar no projeto

- Repositório: `https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator`.
- Ele é **grande** (milhares de PNGs). Clone **fora do git do jogo**, em `vendor/lpc-generator/` com `vendor/` no `.gitignore`, ou numa pasta irmã (`..\lpc-generator`). Use `--depth 1`. Se der para baixar só o necessário (`--filter=blob:none` com sparse-checkout das pastas de definições e das spritesheets usadas), melhor. Me diga o tamanho final.
- Um script `npm run lpc:setup` que clona (ou atualiza) e confere se está tudo lá, para eu refazer em outra máquina.
- **Nada do repositório entra no git do jogo.** Só os sprites gerados, como já é hoje.

## 2. Gerar o sprite a partir da receita

- **Receita** = o `character.json` que o site exporta (`bodyType` + `selections` com `itemId`, `variant`, `recolor`) e que o "Export to Clipboard (JSON)" também gera. As receitas ficam em `art-sources/npcs/<nome>/character.json`, uma por personagem.
- Comando: `npm run lpc:build -- <nome>` (ou `-- --all`), que lê a receita e gera em `art-sources/npcs/<nome>/` **exatamente o mesmo formato** que o site exporta: `walk.png`, `idle.png` e as animações extras (abaixo), mais `credits.csv`, `credits.txt` e `metadata.json`. Depois roda o `import:npcs`, que já existe e não deve precisar mudar.
- **Como compor:** o gerador aplica **recolor por paleta** e ordem de camadas (`zPos`) definidas nas `sheet_definitions` dele. Escolha um destes caminhos e justifique:
  - **(a) reaproveitar a lógica do próprio gerador**, importando os módulos de composição dele em Node ou rodando a página dele localmente sem interface (Playwright/Chromium headless): carrega a receita pela função de import do site e captura a exportação;
  - **(b) reimplementar** a composição lendo `sheet_definitions` + paletas.
  
  O critério é fidelidade: prefira (a) se for viável.
- **Teste de aceitação obrigatório:** gerar a `aventureira` a partir do `character.json` dela tem que dar **`walk.png` e `idle.png` idênticos pixel a pixel** aos que o site exportou (a cópia do site fica guardada como referência de teste, por exemplo em `art-sources/npcs/aventureira/_site/`). Se não bater, me mostre a diferença antes de seguir.
- **Créditos:** o `credits.csv` sai das próprias definições do gerador, no mesmo formato do site, para o `import:npcs` levar à tela de Créditos. Teste que nenhuma camada usada fica sem autor e licença.
- **Animações extras para o futuro**, já geradas, mesmo que o jogo ainda não use: `sit`, `hurt` (o último quadro serve para "dormindo"), `slash`, `thrust`, `spellcast`, `watering`, `emote` e `run`. Elas ficam em `art-sources/npcs/<nome>/` e **não** entram no `public/` até o jogo usar.

## 3. Descrição em texto → receita

- Um catálogo consultável das peças: `npm run lpc:items -- <busca>` lista itens, variantes e cores disponíveis para o `bodyType` (ex.: `lpc:items -- hair`, `lpc:items -- apron`), lendo as definições do repositório.
- Fluxo que eu vou te pedir no dia a dia: *"crie a sprite da Bianca: maga, cabelo ruivo longo, túnica roxa, sem escudo, com cajado"*. Você monta o `character.json` só com peças que **existem** no catálogo (confira cada `itemId`, `variant` e `recolor`), gera, roda o `import:npcs` e me mostra uma prévia: um PNG com as 4 direções do walk lado a lado, em tamanho 2×, salvo em `art-sources/npcs/<nome>/preview.png`.
- **Ligar ao NPC:** registre em `src/data/npc_sprites.json` (`{ "<npcId>": "<nome>" }`). Se eu só disser o nome do NPC, procure o id dele no save exportado que eu indicar, ou me pergunte.
- **Padrão "sem arma":** para NPCs civis, a receita não leva escudo nem armas, a não ser que eu peça. A aventureira atual tem escudo; gere também uma `aventureira_civil` sem escudo para comparar.

## 4. Documentação

Atualize o README (seção "Sprites dos NPCs") com: setup, como criar por receita, como pedir por descrição, como ligar ao NPC e a obrigação de crédito (licenças CC-BY-SA / GPL / OGA-BY).

## Testes

- Pixel a pixel da aventureira (aceitação).
- Créditos completos.
- Receita inválida (item ou cor inexistente) falha com mensagem clara, dizendo qual peça e quais opções existem.
- `--all` regenera tudo sem mudar o que não mudou.

## Publicação

Só quando sprites novos forem gerados e importados: basta o novo build do site. Não precisa de `deploy:functions` nem de `db push`.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`.
