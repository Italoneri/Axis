# Prompt — Preparar o código para o Supabase (antes da Fase 3)

Projeto em `C:\Users\Perdido\.antigravity\clash`. Esta tarefa **não liga o Supabase ainda**. Ela reorganiza o código para que a Fase 3 seja só "trocar o armazenamento". Leia o código, me mostre o plano em poucas linhas e espere meu ok. Faça um commit por parte, e o jogo deve continuar funcionando offline (localStorage) igual a hoje.

## Diagnóstico (revisão do código atual)

O que já está bom:
- **Regras do jogo em funções puras**, como `startBuild`, `depositToCamp`, `adjustCoins` e `advanceDays`.
- **Estado validado por zod**, com `parseSave` e checagem de referências.
- **Uma única loja** (`GameStore`) com `commit`.
- **Testes:** 295 passando. Typecheck, lint e build sem erro.

O que impede uma sincronização segura entre vários jogadores:

1. **Ações não serializáveis.** O `store.apply(action)` recebe uma *função* (`(s) => depositToCamp(s, …)`). Não dá para enviar uma função ao servidor nem validá-la lá. Para o Supabase, cada ação precisa virar um **comando em dados**, por exemplo `{ type: 'deposit', characterId, coins }`.
2. **Sem controle de concorrência.** O `commit` grava o estado inteiro e não há um número de revisão. Com dois jogadores agindo ao mesmo tempo, o último sobrescreveria o primeiro.
3. **Permissão só na interface.** As ações de mestre ficam escondidas na UI, mas a loja aceita qualquer ação de qualquer pessoa. A senha (`VITE_MASTER_PASSWORD`) fica dentro do JavaScript publicado.
4. **Identidade de "quem fez" incompleta.** Existe o `actingCharacter()` como ponto de troca e um `actor` opcional no log das construções. As demais ações não registram quem agiu de forma consistente.
5. **Log sem limite.** O `state.log` cresce para sempre dentro do mesmo documento. Online, isso deixa cada sincronização cada vez mais pesada.
6. **IDs derivados do nome** (`uniqueId(slugify(nome))`). Funciona offline. Online, dois clientes criando "Ferro" ao mesmo tempo gerariam o mesmo id.

## O que fazer

### Parte 1 — Comandos serializáveis
- Crie `src/commands/` com uma união discriminada `GameCommand` (zod), cobrindo **todas** as ações atuais:
  - construir e melhorar;
  - avançar dias;
  - forçar e remover construção;
  - moedas: ajustar, depositar, transferir e consolidar;
  - materiais e categorias;
  - pesquisas e categorias;
  - influência;
  - personagens.
- Crie `applyCommand(state, catalog, command, ctx): Outcome`, uma **função pura** que valida o comando e chama as funções de sistema que já existem. `ctx` traz `{ actor: { role: 'master' | 'player', characterId?: string } }`.
- **Permissões dentro do `applyCommand`:** comandos de mestre recusados para `player`; jogador só deposita a partir do próprio personagem. Nada de permissão só na UI.
- O `GameStore` passa a ter um único `dispatch(command)`, e a UI troca `store.apply(fn)`, `build`, `upgrade` etc. por comandos.
- **Testes:** cada comando, as recusas de permissão e "um comando válido sempre gera um estado que passa no `gameStateSchema`".

### Parte 2 — Revisão e armazenamento plugável
- Adicione `revision: number` ao estado, incrementado em todo commit.
- Extraia a persistência para uma interface `GameRepository`, com `load()`, `save(state, expectedRevision)` e `subscribe(onRemoteChange)`. A implementação atual, `LocalRepository` com localStorage, é a única por enquanto. O `save` falha se a revisão não bater, e a loja então recarrega e reaplica o comando.
- **Export e import de save continuam funcionando** e servem de backup.

### Parte 3 — Identidade e log
- Todo comando registra no log o `actor` (personagem ou "Mestre"). Uniformize o schema do log.
- Limite o `state.log` às últimas **200** entradas. As mais antigas são descartadas. Deixe um comentário dizendo que na Fase 3 o histórico completo vai para uma tabela separada.
- O `actingCharacter()` passa a ser a fonte única do personagem atual, recebido via `ctx`.

### Parte 4 — IDs
- Itens criados em jogo (materiais, categorias, pesquisas, personagens) recebem **id único** (`crypto.randomUUID()` ou um prefixo curto mais um aleatório). O nome continua sendo só exibição.
- Os ids existentes nos JSONs de seed **não mudam**.

## Fora do escopo
- Não instale nem configure o Supabase.
- Não mude o visual nem os dados das construções.

Ao terminar, rode typecheck, lint, testes e build, e me entregue uma lista curta do que a Fase 3 vai precisar:
- tabelas;
- RLS;
- Edge Function rodando `applyCommand`;
- login com papéis mestre e jogador;
- realtime.
