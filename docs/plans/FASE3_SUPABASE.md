# Fase 3 — Supabase

Objetivo: o mesmo jogo, agora compartilhado entre o mestre e os jogadores, com as regras validadas no servidor. Sem as variáveis do Supabase, o jogo continua 100% offline (`LocalRepository`), como hoje.

Base pronta (preparação concluída): comandos serializáveis (`GameCommand`), `applyCommand` puro com permissões, `revision` no estado, `GameRepository` plugável, `actor` em todo log, ids aleatórios.

## Arquitetura

```
Navegador ── dispatch(command) ──► GameStore ──► GameRepository
                                                  ├─ LocalRepository (offline: aplica e grava no localStorage)
                                                  └─ SupabaseRepository (online)
                                                        ├─ load: SELECT games.state (RLS: só membros)
                                                        ├─ submit: Edge Function `game` { command, expectedRevision }
                                                        └─ subscribe: Realtime em `games`
Edge Function `game` (Deno)
  JWT ─► user_id ─► players (role, character_id) ─► ctx
  applyCommand(state, catalog, command, ctx)      ◄── mesmo código do jogo (bundle)
  RPC commit_game_update: UPDATE … WHERE revision = expected + INSERT game_log (uma transação)
  conflito ─► 409
```

### Decisões

- **O repositório recebe comandos, não estados.** Hoje `save(state, expectedRevision)` grava o estado inteiro; online isso deixaria o cliente decidir o resultado. Passa a ser `submit(change, expectedRevision)`: o `LocalRepository` aplica o comando localmente, o `SupabaseRepository` envia o comando e o servidor aplica. A loja continua otimista e reaplica os pendentes após conflito.
- **O `ctx` online vem só do JWT.** O cliente ainda monta um `ctx` para a interface otimista, mas o servidor ignora e usa `players.role` / `players.character_id`.
- **Escrita só pela Edge Function.** Nenhuma policy de INSERT/UPDATE/DELETE para clientes; a função usa a service role. A atualização do jogo e o registro em `game_log` acontecem numa função SQL (`commit_game_update`) executável só pela service role, para serem atômicos.

## Tabelas

| Tabela     | Colunas principais                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `games`    | `id uuid`, `name`, `state jsonb`, `revision int`, `created_by`, `created_at`, `updated_at`                          |
| `players`  | `game_id`, `user_id`, `role` (`master` \| `player`), `character_id` (nulo para o mestre); PK `(game_id, user_id)`   |
| `game_log` | `id bigserial`, `game_id`, `revision`, `user_id`, `actor` (nome exibido), `command jsonb`, `entries jsonb`, `created_at` |
| `invites`  | `id uuid`, `game_id`, `character_id`, `token_hash` (sha256; o token puro nunca é gravado), `expires_at`, `used_by`, `used_at`, `revoked_at`, `created_by` |

### RLS

- `games`, `game_log`: SELECT só para membros (`is_member(game_id)`, função `security definer` para não recursar em `players`).
- `players`: SELECT das linhas dos jogos de que o usuário participa (o mestre vê quem está ligado a cada personagem).
- `invites`: SELECT só para o mestre do jogo.
- Nenhuma policy de escrita: só a service role (Edge Function) grava.
- `games` entra na publicação `supabase_realtime`; o Realtime respeita a RLS.
- Verificação: testes pgTAP em `supabase/tests/` (`npx supabase test db`), cobrindo leitura de membro, bloqueio de não membro e bloqueio de escrita direta.

## Edge Function `game`

Rotas por `action` no corpo (POST):

| action          | Quem    | O que faz                                                                                 |
| --------------- | ------- | ----------------------------------------------------------------------------------------- |
| `command`       | membros | `{ gameId, command, expectedRevision }` → aplica, grava, 200 com `{ state }`; 409 em conflito; 403/422 em recusa |
| `create_game`   | logado  | cria o jogo a partir do seed ou de um save importado; quem cria vira `master`             |
| `restore_save`  | mestre  | substitui o estado por um save importado (backup), registrando no `game_log`              |
| `create_invite` | mestre  | gera token de uso único (validade padrão: 7 dias) para um personagem; devolve o link       |
| `accept_invite` | logado  | consome o token e cria/atualiza a linha em `players` (role `player`, `character_id`)       |
| `revoke_invite` | mestre  | revoga um convite ainda não usado                                                          |

- JWT ausente ou inválido → 401. Não membro → 403. Comando malformado → 422. Conflito → 409 com a revisão atual.
- O núcleo (`src/server/handler.ts`) é TypeScript comum, sem Deno: recebe as dependências (`auth`, `db`, `random`, `now`) por injeção. É testado no Vitest com fakes. O `index.ts` da função (Deno) só liga essas dependências ao `supabase-js`.

