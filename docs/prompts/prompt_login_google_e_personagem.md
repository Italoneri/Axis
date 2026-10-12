# Prompt — Entrar com Google e o jogador criar o próprio personagem

Projeto em `C:\Users\Perdido\.antigravity\clash`. **Rode depois do `prompt_fotos_no_jogo.md`**, porque este usa o seletor de foto criado lá.

Hoje o jogador entra por **link mágico no e-mail** (`signInWithOtp` em `src/online/onlineBoot.ts`), e só por um **convite ligado a um personagem que o mestre já criou** (`invites.character_id`, `accept_invite`). Quero que:

1. os jogadores entrem com a **conta Google (Gmail)**;
2. ao entrar pela primeira vez num jogo, eles **criem o próprio personagem**, com nome, cor e foto, ou **assumam um personagem que já existe** e ainda não tem dono, porque a mesa já tem 20+ sessões e os personagens já estão no save.

Leia `docs/plans/FASE3_SUPABASE.md`, a migração `20261010000000_games.sql`, o handler da Edge Function e o `onlineBoot`. Me mostre o plano em poucas linhas e **espere meu ok**. Registre o fluxo no plano da Fase 3 e faça um commit por parte. No final, liste **o que eu preciso configurar à mão** (Google Cloud e painel do Supabase) e os comandos de publicação.

## 1. Login com Google

- Tela de login com o botão **"Entrar com Google"** (`signInWithOAuth({ provider: 'google' })`), voltando para a mesma URL e preservando `?game=` e `?invite=`.
- O **link mágico continua** como alternativa ("Entrar com e-mail"). Ele só funciona com SMTP próprio configurado; diga isso na própria tela, num texto discreto.
- `supabase/config.toml`: habilite `[auth.external.google]` com `client_id` e `secret` vindos de variável de ambiente (`env(...)`), nunca escritos no arquivo. Atualize o `.env.example` com os nomes, sem valores.
- Monte no README um **passo a passo para mim**:
  - criar o OAuth Client no Google Cloud Console;
  - a URL de callback do Supabase que vai em "Authorized redirect URIs";
  - onde colar Client ID e Secret no painel do Supabase (*Authentication → Providers → Google*);
  - as URLs do site em *Authentication → URL Configuration*.

## 2. Link de entrada do jogo

- Além do convite por personagem, que continua existindo, o mestre gera um **link de entrada do jogo**: reutilizável, com validade opcional e revogável, no mesmo painel de convites. É o link que mando no grupo do Discord.
- Ao abrir o link, logado e ainda sem ser membro desse jogo, o jogador vê a tela **"Entrar na Axis"** com duas opções:
  - **"Sou um personagem que já existe"**: lista os personagens **sem jogador ligado**, com foto e nome. Ao escolher, o jogador fica ligado a ele. É uma mesa de amigos, então não precisa de aprovação; o mestre vê no log e pode desfazer pelo painel de convites ou jogadores.
  - **"Criar meu personagem"**: formulário com **nome**, **cor** e **foto** (seletor de imagem do prompt de fotos), com a foto do Google como sugestão inicial. Cria o personagem com carteira vazia e liga o jogador a ele.
- Tudo passa pela Edge Function (nova ação, ex.: `join_game`), validada no servidor:
  - nome não vazio e sem repetir;
  - um usuário tem no máximo um personagem por jogo;
  - um personagem tem no máximo um jogador.
  
  O personagem nasce por um comando no `applyCommand` (ex.: `character_join`), permitido só nesse fluxo e registrado no log ("Thorin entrou na Axis").
- **Painel do mestre:** lista de **jogadores** (e-mail ou nome do Google → personagem), com a opção de **desligar** um jogador do personagem. O personagem e a carteira ficam; só o vínculo sai.

## 3. Banco

- Migração nova para:
  - os links de entrada (tabela própria ou coluna em `invites`);
  - as funções `join_game` / `claim_character`, com as mesmas garantias de `accept_invite`.
- Testes pgTAP:
  - link revogado ou expirado é recusado;
  - assumir personagem já ligado é recusado;
  - segundo personagem do mesmo usuário é recusado;
  - não membro não lê nada.

## Testes

- Fluxo do `onlineBoot` com cliente fake: login Google com `?game=`, primeira entrada, membro que volta, link inválido.
- Handler `join_game`, nos dois caminhos e nas recusas.
- `character_join` no `applyCommand`.
- Paridade.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity` (e `npx supabase test db`, se o Docker estiver de pé).
