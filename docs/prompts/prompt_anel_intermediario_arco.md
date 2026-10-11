# Prompt — Espaços do anel intermediário em arco

Projeto em `C:\Users\Perdido\.antigravity\clash`. Leia o código antes, me mostre o plano em poucas linhas e espere meu ok. Faça um commit por parte.

## Contexto

Os espaços do anel intermediário (`middle`) eram quadrados pequenos, de cerca de 111 px no mapa de 2048. Eu os redesenhei como **arcos que acompanham a circunferência**, iguais em conceito aos da muralha, mas maiores. O novo layout já está em **`src/data/layout.v4.json`**, gerado pelo planejador `docs/art-pipeline/axis_anel_intermediario.html`: 8 arcos de 33°, raio central 0,247 e profundidade 0,054, ou seja, de r = 0,220 a 0,274. **Substitua o `src/data/layout.json` por ele** (renomeando) como parte desta tarefa. Até lá, o jogo continua usando a v3. Ele vem com `"version": 4`, e cada slot `middle` fica assim:

```json
{ "id": "mid_1", "type": "middle", "x": 0.5, "y": 0.214, "angle": 0,
  "shape": "arc", "arc": { "innerRadius": 0.241, "outerRadius": 0.331, "startAngle": -15, "endAngle": 15 } }
```

Em `rings.middle` vêm os parâmetros: `count`, `shape`, `radius`, `depth`, `span` e `rotation`.

## O que fazer

1. **Schema (`src/map/layout.ts`):**
   - Aceitar `version: 4`.
   - Slots `middle` podem ter `shape: "arc"` (com `arc`) **ou** `shape: "square"` (com `size`).
   - Atualizar o schema de `rings.middle` para os dois formatos.
   - Manter a compatibilidade de leitura com a v3, se for barato. Se não for, aceitar só a v4.
2. **Geometria (`src/map/geometry.ts`):** todas as funções que fazem `switch (slot.type)` (contorno, área de clique, tamanho do sprite, caixa) devem decidir pelo **formato** (`shape`), não pelo tipo. Um `middle` em arco se comporta igual a um `outer`: desenho da fundação, clique exato no setor anelar e caixa da arte.
3. **Arte (`src/map/buildingArt.ts`):**
   - Construções em espaço `middle` em arco usam `public/assets/buildings/<id>.middle.png` (com `.lv2` e `.lv3`).
   - Essa arte é encaixada, girada e recortada **exatamente como a dos arcos da muralha**, mas com as medidas do arco do slot `middle`.
   - Os efeitos (`fx`) também valem para esses slots.
4. **Molde de arte do arco intermediário:**
   - Gere `docs/art-templates/middle_arc_mask.png` e `middle_arc_guide.png` a partir do layout, como os de `outer`.
   - Largura de **768 px** e altura proporcional ao arco.
   - A orientação também é a de um espaço no Norte: borda externa (a mais distante do centro) no **topo**, frente voltada para o disco azul **embaixo**.
   - Se existir um script em `docs/art-pipeline/scripts/gerar_molde_arco.py`, generalize-o para os dois anéis.
5. **Dados:** as construções que hoje só aceitam `middle` (Biblioteca, Santuário) continuam com `["middle"]`. A Enfermaria e a Estação de Estudo continuam com `["middle", "outer"]`. As artes `.middle.png` atuais são quadradas e ficam como placeholder até eu fazer as novas.
6. **Saves:** se um save tiver uma construção num `mid_N` que não existe mais (por exemplo, se eu reduzir a quantidade), remova essa construção ao carregar e registre no log. Não deixe o jogo quebrar.
7. **Testes:** clique dentro e fora de um arco intermediário, tamanho e orientação da arte num arco intermediário e validação do layout v4.
8. **README:** atualize a tabela de formatos de arte com a linha do arco intermediário e as dimensões do molde.

Ao terminar, rode typecheck, lint, testes e build, e me diga as dimensões finais do molde `middle`.
