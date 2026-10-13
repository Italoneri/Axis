# Prompt — Habilidades até 15 com crescimento explosivo e atributos de aventura (Força, Destreza, Poder Mágico)

Projeto em `C:\Users\Perdido\.antigravity\clash`. **O jogo já está online com os jogadores.** Leia `docs/plans/NPCS.md`, `docs/plans/MISSOES.md`, `src/systems/Npcs.ts` (`yieldTenths`), `src/systems/NpcWork.ts`, `src/systems/Missions.ts`, `src/data/npcs.json`, `src/data/missions.json` e `src/ui/resources/NpcPanel.ts`. Me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte, atualize os planos e o README (NPCs e Guilda), e no final diga o que publicar e em que ordem.

Os números abaixo já foram decididos e conferidos comigo. **Não invente outra fórmula.** Todas as tabelas e constantes ficam em JSON, para eu calibrar depois. Use tabelas de inteiros em vez de `Math.pow`, para servidor e cliente darem exatamente o mesmo resultado.

## 1. Habilidades de trabalho: -10 a 15, explosivas acima de 10

- Escala de **-10 a 15** (`skillLevelSchema`).
- **De 0 a 10**, o rendimento não muda: `base × (1 + hab/10)`, em décimos (`round(base × (10 + hab))`).
- **De 11 a 15**, o crescimento é **explosivo**: cada ponto multiplica por ~1,32, e **15 rende 4× o que 10 rende**. Em décimos da base, por uma tabela em `npcs.json`:

  ```json
  "skillTenthsAbove10": { "11": 26, "12": 35, "13": 46, "14": 61, "15": 80 }
  ```

  Ou seja, `yieldTenths = round(base × tabela[hab])`. Exemplo: se com habilidade 10 a Forja dá 10 ferros, com 15 dá 40.
- **Negativas** não mudam: `base × hab / negativeDivisor`.
- `parseCatalog` valida a tabela: chaves 11 a 15, valores crescentes e o 11 maior que 20 (o valor do 10).
- Interface: campos de -10 a 15; barras proporcionais a 15. Nas prévias dos postos ("+4,0 Ferro por dia"), destaque visual leve para níveis acima de 10, já que é "nível herói".

## 2. Atributos de aventura: Força, Destreza e Poder Mágico, de -10 a 20

- Cada NPC ganha **Força** (`strength`), **Destreza** (`dexterity`) e **Poder Mágico** (`magic`), de **-10 a 20**. São atributos de aventura e combate; as habilidades de trabalho continuam até 15.
- Modelo: `npc.attributes: { strength?, dexterity?, magic? }`, opcional; ausente = 0. Saves antigos continuam válidos, sem migração. A lista fica em `src/data/attributes.json` (id, nome, ícone), como o `skills.json`.
- **Onde aparecem:**
  - nos formulários **Novo NPC** e **Editar** (só o mestre), numa seção "Atributos";
  - **ficam ocultos** no card do NPC, na lista do painel e no seletor de NPCs do quadro de missões. Só voltam a aparecer no Editar.
  
  `npc_create` e `npc_update` aceitam `attributes`.

## 3. Atributos aceleram as missões da Guilda

**Pontos de um atributo:**
- até 10, o próprio valor (negativos também: -10 vale -10);
- acima de 10, explosivo, pela tabela em `missions.json`:

  ```json
  "attributePointsAbove10": { "11": 13, "12": 17, "13": 23, "14": 30, "15": 40,
                              "16": 53, "17": 70, "18": 92, "19": 121, "20": 160 }
  ```

**Pontos da equipe** = soma dos pontos dos três atributos de **todos os NPCs enviados** (mais NPCs, mais rápido).

**Dias da missão:**

```
dias = ceil( prazo × K / (K + M × pontos) ),  com K = 160 e M = 3  (em missions.json)
```

- Mínimo de **1 dia** (`"minDays": 1`).
- Com pontos negativos, a missão demora no máximo o **dobro** do prazo (`"maxSlowdown": 2`). Limite o denominador para isso; não deixe dividir por zero nem por número negativo.
- Conta em inteiros: `ceil(a / b)` como `Math.floor((a + b - 1) / b)`.

**Conferência obrigatória** (vira teste), para uma missão de 10 dias:

| Equipe | Pontos | Dias |
|---|---|---|
| ninguém com atributos | 0 | 10 |
| 1 NPC com 20 pontos (ex.: 7/7/6) | 20 | 8 |
| 2 NPCs assim | 40 | 6 |
| 3 NPCs assim | 60 | 5 |
| **4 NPCs assim** | **80** | **4** |
| 1 herói 15/15/15 | 120 | 4 |
| 1 deusa 20/20/20 | 480 | 1 |
| 1 NPC -10/-10/-10 | -30 | 20 (limite do dobro) |

- O tempo é **calculado na saída** e gravado em `returnsOnDay`. Editar atributos depois não muda missões em andamento.
- **No primeiro plano da missão**, ao marcar os NPCs, mostre só o resultado: "Retorno previsto em **4 dias** (prazo da missão: 10)". **Nunca** mostre os atributos nem os pontos.
- Missões feitas pelo **grupo** não mudam.

## Testes

- Rendimento: habilidade 10, 11, 12, 13, 14 e 15 pela tabela (15 = 4× o 10), negativos iguais aos de hoje, recusa de 16 e de -11.
- Atributos: criar e editar; saves sem `attributes`; recusa fora de -10..20.
- Missões: **toda a tabela de conferência acima**, o arredondamento para cima, o mínimo de 1 dia e o limite do dobro.
- Editar atributos não muda missão em andamento.
- A interface não mostra atributos fora do Editar.
- Paridade com a Edge Function.

## Publicação (o jogo está no ar)

Muda regras e schema no servidor, então precisa de `npm run deploy:functions` e do novo build do site. Não precisa de `db push`. Diga a ordem segura (a função primeiro, aceitando NPCs com e sem `attributes` e habilidades até 15) e recomende exportar o save antes.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
