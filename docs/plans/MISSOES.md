# Quadro de missões da Guilda

Objetivo: o **Salão da Guilda** (`guild`) ganha um quadro onde mestre e jogadores penduram contratos. Cada missão é feita pelo **grupo** ou por **NPCs** enviados pela Axis, e o **mestre** decide o resultado. Tudo passa pelo `applyCommand`, então roda igual offline, no cliente online e na Edge Function.

Referência visual: `docs/reference/quadro_missoes_referencia.png`.

## Dados

- `src/data/missions.json` (validado no `parseCatalog`, também vai no catálogo do servidor):

  ```json
  {
    "campCommissionPercent": 20,
    "guildBonus": { "building": "guild", "minLevel": 2, "percent": 10 },
    "attributePointsAbove10": { "11": 13, "12": 17, "13": 23, "14": 30, "15": 40,
                                "16": 53, "17": 70, "18": 92, "19": 121, "20": 160 },
    "teamSpeed": { "k": 160, "m": 3, "minDays": 1, "maxSlowdown": 2 }
  }
  ```

  - `campCommissionPercent`: parte do Acampamento quando NPCs fazem a missão (o resto vai para os NPCs).
  - `attributePointsAbove10` e `teamSpeed`: quanto os atributos dos NPCs aceleram a missão (veja **Tempo das missões com NPCs**). O `parseCatalog` exige as chaves 11 a 20, valores crescentes e o 11 acima de 10.
  - `guildBonus`: com a Guilda em vigor no nível `minLevel` ou mais, a recompensa paga `percent`% a mais, nos dois modos. O `parseCatalog` recusa `building` desconhecido.

- Limites ficam no código (`src/systems/Missions.ts`), como no Arquivo: título até 120 caracteres, descrição até 4.000, tempo de 1 a 365 dias, recompensa maior que 0.

## Estado (`state.missions`, save versão 7)

```ts
Mission = {
  id, title, requester, location, description,   // descrição com o markdown do Arquivo
  reward: { [coinId]: count },                  // como digitada nos campos de moeda
  days, difficulty: 'facil' | 'media' | 'dificil',
  createdBy?: string, createdOnDay,
  progress:
    | { status: 'aberta' }
    | { status: 'grupo', startedOnDay }
    | { status: 'npcs', npcIds, startedOnDay, returnsOnDay }
    | { status: 'aguardando', npcIds, startedOnDay, returnsOnDay }   // NPCs voltaram
    | { status: 'concluida', by: 'grupo' | 'npcs', result: 'sucesso' | 'falha',
        resolvedOnDay, campBronze, npcBronze, npcs: string[] /* nomes */, injured: string[] },
}
```

- NPC ganha `earnings?: number` (bronze acumulado em missões). O `npc_update` preserva o valor.
- Migração `6 → 7`: `missions: []`. Os NPCs não mudam (`earnings` é opcional).

## Comandos

| Comando              | Quem            | O que faz                                                                    |
| -------------------- | --------------- | ---------------------------------------------------------------------------- |
| `mission_create`     | jogador, mestre | cria missão aberta (`createdBy` = actor, `createdOnDay` = dia atual)         |
| `mission_update`     | jogador, mestre | edita os campos; só missão **aberta**                                        |
| `mission_remove`     | jogador, mestre | remove; só missão **aberta**; vai para o log                                 |
| `mission_take_party` | jogador, mestre | aberta → `grupo`                                                             |
| `mission_send_npcs`  | jogador, mestre | aberta → `npcs`; NPCs `disponivel`/`trabalhando` viram `em_missao`           |
| `mission_resolve`    | **só mestre**   | `grupo`/`aguardando` → `concluida`, com `sucesso`/`falha` e NPCs feridos      |

Erros novos: `mission_closed` (a missão não está no estado pedido), `npc_unavailable` (NPC ferido ou já em missão), `empty_reward`.

## Regras

