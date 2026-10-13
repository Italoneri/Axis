# Prompt — Escolher no jogo a sprite (aparência no mapa) de cada NPC

Projeto em `C:\Users\Perdido\.antigravity\clash`. **O jogo já está online com os jogadores.** Hoje a sprite de cada NPC andando no mapa vem do `src/data/npc_sprites.json` (vazio) ou de um sorteio pelo hash do id (`spriteFor` em `src/map/npcSprites.ts`). Para trocar, eu teria que mexer em arquivo e publicar. Quero **escolher a sprite dentro do jogo**, no formulário do NPC, entre as sprites que já estão no projeto (`npm run lpc:build` + `import:npcs` → chaves `npc.<nome>.walk/idle` no `assets.json`; hoje `aventureira` e `aventureira_civil`).

Leia `src/map/npcSprites.ts`, `src/scenes/WalkingNpcs.ts`, `src/ui/resources/NpcPanel.ts`, o schema do NPC e os comandos `npc_create`/`npc_update`. Me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte. No final, diga o que publicar e em que ordem.

## Como funciona

- No formulário **Novo NPC** e **Editar** (mestre), um campo **"Aparência no mapa"** com:
  - um seletor visual: uma grade de cartões, um por sprite disponível, com a **prévia animada** (o walk virado para a frente, linha sul, em loop) e o nome legível ("Aventureira", "Aventureira (civil)");
  - a opção **"Automática"**: o sorteio estável de hoje; é o padrão e o valor dos NPCs atuais;
  - a opção **"Não aparece no mapa"**: o NPC não anda pela Axis, para quem não deve ser visto.
- No **card do NPC** (painel), ao lado do retrato, uma miniatura da sprite escolhida, parada e virada para a frente. Isso **não** revela atributos.
- As sprites disponíveis são lidas do `assets.json` (`spriteNames`). Uma sprite nova gerada e publicada aparece no seletor **sem mudar código**.
- **Prioridade** para decidir a sprite: escolha salva no NPC → `npc_sprites.json` (continua valendo como padrão por arquivo) → sorteio estável.
- **Sprite removida do projeto:** se um NPC aponta para uma sprite que não existe mais, ele cai no sorteio, sem quebrar o carregamento. Mostre "sprite indisponível" no Editar.

## Dados

- Campo opcional no NPC: `sprite?: string` (nome da sprite, ex.: `"aventureira"`) ou `"none"` para "não aparece". Ausente = automática. **Sem migração**: saves antigos continuam válidos.
- `npc_create` e `npc_update` aceitam `sprite`. Valide o formato no schema (`^[\w-]+$` ou `none`). **Não** valide contra a lista de assets no servidor: a Edge Function não conhece o `public/`, e uma sprite inexistente já cai no sorteio.
- Só o mestre edita NPCs, como hoje.

## Mapa

- `WalkingNpcs` reage à troca **na hora**: ao salvar, o NPC troca de aparência sem recarregar a página e sem pular de posição.
- `"none"`: o NPC some do mapa (fade), como um NPC em missão.
- Carregue no `PreloadScene` todas as sprites registradas, ou carregue sob demanda ao escolher; escolha e justifique (hoje são poucas e leves).

## Testes

- Prioridade (escolha > arquivo > sorteio).
- `"none"` não gera walker.
- Sprite inexistente cai no sorteio.
- Comandos com e sem `sprite`; recusa de formato inválido.
- Saves antigos carregam.
- Paridade com a Edge Function.

## Publicação (o jogo está no ar)

Muda o schema do NPC no servidor, então precisa de `npm run deploy:functions` e do novo build do site, **com as sprites dentro do `public/`**. Não precisa de `db push`. Diga a ordem segura (a função primeiro, aceitando NPCs com e sem `sprite`).

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
