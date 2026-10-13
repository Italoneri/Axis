# NPCs: moradores e trabalhadores da Axis

Objetivo: o mestre cria NPCs (ex.: **Bianca, maga**) com habilidades. Eles **moram** no Alojamento e são **designados** para postos de trabalho, que rendem efeitos a cada dia de jogo. Tudo nasce como `GameCommand`, validado no `applyCommand`, e funciona igual offline e online.

## Dados (JSON, validados no `parseCatalog`)

- `src/data/skills.json`: `{ skills: [{ id, name, icon, description }] }`. Iniciais: `construction` (Construção), `smithing` (Ferraria), `cooking` (Gastronomia), `research` (Pesquisa), `medicine` (Medicina), `alchemy` (Alquimia). O mestre pode acrescentar outras.
- `src/data/buildings.json`, por nível (opcionais):

  ```json
  "housing": { "capacity": 4 },
  "jobs": [
    { "activity": "forjar", "name": "Forjar", "skill": "smithing",
      "effect": { "type": "produce", "material": "iron", "perDay": 2 } }
  ]
  ```

  O posto não diz quantas vagas tem (o `parseCatalog` recusa `slots` nele): isso vem do espaço onde a construção está.

- `src/data/attributes.json`: `{ attributes: [{ id, name, icon, description }] }` com os três atributos de aventura, `strength` (Força), `dexterity` (Destreza) e `magic` (Poder Mágico). O `parseCatalog` exige exatamente esses três ids.
- `src/data/npcs.json`: o divisor das habilidades negativas, a tabela dos níveis herói (`skillTenthsAbove10`), as construções que podem ter moradia e o posto de **obra**, que existe em qualquer construção em andamento (primeira obra ou melhoria): `{ "negativeDivisor": 5, "housingBuildings": ["barracks"], "postSlots": { "outer": [3, 6, 8], "middle": [2, 4, 6] }, "construction": { activity, name, skill, slots, effect: { type: "construction", perDay } } }`. O `parseCatalog` recusa `housing` em construção fora de `housingBuildings`, para a moradia não voltar sem querer a outras construções.
- **Vagas por anel (`postSlots`):** todo posto de construção tem as vagas do tipo do espaço (`layout.json`) no nível em vigor: anel externo (`outer`) 3/6/8, anel interno (`middle`) 2/4/6. O posto de obra mantém as próprias vagas (2) em qualquer anel. O `parseCatalog` exige `postSlots` para cada tipo de espaço aceito por uma construção com postos, cobrindo todos os níveis dela.

### Tipos de efeito

| Tipo           | Campos               | O que faz por dia                                                      | Com rendimento negativo                   |
| -------------- | -------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `produce`      | `material`, `perDay` | soma unidades ao material (ignorado se o mestre apagou o material)     | consome o estoque, sem passar de 0        |
| `research`     | `perDay`             | soma pontos percentuais à pesquisa escolhida na designação, até 100%   | faz a pesquisa regredir, sem passar de 0% |
| `construction` | `perDay`             | adianta a obra do posto (nunca termina antes do dia que está passando) | atrasa a obra (`completesOnDay` cresce)   |
| `bonus`        | `text`, `penalty?`   | aparece em Bônus ativos enquanto o posto estiver ocupado               | mostra o `penalty`; sem ele, o bônus some |

### Rendimento

Habilidade de **-10 a 15**; ausente vale 0, e uma habilidade diferente da do posto também conta como 0.

- **habilidade de 0 a 10:** `valor = base × (1 + habilidade / 10)`. Uma habilidade 0 ainda trabalha e rende só a base.
- **habilidade de 11 a 15 ("nível herói"):** crescimento explosivo, ~1,32× por ponto, e **15 rende 4× o que 10 rende**. Vem da tabela `skillTenthsAbove10` em `npcs.json`, em décimos da base: `{ "11": 26, "12": 35, "13": 46, "14": 61, "15": 80 }` (o 10 vale 20). Ex.: se com 10 a Forja dá 10 Ferros, com 15 dá 40. O `parseCatalog` exige as chaves 11 a 15, valores crescentes e o 11 acima de 20.
- **habilidade < 0:** `valor = base × habilidade / negativeDivisor` (divisor 5 em `npcs.json`). O NPC **atrapalha**: com -10 rende `-2 × base`, com -5 `-1 × base`, com -1 `-0,2 × base`. Ex.: um ferreiro -10 na Forja nv. 1 gasta 2 de Ferro por dia.