- **Tempo das missões com NPCs:** os atributos de aventura (Força, Destreza, Poder Mágico, de -10 a 20) aceleram a missão.
  - **Pontos de um atributo:** até 10, o próprio valor (-10 vale -10); acima de 10, a tabela `attributePointsAbove10` (15 vale 40, 20 vale 160).
  - **Pontos da equipe:** soma dos três atributos de todos os NPCs enviados, então mais NPCs vão mais rápido.
  - **Dias:** `ceil(prazo × k / (k + m × pontos))`, com `k = 160` e `m = 3`, em inteiros (`floor((a + b − 1) / b)`). Mínimo `minDays` (1). Com pontos negativos, no máximo `maxSlowdown` (2) × o prazo; se o divisor chegar a 0 ou menos, vale esse máximo.
  - Missão de 10 dias: ninguém com atributos → 10; 1 NPC com 20 pontos (7/7/6) → 8; 2 → 6; 3 → 5; 4 → 4; herói 15/15/15 (120) → 4; deusa 20/20/20 (480) → 1; NPC -10/-10/-10 (-30) → 20.
  - O tempo é **calculado na saída** e gravado em `returnsOnDay`: editar atributos depois não muda missões em andamento. Missões do **grupo** não mudam.
- **Retorno:** no `advanceDays`, ao fim de cada dia, missões `npcs` com `returnsOnDay <= dia` viram `aguardando`, com log "Os NPCs voltaram da missão X".
- **Pagamento** (em bronze, inteiro):
  - `total = reward × (100 + bônus) / 100`, arredondado para baixo; o bônus é 0 sem a Guilda nv. ≥ `minLevel`.
  - Grupo, sucesso: o Acampamento recebe `total`.
  - NPCs, sucesso: `parteNpcs = total × (100 − comissão) / 100` (para baixo); cada NPC recebe `parteNpcs / n` (para baixo) em `earnings`; o Acampamento recebe `total − cada × n`, então nenhuma moeda some.
  - Falha: ninguém recebe.
  - O Acampamento recebe em moedas grandes (`fromBronze`).
- **Status dos NPCs:** ao resolver, quem voltou fica `trabalhando` se tem posto, senão `disponivel`; na falha, os marcados ficam `ferido`. Enquanto `em_missao` eles mantêm casa e posto, mas não trabalham nem recebem salário (regra que já existe).
- **NPC removido durante a missão:** depois de todo comando, `settleMissions` tira das missões `npcs`/`aguardando` os NPCs que não existem mais. Missão vazia volta para **Abertas**, com log.
- **Guilda removida ou rebaixada:** missões e NPCs em missão continuam; o botão do quadro some até reconstruir. O bônus segue o nível em vigor no momento de resolver.
- Sem `Math.random`: o mestre decide, então servidor e cliente chegam ao mesmo estado.

## Interface

- Painel da Guilda construída (nível em vigor ≥ 1): card com contagem e botão **Abrir quadro de missões**.
- `<dialog>` grande (padrão do Cardápio): quadro de madeira escura em CSS com moldura grossa e gema azul no topo; abas **Abertas · Em andamento · Concluídas** com contagem; **Nova missão** (`<details>` fechado) com os campos.
- Pergaminho por missão, todo em CSS: cor (laranja, bege, roxo, amarelo-claro) e rotação vêm de um hash do id; bordas rasgadas com `clip-path`, pontas enroladas com pseudo-elementos, prego no topo, selo de cera pela dificuldade (verde, amarelo, vermelho). Grade irregular no desktop, coluna no celular.
- Clicar no pergaminho abre o **primeiro plano**: segundo `<dialog>` com o pergaminho grande no centro e o quadro escurecido atrás; fecha com Esc, X ou clique fora. Mostra o texto completo, o bônus da Guilda e as ações conforme o status (editar/remover, "O grupo vai", "Enviar NPCs" com habilidade, status e posto de cada NPC, resolver pelo mestre com os feridos). Ao marcar NPCs, aparece só o resultado: "Retorno previsto em 4 dias (prazo da missão: 10)". Os atributos e os pontos nunca aparecem no quadro.
- Card do NPC: "Ganhou 1,6 PO em missões" quando `earnings > 0`.

## Publicação

Muda regras do servidor: `npm run deploy:functions`. Sem migração SQL (o estado é jsonb e migra ao carregar). Os atributos e o tempo pela equipe também só pedem `deploy:functions` e depois o build do site: a função nova aceita NPCs com e sem `attributes` e habilidades até 15.
