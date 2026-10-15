# Habilidades das construções: Party e Axis

Data: 2026-10-15 · Status: aprovado em conversa, aguardando revisão da spec

## Objetivo

Hoje cada nível de construção tem um único texto livre (`levels[].effect`) que nada no
jogo lê — só aparece na tela — e muitos foram escritos de forma genérica. O mestre quer
reescrever as habilidades separando o público de cada uma:

- **Party** — o que a construção dá para a mesa de RPG (texto do mestre).
- **Axis** — buffs da base (velocidade de obra, geração de ferro e afins).

E quer que os jogadores vejam, antes de construir, o que cada construção dá nível a nível.

### Critérios de sucesso

1. Todo nível de toda construção tem os campos `party` e `axis`, editáveis direto em
   `src/data/buildings.json`.
2. Na tela de construção (slot vazio), cada construção tem uma aba **Detalhes** mostrando
   os 3 níveis com Party e Axis lado a lado, mais custo, dias de obra, requisitos, postos e
   moradia de cada nível.
3. O texto antigo `effect` some de todos os lugares e é substituído pelos dois campos.

### Fora do escopo (fase 2)

Buffs da Axis aplicados pelo motor do jogo (velocidade de obra, produção de material,
velocidade de pesquisa, recompensa de missão). Na v1 os dois campos são **só texto**; o
mestre escreve primeiro e, quando consolidar, os buffs mecânicos entram num campo
estruturado novo ao lado de `axis`, sem quebrar o texto.

## Dados

### `buildings.json`

Em cada `levels[]`, `effect` é removido e entram:

```json
{ "party": "", "axis": "" }
```

Os 48 níveis (16 construções × 3) começam com as duas strings vazias. Os textos antigos
saem do arquivo (ficam no histórico do git). Nada mais muda: `cost`, `buildTime`,
`requires`, `housing` e `jobs` continuam iguais.

### Schema (`src/model/schema.ts`)

`buildingLevelSchema` troca `effect: z.string().min(1)` por:

```ts
party: z.string(),
axis: z.string(),
```

Ambos obrigatórios, vazio permitido — "a definir" é um estado válido. Saves não guardam
o catálogo, então nenhuma migração de save é necessária.

### `BonusSystem.activeBonuses`

`ActiveBonus.effects: string[]` vira dois campos com os textos acumulados dos níveis já
alcançados, ignorando os vazios:

```ts
party: string[];
axis: string[];
```

## Interface

Textos vazios aparecem como **"a definir"** em tom apagado, para deixar claro que falta
escrever sem quebrar o layout.

### Tela de construção — `SlotPanel.renderEmpty`

Cada card ganha um botão **Detalhes ▾** que expande/recolhe a ficha da construção:

- Um bloco por nível (Nível 1, 2, 3), com:
  - duas colunas lado a lado: **Party** | **Axis** (empilhadas em telas estreitas);
  - linha de custo (moedas + materiais) e dias de obra;
  - requisitos daquele nível (ex.: "requer Coração da Axis nv. 1");
  - postos de NPC com rendimento base (ex.: "Forjar: +1 Ferro por dia") e moradia
    (ex.: "Moradia: 6").
- O resumo do nível 1 que já existe no card continua, sem o texto `effect`.

A ficha é um componente único (`buildingDetails(def, …)`), reaproveitado abaixo.

### Construção erguida — `SlotPanel.renderOccupied`

- "Efeito atual" e "Próximo nível" passam a mostrar Party e Axis no lugar do texto único.
- Ganha o mesmo **Detalhes ▾**, com o nível em vigor destacado.

### Gaveta — aba "Bônus ativos" (`InfoDrawer.renderBonuses`)

Cada card de construção lista os textos de Party e de Axis acumulados até o nível atual,
sob dois subtítulos. Construção sem nenhum texto escrito mostra "a definir".

### Textos (`src/i18n/pt-BR.ts`)

Novas chaves: rótulos "Party", "Axis", "Detalhes", "a definir", "Nível N", rótulos de
posto/moradia na ficha. `t.panel.effect` e `t.panel.currentEffect` são substituídos.

## Servidor

O servidor não lê esses textos, mas o catálogo vai embutido no bundle
(`supabase/functions/_shared/game.js`). Rodar `npm run build:functions` e `npm run parity`
para confirmar que a regra continua idêntica. Redeploy da function é opcional.

## Testes

- `catalog.test.ts`: o catálogo real carrega; `party`/`axis` vazios são aceitos; um
  nível sem os campos é rejeitado.
- `BonusSystem.test.ts`: acumula `party` e `axis` por nível alcançado e ignora vazios.
- Atualizar fixtures que usam `effect` (`pt-BR.test.ts`, `NpcWork.test.ts`,
  `SaveSystem.test.ts`, `testFixtures.ts`).
- Verificação final: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, e
  conferir a aba Detalhes no `npm run dev` (desktop e largura de celular).