O valor é guardado em **décimos inteiros** (`round(base × (10 + habilidade))`, `round(base × tabela[habilidade])` acima de 10, ou `round(base × habilidade × 10 / divisor)`), o que deixa a conta exata e determinística (sem soma de floats). A interface mostra uma casa decimal ("Bianca: +3,4 de progresso por dia", "-2,0 Ferro por dia" em vermelho).

**Fração acumulada:** cada vaga ocupada (o `job` do NPC) guarda os décimos ainda não entregues (`carry`, -9 a 9, com o sinal do rendimento). A cada dia, `décimos = rendimento + carry`; entregam-se `trunc(décimos / 10)` unidades inteiras (material, ponto de pesquisa ou dia de obra) e o resto, com sinal, fica para o dia seguinte. Se o alvo bloquear a entrega (estoque zerado, pesquisa em 0% ou 100%, obra que termina hoje), a fração é descartada. Trocar de posto ou editar as habilidades do NPC zera a fração.

**Vários NPCs no mesmo posto** contam separados: um bom e um ruim se compensam.

### Valores iniciais (nível 1 / 2 / 3)

"Por anel": 3/6/8 vagas no anel externo, 2/4/6 no interno (`postSlots`).

| Construção         | Moradia | Posto (habilidade)     | Vagas    | Efeito (base)              |
| ------------------ | ------- | ---------------------- | -------- | -------------------------- |
| Alojamento (até 4) | 6/14/14 | —                      | —        | —                          |
| Torre dos Magos    | —       | Estudar (Pesquisa)     | por anel | research 1/1/2             |
| Taverna            | —       | Cozinhar (Gastronomia) | por anel | bonus (texto e penalidade) |
| Forja              | —       | Forjar (Ferraria)      | por anel | produce Ferro 1/2/3        |
| Biblioteca         | —       | Pesquisar (Pesquisa)   | por anel | research 1/1/2             |
| Arquivo            | —       | Catalogar (Pesquisa)   | por anel | research 1                 |
| Enfermaria         | —       | Tratar (Medicina)      | por anel | bonus (texto e penalidade) |
| Santuário          | —       | Cuidar (Medicina)      | por anel | bonus (texto e penalidade) |
| Laboratório Arcano | —       | Destilar (Alquimia)    | por anel | produce Aetherium 1/1/2    |
| Obra em andamento  | —       | Construir (Construção) | 2        | construction 1             |

## Modelo (`GameState.npcs`, save versão 6)

```ts
npc = {
  id, name, title, portrait?, description,
  skills: { [skillId]: -10..15 },      // ausente = 0; negativo atrapalha; 11+ é nível herói
  attributes?: { strength?, dexterity?, magic? },  // -10..20; ausente = 0; só o mestre vê
  home: slotId | null,
  job: { slotId, activityId, researchId?, carry } | null,
  status: 'disponivel' | 'trabalhando' | 'ferido' | 'em_missao',
  wage?: number,                       // PO por dia; a interface usa moedas
}
```

- `status`: `ferido` e `em_missao` são definidos pelo mestre; nesses casos o NPC mantém casa e posto, mas não trabalha nem recebe. `disponivel` e `trabalhando` são derivados do `job` automaticamente.
- Migração 5 → 6: a moradia passou a existir só no Alojamento (antes a Taverna e a Torre dos Magos também abrigavam NPCs). Como a mudança precisa do catálogo, o passo em JSON só sobe a versão e o `parseState` roda `rehomeNpcs` (`CATALOG_MIGRATIONS`) depois de validar: quem mora numa construção sem moradia muda, na ordem da lista, para um Alojamento com vaga, mantendo o posto, com `npc_moved` no log ("Pelé mudou-se de Taverna para Alojamento"). Quem não couber é liberado pelo `settleNpcs` com o motivo de sempre (`capacity`). Online é igual: o jsonb passa pela mesma `parseState`, no servidor e no cliente.
- **Atributos de aventura** (Força, Destreza, Poder Mágico, de -10 a 20) não mudaram a versão do save: `attributes` é opcional e ausente vale 0, então saves antigos continuam válidos. As habilidades até 15 também não pedem migração (o limite só aumentou). Zeros não são guardados. Um `npc_update` sem `attributes` (cliente antigo) mantém os atuais. Os atributos só aceleram as missões da Guilda (veja `MISSOES.md`).
- Migração 4 → 5 acrescenta `npcs: []`. As habilidades negativas não mudaram a versão: os campos só ficaram mais permissivos (habilidade, `carry` e `amount` do log com sinal), então saves v5 antigos continuam válidos. Online o estado continua sendo o mesmo jsonb da tabela `games`, sem mudança de tabela.

