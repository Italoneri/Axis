# NPCs: moradores e trabalhadores da Axis

Objetivo: o mestre cria NPCs (ex.: **Bianca, maga**) com habilidades. Eles **moram** no Alojamento e são **designados** para postos de trabalho, que rendem efeitos a cada dia de jogo. Tudo nasce como `GameCommand`, validado no `applyCommand`, e funciona igual offline e online.

## Dados (JSON, validados no `parseCatalog`)

- `src/data/skills.json`: `{ skills: [{ id, name, icon, description }] }`. Iniciais: `construction` (Construção), `smithing` (Ferraria), `cooking` (Gastronomia), `research` (Pesquisa), `medicine` (Medicina), `alchemy` (Alquimia). O mestre pode acrescentar outras.
- `src/data/buildings.json`, por nível (opcionais):

  ```json
  "housing": { "capacity": 4 },
  "jobs": [
    { "activity": "forjar", "name": "Forjar", "skill": "smithing", "slots": 2,
      "effect": { "type": "produce", "material": "iron", "perDay": 2 } }
  ]
  ```

- `src/data/npcs.json`: o divisor das habilidades negativas, as construções que podem ter moradia e o posto de **obra**, que existe em qualquer construção em andamento (primeira obra ou melhoria): `{ "negativeDivisor": 5, "housingBuildings": ["barracks"], "construction": { activity, name, skill, slots, effect: { type: "construction", perDay } } }`. O `parseCatalog` recusa `housing` em construção fora de `housingBuildings`, para a moradia não voltar sem querer a outras construções.

### Tipos de efeito

| Tipo           | Campos               | O que faz por dia                                                      | Com rendimento negativo                   |
| -------------- | -------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `produce`      | `material`, `perDay` | soma unidades ao material (ignorado se o mestre apagou o material)     | consome o estoque, sem passar de 0        |
| `research`     | `perDay`             | soma pontos percentuais à pesquisa escolhida na designação, até 100%   | faz a pesquisa regredir, sem passar de 0% |
| `construction` | `perDay`             | adianta a obra do posto (nunca termina antes do dia que está passando) | atrasa a obra (`completesOnDay` cresce)   |
| `bonus`        | `text`, `penalty?`   | aparece em Bônus ativos enquanto o posto estiver ocupado               | mostra o `penalty`; sem ele, o bônus some |

### Rendimento

Habilidade de **-10 a 10**; ausente vale 0, e uma habilidade diferente da do posto também conta como 0.

- **habilidade ≥ 0:** `valor = base × (1 + habilidade / 10)`. Uma habilidade 0 ainda trabalha e rende só a base.
- **habilidade < 0:** `valor = base × habilidade / negativeDivisor` (divisor 5 em `npcs.json`). O NPC **atrapalha**: com -10 rende `-2 × base`, com -5 `-1 × base`, com -1 `-0,2 × base`. Ex.: um ferreiro -10 na Forja nv. 1 gasta 2 de Ferro por dia.

O valor é guardado em **décimos inteiros** (`round(base × (10 + habilidade))`, ou `round(base × habilidade × 10 / divisor)`), o que deixa a conta exata e determinística (sem soma de floats). A interface mostra uma casa decimal ("Bianca: +3,4 de progresso por dia", "-2,0 Ferro por dia" em vermelho).

**Fração acumulada:** cada vaga ocupada (o `job` do NPC) guarda os décimos ainda não entregues (`carry`, -9 a 9, com o sinal do rendimento). A cada dia, `décimos = rendimento + carry`; entregam-se `trunc(décimos / 10)` unidades inteiras (material, ponto de pesquisa ou dia de obra) e o resto, com sinal, fica para o dia seguinte. Se o alvo bloquear a entrega (estoque zerado, pesquisa em 0% ou 100%, obra que termina hoje), a fração é descartada. Trocar de posto ou editar as habilidades do NPC zera a fração.

**Vários NPCs no mesmo posto** contam separados: um bom e um ruim se compensam.

