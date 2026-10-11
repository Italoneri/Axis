# NPCs: moradores e trabalhadores da Axis

Objetivo: o mestre cria NPCs (ex.: **Bianca, maga**) com habilidades. Eles **moram** em construções de moradia e são **designados** para postos de trabalho, que rendem efeitos a cada dia de jogo. Tudo nasce como `GameCommand`, validado no `applyCommand`, e funciona igual offline e online.

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

- `src/data/npcs.json`: o posto de **obra**, que existe em qualquer construção em andamento (primeira obra ou melhoria): `{ "construction": { activity, name, skill, slots, effect: { type: "construction", perDay } } }`.

### Tipos de efeito

| Tipo           | Campos               | O que faz por dia                                                      |
| -------------- | -------------------- | ---------------------------------------------------------------------- |
| `produce`      | `material`, `perDay` | soma unidades ao material (ignorado se o mestre apagou o material)     |
| `research`     | `perDay`             | soma pontos percentuais à pesquisa escolhida na designação, até 100%   |
| `construction` | `perDay`             | adianta a obra do posto (nunca termina antes do dia que está passando) |
| `bonus`        | `text`               | aparece em Bônus ativos enquanto o posto estiver ocupado               |

### Rendimento

`valor = base × (1 + habilidade / 10)`, habilidade de 0 a 10. Uma habilidade 0 ainda trabalha e rende só a base; uma habilidade diferente da do posto conta como 0.

O valor é guardado em **décimos inteiros** (`round(base × (10 + habilidade))`), o que deixa a conta exata e determinística (sem soma de floats). A interface mostra uma casa decimal ("Bianca: +3,4 de progresso por dia").

**Fração acumulada:** cada vaga ocupada (o `job` do NPC) guarda os décimos ainda não entregues (`carry`, 0–9). A cada dia, `décimos = rendimento + carry`; entregam-se `floor(décimos / 10)` unidades inteiras (material, ponto de pesquisa ou dia de obra) e o resto fica para o dia seguinte. Trocar de posto zera a fração.

### Valores iniciais (nível 1 / 2 / 3)

| Construção         | Moradia | Posto (habilidade)     | Vagas | Efeito (base)           |
| ------------------ | ------- | ---------------------- | ----- | ----------------------- |
| Alojamento         | 6/14/14 | —                      | —     | —                       |
| Torre dos Magos    | 2/3/4   | Estudar (Pesquisa)     | 1/1/2 | research 1/1/2          |
| Taverna            | 2/2/3   | Cozinhar (Gastronomia) | 1/2/2 | bonus (texto)           |
| Forja              | —       | Forjar (Ferraria)      | 1/2/3 | produce Ferro 1/2/3     |
| Biblioteca         | —       | Pesquisar (Pesquisa)   | 1/2/3 | research 1/1/2          |
| Estação de Estudo  | —       | Estudar (Pesquisa)     | 1/1/2 | research 1/2/2          |
| Arquivo            | —       | Catalogar (Pesquisa)   | 1     | research 1              |
| Enfermaria         | —       | Tratar (Medicina)      | 1/2/2 | bonus (texto)           |
| Santuário          | —       | Cuidar (Medicina)      | 1     | bonus (texto)           |
| Laboratório Arcano | —       | Destilar (Alquimia)    | 1/1/2 | produce Aetherium 1/1/2 |
| Obra em andamento  | —       | Construir (Construção) | 2     | construction 1          |

## Modelo (`GameState.npcs`, save versão 5)

```ts
npc = {
  id, name, title, portrait?, description,
  skills: { [skillId]: 0..10 },        // ausente = 0
  home: slotId | null,
  job: { slotId, activityId, researchId?, carry } | null,
  status: 'disponivel' | 'trabalhando' | 'ferido' | 'em_missao',
  wage?: number,                       // PO por dia; a interface usa moedas
}
```

- `status`: `ferido` e `em_missao` são definidos pelo mestre; nesses casos o NPC mantém casa e posto, mas não trabalha nem recebe. `disponivel` e `trabalhando` são derivados do `job` automaticamente.
- Migração 4 → 5 acrescenta `npcs: []`. Online o estado continua sendo o mesmo jsonb da tabela `games`, sem mudança de tabela.

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
  - O log recebe **resumos por avanço** (não por dia): `npc_worked` por NPC, `npc_wages_paid` com o total e `npc_unpaid` com os dias sem pagamento.

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

- Botão **"NPCs"** na barra: cards com retrato, título, barras de habilidade, moradia, trabalho e status; filtros por habilidade e "sem trabalho". O mestre cria, edita e remove pelo mesmo painel. No seletor de moradia, as construções lotadas ficam desabilitadas (exceto a casa atual).
- Salário: digitado em moedas (prata, bronze…) e salvo em PO; o card mostra "Salário: 1 Prata e 2 Bronze/dia", ou "Sem salário".
- Painel da construção: moradores (x de y) e postos, com seletor de NPC ordenado pela habilidade do posto e prévia do rendimento. O rótulo de cada candidato mostra o posto atual e se está ferido ou em missão.
- Mapa: iniciais de quem está em serviço (feridos e em missão não contam) sobre as construções.
- Bônus ativos: incluem os efeitos dos postos ocupados.

## Detalhes conhecidos

- No log de um avanço de dias, o "saiu do posto" (`npc_released`) aparece antes do resumo do trabalho (`npc_worked`): as liberações são registradas no dia em que acontecem e os resumos só no fim do avanço. Fica assim de propósito.

## Futuro (fora do escopo agora)

Evolução de habilidades com o uso, moral, traços de personalidade, eventos aleatórios e missões externas.