## Regras

- **Até 4 Alojamentos** (`maxCount: 4` no `buildings.json`; as outras construções têm 1). A capacidade vale por Alojamento e soma (4 × 14 = 56 no nv. 2). `housingList` e `npc_set_home` trabalham por espaço; remover um Alojamento libera só os moradores dele (`settleNpcs`). Cada cópia tem um nome estável, "Alojamento I" a "XIV", pela posição do espaço no layout entre os espaços do anel externo (`copyNumber`). O nome aparece no seletor de moradia ("Alojamento II (14/14, lotado)"), no painel e no log (`slotId` opcional nas entradas de construção e em `npc_home_set`; as entradas antigas continuam válidas).

- **Trabalho exige moradia.** Ficar sem moradia (por comando ou desalojado) também libera o posto.
- **Capacidade, postos e vagas vêm do nível em vigor (`activeLevel`).** As vagas também dependem do anel do espaço (`postSlots`). Durante uma **melhoria** a construção continua funcionando no nível atual: ninguém é desalojado nem dispensado, nem no Alojamento. Na **primeira obra** a construção ainda não existe, então não tem moradia nem postos (só o posto de obra).
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
| `npc_update`     | mestre           | idem; inclui habilidades, atributos, salário e status                    |
| `npc_remove`     | mestre           | `not_found`                                                              |
| `npc_set_home`   | jogador e mestre | `not_found`, `home_full` (lotada), `no_housing` (espaço sem moradia)     |
| `npc_assign_job` | jogador e mestre | `no_home`, `invalid_post`, `post_full`, `invalid_target` (pesquisa)      |
| `npc_unassign`   | jogador e mestre | `not_found`                                                              |

Todo comando registra o `actor` no log.

## Interface

- Botão **"NPCs"** na barra: cards com retrato, título, barras de habilidade, moradia, trabalho e status; filtros por habilidade e "sem trabalho". O mestre cria, edita e remove pelo mesmo painel. O bloco **Novo NPC** fica no topo e sempre abre fechado (ao abrir o painel, depois de criar, a cada redesenho); só continua aberto enquanto o mestre está digitando nele. Depois de criar, o card do NPC novo rola até a vista e pisca em dourado. No seletor de moradia, as construções lotadas ficam desabilitadas (exceto a casa atual). Ao lado dele, **Retirar da moradia** (só para quem mora em algum lugar) envia `npc_set_home` com `slotId: null`. As barras de habilidade partem do centro e são proporcionais a 15: positivas crescem para a direita em dourado (mais claro e com brilho acima de 10, o "nível herói"), negativas para a esquerda em vermelho. Os campos de habilidade vão de -10 a 15.
- **Atributos** (Força, Destreza, Poder Mágico): só no formulário **Novo NPC** / **Editar** do mestre, numa seção "Atributos" de -10 a 20. Ficam ocultos no card, na lista do painel e no seletor de NPCs do quadro de missões (um teste em `src/ui` garante isso).
- Salário: digitado em moedas (prata, bronze…) e salvo em PO; o card mostra "Salário: 1 Prata e 2 Bronze/dia", ou "Sem salário".
- Painel da construção: moradores (x de y), cada um com **Retirar**, e postos, com seletor de NPC ordenado pela habilidade do posto e prévia do rendimento. O rótulo de cada candidato mostra o posto atual e se está ferido ou em missão. Quem atrapalha aparece com "⚠ atrapalha" (ex.: "Gus (-6) · -1,2 Ferro por dia ⚠ atrapalha") e no fim da lista. Nível herói ganha uma estrela no seletor ("Bia (12 ★)") e a prévia em dourado claro no card do posto.
- Bônus ativos: incluem os efeitos dos postos ocupados; rendimentos negativos e penalidades aparecem em vermelho.

- Retirar quem trabalha também tira do posto (trabalho exige moradia), então o botão pede um segundo clique, como o `confirmButton`, avisando "Bia também vai deixar o posto Cozinhar em Taverna".

## Detalhes conhecidos

- No log de um avanço de dias, o "saiu do posto" (`npc_released`) aparece antes do resumo do trabalho (`npc_worked`): as liberações são registradas no dia em que acontecem e os resumos só no fim do avanço. Fica assim de propósito.

## Futuro (fora do escopo agora)

Evolução de habilidades com o uso, moral, traços de personalidade, eventos aleatórios e missões externas.