### Valores iniciais (nível 1 / 2 / 3)

| Construção         | Moradia | Posto (habilidade)     | Vagas | Efeito (base)              |
| ------------------ | ------- | ---------------------- | ----- | -------------------------- |
| Alojamento         | 6/14/14 | —                      | —     | —                          |
| Torre dos Magos    | —       | Estudar (Pesquisa)     | 1/1/2 | research 1/1/2             |
| Taverna            | —       | Cozinhar (Gastronomia) | 1/2/2 | bonus (texto e penalidade) |
| Forja              | —       | Forjar (Ferraria)      | 1/2/3 | produce Ferro 1/2/3        |
| Biblioteca         | —       | Pesquisar (Pesquisa)   | 1/2/3 | research 1/1/2             |
| Estação de Estudo  | —       | Estudar (Pesquisa)     | 1/1/2 | research 1/2/2             |
| Arquivo            | —       | Catalogar (Pesquisa)   | 1     | research 1                 |
| Enfermaria         | —       | Tratar (Medicina)      | 1/2/2 | bonus (texto e penalidade) |
| Santuário          | —       | Cuidar (Medicina)      | 1     | bonus (texto e penalidade) |
| Laboratório Arcano | —       | Destilar (Alquimia)    | 1/1/2 | produce Aetherium 1/1/2    |
| Obra em andamento  | —       | Construir (Construção) | 2     | construction 1             |

## Modelo (`GameState.npcs`, save versão 6)

```ts
npc = {
  id, name, title, portrait?, description,
  skills: { [skillId]: -10..10 },      // ausente = 0; negativo atrapalha
  home: slotId | null,
  job: { slotId, activityId, researchId?, carry } | null,
  status: 'disponivel' | 'trabalhando' | 'ferido' | 'em_missao',
  wage?: number,                       // PO por dia; a interface usa moedas
}
```

- `status`: `ferido` e `em_missao` são definidos pelo mestre; nesses casos o NPC mantém casa e posto, mas não trabalha nem recebe. `disponivel` e `trabalhando` são derivados do `job` automaticamente.
- Migração 5 → 6: a moradia passou a existir só no Alojamento (antes a Taverna e a Torre dos Magos também abrigavam NPCs). Como a mudança precisa do catálogo, o passo em JSON só sobe a versão e o `parseState` roda `rehomeNpcs` (`CATALOG_MIGRATIONS`) depois de validar: quem mora numa construção sem moradia muda, na ordem da lista, para um Alojamento com vaga, mantendo o posto, com `npc_moved` no log ("Pelé mudou-se de Taverna para Alojamento"). Quem não couber é liberado pelo `settleNpcs` com o motivo de sempre (`capacity`). Online é igual: o jsonb passa pela mesma `parseState`, no servidor e no cliente.
- Migração 4 → 5 acrescenta `npcs: []`. As habilidades negativas não mudaram a versão: os campos só ficaram mais permissivos (habilidade, `carry` e `amount` do log com sinal), então saves v5 antigos continuam válidos. Online o estado continua sendo o mesmo jsonb da tabela `games`, sem mudança de tabela.

## Regras

- **Trabalho exige moradia.** Ficar sem moradia (por comando ou desalojado) também libera o posto.
- **Capacidade e postos vêm do nível em vigor (`activeLevel`).** Durante uma **melhoria** a construção continua funcionando no nível atual: ninguém é desalojado nem dispensado, nem no Alojamento. Na **primeira obra** a construção ainda não existe, então não tem moradia nem postos (só o posto de obra).
- **Liberação automática** (`settleNpcs`, roda depois de todo comando, a cada dia avançado e ao carregar um save), na ordem da lista de NPCs, com entrada `npc_released` no log:
  - construção removida (`building_removed`);
  - capacidade ou postos menores, ex.: o mestre força um nível mais baixo (`capacity`);
  - obra concluída libera quem trabalhava nela (`construction_done`);
  - pesquisa alvo concluída ou apagada (`research_closed`);
  - sem moradia (`no_home`).
