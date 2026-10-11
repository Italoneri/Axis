# Prompt — Fase 3: Supabase (registrar o plano e implementar)

Projeto em `C:\Users\Perdido\.antigravity\clash`. Esta é a continuação da preparação que você acabou de concluir.

## Passo 1 — Registrar o plano (antes de qualquer código)

Crie `docs/plans/FASE3_SUPABASE.md` com o plano que você mesmo propôs no fim da tarefa anterior, completo:

- **Tabelas:**
  - `games`: estado em jsonb + `revision`;
  - `game_log`: histórico completo, com `actor` e `command` em jsonb;
  - `players`: `user_id`, `game_id`, `role`, `character_id`.
- **RLS:** leitura só para membros do jogo. Escrita só pela Edge Function (service role); nenhum cliente grava direto.
- **Edge Function:**
  - recebe `{ command, expectedRevision }` e monta o `ctx` a partir do **JWT**, nunca do cliente;
  - roda o mesmo `applyCommand`;
  - grava com `UPDATE … WHERE revision = expected` e responde **409** em caso de conflito;
  - registra o comando em `game_log`.
- **Login com papéis:** Supabase Auth, com `players.role` (mestre ou jogador) e `character_id`. Isso substitui o `VITE_MASTER_PASSWORD` e o `commandContext` da interface.
- **Realtime:** o `SupabaseRepository.subscribe` escuta `games`, e o `save` chama a Edge Function e devolve o conflito no 409.

Acrescente ao plano estes pontos, que faltavam:

1. **Catálogo na Edge Function:** os JSONs de `src/data` (buildings, materials, currencies, worlds, layout…) vão junto no deploy da função, para ela validar com exatamente as mesmas regras do jogo. Documente como manter isso sincronizado (por exemplo, um script de build que copia os dados para a pasta da função).
2. **Código compartilhado em Deno:** o `applyCommand` e os sistemas precisam rodar em Node (Vitest) e em Deno (Edge Function). Ajuste os imports (zod, extensões, caminhos) e crie um teste ou script que execute um comando de exemplo nos dois ambientes.
3. **Convite de jogadores:** o mestre cria o jogo e gera um **link de convite** por personagem (token de uso único e com validade). O jogador entra com e-mail (magic link), abre o convite e fica ligado ao personagem em `players`. O mestre pode revogar.
4. **Criação do jogo e backup:** o primeiro estado do jogo pode vir de **importar o save atual** (o JSON exportado). O export manual continua disponível para o mestre como backup.
5. **`game_log`:** histórico completo e paginado na interface. O `state.log` limitado a 200 entradas continua para exibição rápida.
6. **Modo offline:** sem as variáveis do Supabase configuradas, o jogo continua usando o `LocalRepository`, como hoje.
7. **NPCs (pendente):** vão entrar depois desta fase como comandos novos. O plano deve deixar claro que o estado é um jsonb versionado, com migração por `version`, para que campos novos não exijam mudar as tabelas.

Divida o plano em **etapas pequenas**, cada uma testável sozinha. Me mostre o plano e **espere meu ok**.

## Passo 2 — Implementar, etapa por etapa

Depois do meu ok, implemente uma etapa por vez, com um commit por etapa. **Pare e me avise** sempre que precisar que eu faça algo fora do código, com o passo a passo exato:
- criar o projeto no Supabase;
- me dizer quais valores copiar (URL e chave **anon**; a service role nunca vai para o front);
- instalar ou fazer login no Supabase CLI;
- rodar `supabase db push` ou o deploy da função;
- configurar URLs de redirecionamento do Auth.

Regras:
- Migrations SQL versionadas em `supabase/migrations/`, com as policies RLS e testes ou consultas de verificação.
- Variáveis em `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Nada de segredo no repositório.
- Remova o `VITE_MASTER_PASSWORD` só quando o login com papéis estiver funcionando.
- Testes para a Edge Function: comando válido, recusa por permissão, conflito 409 e JWT ausente ou inválido.
- Ao final de cada etapa, rode typecheck, lint, testes e build, e atualize o README (seção "Online / Supabase").