### Pontos extras

1. **Catálogo na Edge Function.** Os JSONs de `src/data` entram no bundle da função (`src/server/catalog.ts` importa os mesmos arquivos que o jogo, sem a arte). `npm run build:functions` gera `supabase/functions/_shared/game.js` com esbuild; `npm run deploy:functions` sempre gera antes de publicar, então o deploy nunca usa um catálogo diferente do commit atual. O arquivo gerado fica fora do git.
2. **Código compartilhado em Deno.** Em vez de reescrever imports (extensões `.ts`, `npm:zod`), o esbuild empacota `applyCommand`, os sistemas, o zod e o catálogo num único ESM sem dependências. O `scripts/parity.ts` executa um comando de exemplo nesse bundle em Node e em Deno (`deno` como devDependency) e compara as saídas; o Vitest roda o mesmo teste no lado Node.
3. **Convite de jogadores.** O mestre gera um link por personagem (`?invite=<token>`), de uso único e com validade. O jogador entra com e-mail (magic link), abre o link e fica ligado ao personagem em `players`. O mestre vê e revoga convites pendentes.
4. **Criação do jogo e backup.** "Criar jogo" usa o seed ou o save exportado (JSON), validado pelo mesmo `parseSave`. O export continua disponível para o mestre como backup; o import online vira `restore_save` (só mestre).
5. **`game_log`.** Histórico completo, paginado na gaveta (online). O `state.log` (200 entradas) continua para os toasts e a exibição rápida.
6. **Modo offline.** Sem `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, o `main.ts` usa o `LocalRepository` e nada de rede é carregado.
7. **NPCs (depois desta fase).** O estado é um jsonb versionado: campos novos entram como comandos novos e uma migração por `version` (`migrateSave`), sem mudar as tabelas. Saves antigos são migrados, não descartados.

## Login e papéis

- Supabase Auth com magic link (`signInWithOtp`). Redirect para a própria URL do jogo.
- Papel e personagem vêm de `players`. A interface mostra as ferramentas do mestre quando `role = master`; a decisão real é do servidor.
- Substitui o `VITE_MASTER_PASSWORD` e o `commandContext` baseado na sessão local. Offline, depois que o login funcionar, o Modo Mestre abre sem senha (o save é do próprio navegador; a senha nunca protegeu nada).

## Etapas

Status (2026-10-10): etapas 1–11 concluídas e commitadas. Os testes pgTAP (etapa 5) estão escritos, mas ainda não rodaram, porque precisam do Docker. Próxima: etapa 12, que precisa do mestre.

Cada etapa é testável sozinha e vira um commit. Ao fim de cada uma: typecheck, lint, testes, build e README ("Online / Supabase").

| #   | Etapa                                                                                   | Teste                                                       | Precisa de você? |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------- |
| 1   | Este plano                                                                              | —                                                           | não              |
| 2   | Repositório por comandos (`submit`), `LocalRepository` aplica                           | testes do store/repositório                                 | não              |
| 3   | `migrateSave` por `version` (infra para NPCs)                                           | testes de migração                                          | não              |
| 4   | Bundle das regras + catálogo; paridade Node/Deno                                        | Vitest + `npm run parity`                                   | não              |
| 5   | `supabase/` (config, migrations, RLS, pgTAP)                                            | `npx supabase test db` (precisa Docker)                     | rodar local (opcional) |
| 6   | Handler `command` (JWT → ctx → applyCommand → RPC; 401/403/409/422) + `index.ts` Deno   | Vitest com fakes                                            | não              |
| 7   | Handler `create_game`, `restore_save`, convites                                         | Vitest com fakes                                            | não              |
| 8   | `SupabaseRepository` + Realtime + escolha offline/online                                 | Vitest com cliente fake                                     | não              |
| 9   | Login (magic link), escolha/criação do jogo, aceitar convite, papel na interface        | Vitest + manual                                             | não              |
| 10  | Painel de convites do mestre                                                             | manual                                                      | não              |
| 11  | Histórico completo paginado (`game_log`)                                                 | Vitest + manual                                             | não              |
| 12  | Criar projeto, login no CLI, `db push`, deploy da função, URLs do Auth                   | ponta a ponta                                               | **sim**          |
| 13  | Remover `VITE_MASTER_PASSWORD` (após o login validado)                                   | testes + manual                                             | confirmar        |

## O que fica de fora

- Deploy do front (GitHub Pages etc.).
- NPCs (prompt próprio, depois desta fase).
- Vários jogos por usuário na interface: o modelo suporta, a interface abre o primeiro (ou o `?game=`).