- **Um trabalho por vez.** Designar de novo troca o posto.
- **Pesquisa chega a 100% e para**: registra `research_ready` no log e a pesquisa ganha o destaque "pronta para concluir"; quem conclui é o mestre.
- **`advanceDays` processa dia a dia, nesta ordem:** salários → efeitos dos postos → conclusão de obras → liberações. Sem `Math.random`, então servidor e cliente chegam ao mesmo resultado.
  - **Salários**: cobrados do Acampamento na ordem da lista, só de quem trabalharia naquele dia. Sem saldo, o NPC fica sem pagamento e não trabalha naquele dia.
  - O log recebe **resumos por avanço** (não por dia): `npc_worked` por NPC (`amount` negativo quando atrapalhou: "Gus estragou 2 Ferro", "fez a pesquisa 'Runas' regredir 2%", "atrasou a obra de Forja em 2 dias"), `npc_wages_paid` com o total e `npc_unpaid` com os dias sem pagamento.

## Comandos

| Comando          | Quem             | Recusas                                                                  |
| ---------------- | ---------------- | ------------------------------------------------------------------------ |
| `npc_create`     | mestre           | `empty_name`, `duplicate_name`, `duplicate_id`, `not_found` (habilidade) |
| `npc_update`     | mestre           | idem; inclui habilidades, salário e status                               |
| `npc_remove`     | mestre           | `not_found`                                                              |
| `npc_set_home`   | jogador e mestre | `not_found`, `home_full` (lotada), `no_housing` (espaço sem moradia)     |
| `npc_assign_job` | jogador e mestre | `no_home`, `invalid_post`, `post_full`, `invalid_target` (pesquisa)      |
| `npc_unassign`   | jogador e mestre | `not_found`                                                              |

Todo comando registra o `actor` no log.

## Interface

- Botão **"NPCs"** na barra: cards com retrato, título, barras de habilidade, moradia, trabalho e status; filtros por habilidade e "sem trabalho". O mestre cria, edita e remove pelo mesmo painel. O bloco **Novo NPC** fica no topo e sempre abre fechado (ao abrir o painel, depois de criar, a cada redesenho); só continua aberto enquanto o mestre está digitando nele. Depois de criar, o card do NPC novo rola até a vista e pisca em dourado. No seletor de moradia, as construções lotadas ficam desabilitadas (exceto a casa atual). Ao lado dele, **Retirar da moradia** (só para quem mora em algum lugar) envia `npc_set_home` com `slotId: null`. As barras de habilidade partem do centro: positivas crescem para a direita em dourado, negativas para a esquerda em vermelho.
- Salário: digitado em moedas (prata, bronze…) e salvo em PO; o card mostra "Salário: 1 Prata e 2 Bronze/dia", ou "Sem salário".
- Painel da construção: moradores (x de y), cada um com **Retirar**, e postos, com seletor de NPC ordenado pela habilidade do posto e prévia do rendimento. O rótulo de cada candidato mostra o posto atual e se está ferido ou em missão. Quem atrapalha aparece com "⚠ atrapalha" (ex.: "Gus (-6) · -1,2 Ferro por dia ⚠ atrapalha") e no fim da lista.
- Bônus ativos: incluem os efeitos dos postos ocupados; rendimentos negativos e penalidades aparecem em vermelho.

- Retirar quem trabalha também tira do posto (trabalho exige moradia), então o botão pede um segundo clique, como o `confirmButton`, avisando "Bia também vai deixar o posto Cozinhar em Taverna".

## Detalhes conhecidos

- No log de um avanço de dias, o "saiu do posto" (`npc_released`) aparece antes do resumo do trabalho (`npc_worked`): as liberações são registradas no dia em que acontecem e os resumos só no fim do avanço. Fica assim de propósito.

## Futuro (fora do escopo agora)

Evolução de habilidades com o uso, moral, traços de personalidade, eventos aleatórios e missões externas.
