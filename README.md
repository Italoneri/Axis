# Axis — Base Builder

Mini jogo de construção de base para navegador, feito para a mesa de RPG. O grupo gasta moedas e materiais ganhos nas sessões para erguer e melhorar estruturas na **Axis**, o salão circular que serve de base do grupo.

Stack: **Phaser 3 + TypeScript + Vite**, interface em HTML/CSS sobre o canvas, testes com **Vitest**.

> Status: **Fase 2 (ferramentas do mestre)**. Supabase e deploy entram nas próximas fases.

## Como rodar

Requer Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Comando                           | O que faz                                      |
| --------------------------------- | ---------------------------------------------- |
| `npm run dev`                     | Servidor de desenvolvimento                    |
| `npm test`                        | Testes (regras do jogo + validação dos JSON)   |
| `npm run lint` / `npm run format` | ESLint / Prettier                              |
| `npm run build`                   | Checagem de tipos + build estático em `dist/`  |
| `npm run gen:placeholders`        | Gera os PNGs placeholder que ainda não existem |

## Como jogar

- **Scroll** dá zoom, **arrastar** move o mapa.
- Clique num espaço livre para ver as estruturas permitidas, com custo, tempo e efeito. As que não podem ser construídas aparecem desabilitadas, com o motivo.
- Clique numa estrutura para ver o efeito atual, melhorar de nível ou acompanhar a construção.
- Clique num recurso da barra superior (**Ouro**, **Materiais**, **Pesquisa**, **Influência**) para abrir o painel com os detalhes. Ele fecha ao clicar fora, com Esc ou clicando de novo no recurso.
- **Registro e bônus** abre a gaveta com os **Bônus ativos** (todos os efeitos em vigor, para consultar na sessão) e o **Registro** de eventos.
- **Créditos**, na barra superior, lista as texturas de terceiros e as licenças.
- O progresso fica salvo no navegador (`localStorage`). Use **Exportar save** para guardar um backup em JSON e **Importar save** para restaurá-lo.

## Modo Mestre

1. Copie `.env.example` para `.env` e defina `VITE_MASTER_PASSWORD`. Sem essa variável, o Modo Mestre fica desativado.
2. Reinicie `npm run dev`, clique em **Mestre** e digite a senha. A sessão de mestre dura até fechar a aba ou clicar em **Sair do modo mestre**.

> ⚠️ **A senha não é segura.** Variáveis `VITE_` são embutidas no JavaScript publicado, então qualquer pessoa com o link consegue lê-la no código da página. Até a Fase 3 (validação no servidor com Supabase), isso só serve para separar a interface do mestre, não para proteger nada. Não reutilize uma senha que você usa em outro lugar.

O que o mestre pode fazer:

