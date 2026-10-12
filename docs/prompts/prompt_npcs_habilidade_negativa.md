# Prompt — Habilidades negativas (NPCs que atrapalham)

Projeto em `C:\Users\Perdido\.antigravity\clash`. Hoje cada habilidade de NPC vai de **0 a 10**, e o pior caso é render só a base. Quero que um NPC possa **atrapalhar de verdade**. Exemplo: um ferreiro desastrado na Forja nv. 1 **gasta 2 de Ferro por dia** em vez de produzir.

Tudo continua passando por `GameCommand` / `applyCommand`, sem aleatoriedade, igual offline e online. No final, rode `npm run build:functions` e `npm run parity`.

Leia `docs/plans/NPCS.md`, `src/systems/Npcs.ts`, `src/systems/NpcWork.ts`, `src/systems/BonusSystem.ts`, `src/ui/SlotNpcs.ts` e `src/ui/resources/NpcPanel.ts`. Depois me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte e atualize `docs/plans/NPCS.md` e o README (seção NPCs).

## Regra

- **Escala:** cada habilidade vai de **-10 a 10** (`skillLevelSchema`). Ausente continua valendo 0.
- **Rendimento:**
  - **habilidade ≥ 0:** continua `base × (1 + hab/10)`, sem mudança;
  - **habilidade < 0:** `base × hab / 5`. Com -10, o resultado é `-2 × base`; com -5, `-1 × base`; com -1, `-0,2 × base`.
  - O divisor `5` fica configurável em `src/data/npcs.json` (ex.: `"negativeDivisor": 5`), validado no `npcsConfigSchema`.
  - Continua em décimos inteiros (`yieldTenths`) para a conta ficar exata.
- **Fração acumulada (`carry`):** passa a aceitar sinal, de -9 a 9. Por dia, `décimos = rendimento + carry`, entregam-se `Math.trunc(décimos / 10)` unidades e o resto, com sinal, fica no `carry`. Trocar de posto ou editar as habilidades do NPC zera o `carry`.
- **Efeitos negativos, por tipo:**
  - `produce`: **consome** o material do estoque, sem deixar a quantidade abaixo de 0. Se o estoque zerar, o resto é perdido e a fração é descartada.
  - `research`: **faz a pesquisa regredir**, sem passar de 0%. Se ela estava em 100%, cai, e o destaque "pronta para concluir" some.
  - `construction`: **atrasa a obra** (`completesOnDay += unidades`), sem limite.
  - `bonus`: o posto ganha um texto opcional `penalty` no JSON. Com algum trabalhador de habilidade negativa no posto, Bônus ativos mostra o `penalty` (marcado como penalidade) em vez do `text`. Sem `penalty`, o bônus simplesmente não aparece. Proponha textos de penalidade para Taverna, Enfermaria e Santuário.
- **Vários NPCs no mesmo posto:** cada um conta separado, então um bom e um ruim se compensam.
- Salário, moradia, status e liberações não mudam.

## Dados e save

- `skills` do NPC aceita valores negativos. O `cleanFields` hoje descarta `level <= 0`; passe a descartar só o 0.
- O log `npc_worked` aceita `amount` negativo (inteiro diferente de 0), e o `tallyLog` passa a filtrar `amount !== 0`.
- **Sem nova versão de save:** os campos só ficam mais permissivos, então saves antigos continuam válidos. Confirme isso com um teste do `parseSave`.

## Textos (pt-BR)

- Log: "Gus **estragou 2 Ferro**", "Gus **fez a pesquisa 'Runas' regredir 2%**", "Gus **atrasou a obra** de Forja em 2 dias".
- Prévia do posto e Bônus ativos: "-2,0 Ferro por dia", "obra atrasada em 1,0 dia por dia" e assim por diante, destacando o valor negativo (cor de alerta do tema).

## Interface

- **Formulário do NPC:** os campos de habilidade vão de -10 a 10, e o `clampSkill` acompanha.
- **Barras de habilidade:** valores negativos aparecem em vermelho. Por exemplo, a barra cresce para a esquerda a partir do centro, ou fica vermelha com o número negativo. Escolha o que ficar mais legível.
- **Seletor do posto (`SlotNpcs`):** os negativos ficam no fim da lista (a ordem atual já faz isso) e o rótulo avisa: "Gus (-6) · -1,2 Ferro por dia ⚠ atrapalha".
- **Filtro "Habilidade" no painel de NPCs:** hoje mostra só quem tem `> 0`. Mantenha assim, mas ordene do melhor ao pior.

## Testes

- Fórmula: -10, -5, -1, 0 e 10, com base inteira e fracionária.
- `carry` negativo ao longo de vários dias, e zerado ao trocar de posto ou editar.
- `produce` negativo com estoque suficiente, insuficiente e zerado.
- Pesquisa caindo de 100% e parando em 0%.
- Obra atrasando.
- Bônus com e sem `penalty`.
- Um bom e um ruim no mesmo posto.
- Recusa de habilidade -11 e 11 (`invalid_command`).
- Determinismo e paridade com a Edge Function.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