- **Tempo:** avançar N dias. As construções que ficam prontas nesse intervalo são concluídas, com o dia certo registrado no log.
- **Personagens:** cadastrar, editar e remover os personagens do grupo (aba **Mestre**). Um personagem só pode ser removido com a carteira vazia.
- **Recursos:** moedas, materiais, pesquisas e influência são editados nos próprios painéis da barra superior. Os controles de edição só aparecem no Modo Mestre (veja [Recursos](#recursos)).
- **Estruturas:** ao clicar num espaço do mapa, aparece o cartão **Mestre**. Nele você pode forçar qualquer estrutura permitida em qualquer nível (sem custo nem pré-requisito), concluir uma construção na hora ou remover a estrutura (é preciso clicar duas vezes para confirmar).
- **Visual do mapa:** aba da gaveta com um controle deslizante por parâmetro do tema. Cada mudança regenera o mapa na hora; **Exportar theme.json** baixa o arquivo para colocar em `src/data/` (veja [Mapa](#mapa)).

Todas as ações do mestre vão para o registro de eventos.

### Regras

- Cada estrutura existe **uma vez** na Axis (os bônus não acumulam).
- O custo é cobrado ao **iniciar** a construção. O bônus só vale quando ela termina.
- Durante uma melhoria, o efeito do nível anterior continua ativo.
- O **Coração da Axis** (espaço central) libera os níveis mais altos: nível 2 das outras estruturas exige o Coração nv. 1, e nível 3 exige o Coração nv. 2.
- Os efeitos são **cumulativos**: uma estrutura nv. 3 dá os efeitos dos níveis 1, 2 e 3.

## Recursos

A barra superior mostra quatro recursos. Jogadores só **visualizam**. Criar, editar e remover itens e quantidades é exclusivo do Modo Mestre.

Os valores iniciais ficam em JSON em `src/data/` (o _seed_). Tudo o que o mestre muda em jogo vive no estado salvo (`GameState`), que entra no export/import de save. Se o navegador tiver um save de formato antigo, ele é descartado e o jogo começa do seed.

### Ouro (moedas)

| Moeda     | Valor em ouro | Valor em bronze |
| --------- | ------------- | --------------- |
| Esmeralda | 100           | 10.000          |
| Platina   | 10            | 1.000           |
| Ouro      | 1             | 100             |
| Prata     | 0,1           | 10              |
| Bronze    | 0,01          | 1               |

- As moedas ficam em `src/data/currencies.json` (`id`, `name`, `icon`, `bronzeValue`, `order`). A escala pode mudar ali sem mexer na lógica. É obrigatório existir a moeda `gold` (unidade dos custos) e uma moeda com `bronzeValue: 1` (garante troco exato).
- Toda carteira guarda **a quantidade de cada moeda**. As contas são feitas em inteiros de bronze.
- Há uma carteira por personagem e a do **Acampamento** (o cofre do grupo). Só o Acampamento paga construções e melhorias. A barra mostra o total do Acampamento em PO.
- **Jogadores:** em **Ver detalhes**, cada personagem tem o botão **Depositar no Acampamento**. As moedas entram nas mesmas denominações, sem conversão.
- **Mestre:** cada carteira tem **Ajustar** (dar ou remover moedas) e **Consolidar** (troca moedas pequenas pelas maiores possíveis). No fim do painel fica **Transferir entre carteiras**, que também permite retirar do Acampamento.
- **Pagamento:** o custo em PO vira bronze e sai do Acampamento usando primeiro as moedas menores. Quando elas não fecham o valor, uma moeda maior é quebrada e o troco volta em moedas menores. Sem saldo, o painel mostra quanto falta e quanto o grupo tem nas carteiras pessoais.
- As carteiras iniciais e os personagens de exemplo ficam em `src/data/wallets.json`.

### Materiais

- O seed fica em `src/data/materials.json`: `categories` (`id`, `name`) e `items` (`id`, `name`, `category`, `icon?`, `description?`, `quantity`).
- O painel tem uma aba por categoria. Clique num material para ver a descrição.
- **Mestre:** **+/−** com a quantidade informada, **Editar** (nome, categoria, ícone e descrição), **Remover** (clique duas vezes para confirmar), **Novo material nesta categoria** e o cartão **Categorias**, para criar, renomear e remover categorias (só as vazias).
- O `id` de um material novo é gerado a partir do nome (`Pedra da Lua` → `pedra_da_lua`). É esse id que os custos das estruturas usam.
- O `icon` aceita uma chave do `assets.json` ou uma URL de imagem. Sem ícone, aparece um círculo com a inicial.

### Pesquisa

- O seed fica em `src/data/research.json`: `categories` e `entries`. Cada pesquisa tem `id`, `title`, `category`, `status` (`em_andamento` com `progress` de 0 a 100, ou `concluida` com `completedOnDay` opcional), `startedOnDay?`, `owner?` (texto livre), `description`, `notes` e `cost?`. O custo é só informativo e nunca é descontado.
- A barra mostra "X concluídas · Y em andamento". O painel tem as abas **Em andamento** e **Concluídas**.
- **Mestre:** **Nova pesquisa** (inclusive pesquisas antigas, já concluídas), **Editar**, **Concluir** (marca como concluída no dia atual), **Remover** e as categorias.
- **Estação de Estudo:** depois de construída, o painel lateral dela ganha o **Arquivo de Pesquisas**, com as fichas completas, filtro por status e categoria e busca por título. Antes disso, o painel da barra mostra a lista resumida com uma dica.

### Influência

- O seed fica em `src/data/influence.json`: `total` (0–100) e `worlds` (`id`, `name`, `color`, `icon?`, `description?`, `influence`).
- A influência total e a de cada mundo são **independentes**: o total não é calculado a partir dos mundos, e os mundos não precisam somar 100%.
- **Mestre:** **−/+** ou o campo numérico ajustam cada valor (sempre entre 0 e 100). Os mundos podem ser cadastrados, editados e removidos.

### Formato de custo nas estruturas

```json
"cost": { "coins": 150, "materials": { "iron": 20, "wood": 40 } }
```

- `coins` é o valor em **ouro** e aceita frações, como `12.5`.
- `materials` usa os `id`s do catálogo de materiais. Se um material não existir no catálogo atual, o requisito aparece como **indisponível** e a construção fica bloqueada, sem quebrar o jogo.

### Registro

Toda alteração de recurso, seja do mestre, de um depósito ou de uma construção, gera uma entrada no registro. Exemplos: "Dia 14 — Thorin depositou 3 Platina e 12 Ouro no Acampamento" e "Dia 20 — Influência em Valdren: 35% → 42%".

## Estrutura

```
src/
  main.ts            monta UI + jogo
  store.ts           estado atual, persistência e eventos (camada imperativa)
  model/             schemas (zod) e tipos, carregamento/validação do catálogo
  map/               mapa gerado por código: layout, geometria, veios, gerador, portões, tema
  systems/           regras puras: Build, Coins, Wallets, Materials, Research, Influence,
                     Characters, Time, Save, Master, Bonus (+ testes)
  scenes/            Boot, Preload, Base, SlotView, CameraController
  ui/                barra superior e painéis de recursos (ui/resources), painel do espaço,
                     gaveta (bônus/registro/mestre), login, save, CSS
  i18n/pt-BR.ts      todos os textos da interface
  data/              buildings.json, layout.json, theme.json, credits.json, assets.json,
                     currencies.json e os seeds
                     wallets.json, materials.json, research.json, influence.json
scripts/             gerador de placeholders
public/assets/       textures/, buildings/, icons/
docs/map-reference/  imagem e scripts de referência do mapa
art-sources/         originais das texturas (fora do git)
```

## Como adicionar uma estrutura nova

1. Adicione um objeto em `src/data/buildings.json`:

   ```json
   {
     "id": "stables",
     "name": "Estábulos",
     "description": "Baias e feno para as montarias do grupo.",
     "icon": "icon.stables",
     "sprite": "building.stables",
     "allowedSlots": ["outer"],
     "requires": [{ "building": "barracks", "minLevel": 1 }],
     "levels": [
       {
         "cost": { "coins": 120, "materials": { "wood": 50, "iron": 30 } },
         "buildTime": 2,
         "effect": "Montarias comuns custam metade."
       },
       {
         "cost": { "coins": 300, "materials": { "wood": 100, "iron": 60 } },
         "buildTime": 4,
         "effect": "Viagens a partir da Axis levam 1 dia a menos.",
         "requires": [{ "building": "axis_heart", "minLevel": 1 }]
       }
     ]
   }
   ```

   - `allowedSlots`: `core` (centro), `middle` (os 8 quadrados em volta do disco azul) e/ou `outer` (os arcos junto à muralha).
   - `requires` no nível de cima vale para **todos** os níveis; dentro de um nível, só para aquele nível.
   - `buildTime` é em dias de jogo (`0` = imediato). Pode haver quantos níveis você quiser.
   - O `cost` segue o [formato de custo](#formato-de-custo-nas-estruturas).

2. Registre as imagens em `src/data/assets.json`:
   ```json
   "icon.stables": "assets/icons/stables.png",
   "building.stables": "assets/buildings/stables.png"
   ```
3. Rode `npm run gen:placeholders` para gerar as imagens provisórias (ou coloque a arte final nesses caminhos).
4. Rode `npm test`. Se algum JSON tiver erro (id repetido, recurso inexistente, asset faltando, pré-requisito apontando para estrutura que não existe), o teste diz exatamente onde. O jogo também mostra o erro na tela em vez de abrir em branco.

## Como trocar os assets

Todas as imagens são carregadas pelo manifesto `src/data/assets.json` (chave → caminho dentro de `public/`). Para trocar um placeholder pela arte final, **substitua o arquivo** no mesmo caminho ou aponte a chave para um arquivo novo. `npm run gen:placeholders` nunca sobrescreve arquivos existentes (só com `-- --force`).

| Asset                    | Caminho                             | Formato                    | Tamanho              | Observações                                                                                                        |
| ------------------------ | ----------------------------------- | -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Placeholder de estrutura | `public/assets/buildings/<id>.png`  | PNG com fundo transparente | 256×256 (ou 512×512) | quadrado centralizado no espaço; usado enquanto não houver [arte final](#arte-final-das-estruturas) para o formato |
| Ícone de estrutura       | `public/assets/icons/<id>.png`      | PNG com fundo transparente | 64×64 (ou 128×128)   | usado no painel                                                                                                    |
| Ícone de recurso         | `public/assets/icons/<recurso>.png` | PNG com fundo transparente | 64×64                | ícones da barra (`icon.gold`, `icon.materials`, `icon.research`, `icon.influence`); aparecem pequenos (18–26 px)   |
| Ícone de moeda           | `public/assets/icons/coin_<id>.png` | PNG com fundo transparente | 64×64                | um por moeda de `currencies.json`                                                                                  |

O tamanho com que cada estrutura aparece no mapa vem do próprio espaço no `layout.json` (veja [Mapa](#mapa)). As texturas do mapa estão na seção [Trocar texturas](#trocar-texturas).

### Arte final das estruturas

A arte final tem um arquivo por **formato de espaço**, e não precisa ser cadastrada no `assets.json`: basta colocar o PNG em `public/assets/buildings/` com o nome certo (o `npm run dev` recarrega a página sozinho). Enquanto um formato não tiver arte, o jogo usa o placeholder quadrado.

| Tipo de slot | Formato             | Arquivo                                   | Tamanho | Orientação da arte                                                                                  |
| ------------ | ------------------- | ----------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `outer`      | arco (setor anelar) | `public/assets/buildings/<id>.outer.png`  | 768×506 | desenhada como no espaço **Norte**: muralha no **topo**, frente voltada para baixo (centro da Axis) |
| `middle`     | quadrado            | `public/assets/buildings/<id>.middle.png` | 256×256 | frente voltada para baixo (centro da Axis)                                                          |
| `core`       | círculo             | `public/assets/buildings/<id>.core.png`   | 512×512 | —                                                                                                   |

- **Arcos:** a imagem é escalada para a caixa do arco (calculada a partir do `layout.json`), girada pelo ângulo do espaço e recortada pela forma exata do arco. O molde está em `docs/art-templates/outer_arc_mask.png` (máscara) e `outer_arc_guide.png` (guia).
- **Quadrados:** a imagem gira para a frente apontar para o centro. Como os quadrados do mapa não giram, nos espaços diagonais a arte encolhe para caber (até 71%).
- **Círculo:** a imagem é recortada pelo círculo do Coração.
- **Níveis (opcional):** `<id>.outer.lv2.png`, `<id>.outer.lv3.png`… O jogo usa a arte do nível atual ou, se não existir, a do nível mais próximo abaixo.
- **Em construção:** aparece a arte do nível-alvo a 35% de opacidade, com um tracejado dourado de andaime e a barra de progresso.

#### Efeitos animados (`fx`)

Fumaça, brilho e faíscas não vão no PNG: ficam no campo opcional `fx` da estrutura em `src/data/buildings.json`. As coordenadas são **na imagem de arte** (0–1, com `0,0` no canto superior esquerdo); o jogo converte para o mapa já com a rotação do espaço.

```json
"fx": [
  { "type": "smoke", "x": 0.239, "y": 0.191 },
  { "type": "glow", "x": 0.239, "y": 0.191, "color": "#ff7a1a", "radius": 0.08 },
  { "type": "sparks", "x": 0.612, "y": 0.713, "minLevel": 2 }
]
```

| `type`   | Efeito                                    | Campos extras                                                  |
| -------- | ----------------------------------------- | -------------------------------------------------------------- |
| `smoke`  | partículas cinza subindo e se dispersando | —                                                              |
| `glow`   | luz pulsante                              | `color` (hex `#rrggbb`) e `radius` (fração da largura da arte) |
| `sparks` | faíscas curtas em momentos aleatórios     | —                                                              |

- Os efeitos só aparecem com a construção **concluída** e com arte final no formato do espaço.
- `minLevel` (opcional) mostra o efeito só a partir daquele nível.
- O número de partículas vivas no mapa inteiro é limitado (menos no celular). Com "reduzir movimento" ligado no sistema, só os brilhos aparecem, parados.

#### Testar arte nova sem mudar o jogo

No modo Mestre, aba **Visual do mapa** → **Pré-visualizar construção**: escolha a construção, o nível e o espaço. Ela aparece ali só na tela, sem mexer no save. **Limpar pré-visualização** (ou recarregar a página) desfaz.

## Mapa

O mapa não é mais uma imagem pronta: ele é **gerado por código** ao carregar o jogo, a partir de `src/data/layout.json` (a geometria), `src/data/theme.json` (o visual) e três texturas. O resultado de referência é `docs/map-reference/axis_preview.jpg`; os scripts Python da mesma pasta são a implementação original que o código em `src/map/` porta para TypeScript (eles não rodam no jogo).

### Como é gerado

As camadas estáticas são pintadas **uma vez** num canvas fora da tela e registradas como textura do Phaser:

1. Fundo cinza (`#2b2a2c`) fora do círculo.
2. Chão: `floor_tiles` repetido, com os veios dourados por cima.
3. Veios: máscara dos pixels dourados do `marble_gold` (matiz amarela, saturação > 0,25, brilho > 0,3, R > B), somada a cópias giradas (120° espelhada e 240°) e pintada na cor do ouro com ruído de brilho (glitter).
4. Muralha: `wall_stone` mapeada em coordenadas polares (as pedras seguem a curva), dessaturada para um cinza quente, com veios mais suaves.
5. Disco azul: o mármore em tons de cinza tingido de índigo, com os veios mantidos dourados.
6. Sombra interna junto à muralha.
7. Linhas douradas da muralha, do disco e do core.

Por cima ficam objetos normais do Phaser: as fundações dos espaços (arcos e quadrados translúcidos que brilham no hover), os **portões** (desenhados por código com as cores de `entrances.prisms`, com sombra e um halo que pulsa devagar) e as construções.

- **Resolução:** 2048 px no computador, 1024 px em celulares e telas pequenas (`src/map/textures.ts`).
- **Tempo:** cerca de 1,2 s em 2048 px e 0,45 s em 1024 px num PC; o tempo real aparece no console (`[map] …`) e na aba **Visual do mapa**.
- **Clique preciso:** arcos usam teste de setor anelar, quadrados um polígono e o core um círculo (`src/map/geometry.ts`, com testes).
- **Portões:** `BaseScene.setGateState(gateId, 'idle' | 'active' | 'off')` muda o brilho de um portão (`gateId` é o `id` do prisma, como `roxo`). Ainda não há nada no jogo que chame essa função.

### Editar o `layout.json`

Coordenadas e medidas são **normalizadas (0–1)** sobre um quadrado; ângulos em graus, com **0 = Norte** e sentido horário.

- `wall`: `outerRadius` e `thickness` da muralha.
- `entrances`: `angles` dos 8 portões, `width` da passagem e `prisms` (um por ângulo, na mesma ordem: `id`, `name`, `rgb` e, opcionalmente, `glow` e `edge`).
- `innerDisc.radius` e `core.radius`: o disco azul e o círculo central.
- `slots`: cada espaço tem `id`, `type` e `x`/`y` (centro, onde a construção aparece).
  - `core` (`shape: "round"`, `size` = diâmetro).
  - `middle` (`shape: "square"`, `size` = lado).
  - `outer` (`shape: "arc"`, com `arc.innerRadius`, `arc.outerRadius`, `arc.startAngle` e `arc.endAngle`).
- `reserved`: trechos da muralha onde nenhum espaço pode ficar. O trecho existe só nos dados: o mapa não desenha nada que o diferencie.

Os ids dos espaços são a chave das construções no save: **não renumere** (por isso eles pulam de `outer_10` para `outer_13`). O `npm test` acusa id repetido, espaço sobre um trecho reservado, estrutura cujo `allowedSlots` não tem espaço no layout e prismas em número diferente dos portões.

### Editar o `theme.json`

| Parâmetro                  | Faixa      | O que muda                                         |
| -------------------------- | ---------- | -------------------------------------------------- |
| `goldColor`                | cor hex    | cor dos veios (antes do glitter)                   |
| `floorVeins` / `wallVeins` | 0–1        | intensidade dos veios no chão e na muralha         |
| `veinCopies`               | 0–1        | densidade: força das cópias giradas (0 desliga)    |
| `discHueShift`             | −180 a 180 | tom do disco azul, em graus                        |
| `discBrightness`           | 0,3–2      | brilho do disco                                    |
| `wallDesaturation`         | 0–1        | quanto a pedra perde a cor original                |
| `wallWarmth`               | 0–3        | tom quente da pedra (0 = cinza neutro)             |
| `floorScale`               | 0,1–1      | fração do mapa que uma repetição do ladrilho cobre |
| `innerShadow`              | 0–1        | força da sombra junto à muralha                    |
| `prismGlow`                | 0–1        | intensidade do halo dos prismas                    |
| `prismPulseSeconds`        | 0,5–10     | duração de uma pulsação                            |

O jeito mais fácil é usar a aba **Visual do mapa** no Modo Mestre: mexa nos controles, clique em **Exportar theme.json** e substitua `src/data/theme.json` pelo arquivo baixado. No `npm run dev`, a mesma aba tem **Sobrepor a referência**, que mostra o `axis_preview.jpg` por cima do mapa com a opacidade escolhida.

### Trocar texturas

| Chave em `assets.json` | Arquivo                                  | Recomendação                                                  |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `texture.floor`        | `public/assets/textures/floor_tiles.jpg` | quadrada, até 2048 px, repetível                              |
| `texture.wall`         | `public/assets/textures/wall_stone.jpg`  | quadrada, 1024–2048 px, repetível                             |
| `texture.marble`       | `public/assets/textures/marble_gold.jpg` | quadrada, **2048 px** (com menos, os veios ficam serrilhados) |

Substitua o arquivo no mesmo caminho ou aponte a chave para outro. Os originais em alta resolução ficam em `art-sources/originals/` (fora do git). Se a nova textura tiver outra escala, ajuste `floorScale` no tema; a escala da pedra na muralha está em `src/map/mapGenerator.ts` (`WALL_TEXTURE_SPAN`). Ao trocar uma textura de terceiros, atualize `src/data/credits.json`.
