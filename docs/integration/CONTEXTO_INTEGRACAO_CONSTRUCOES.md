# Contexto: integração das construções no jogo da Axis

Documento de passagem para um chat cujo trabalho é **receber os zips de arte das construções** (feitos em outro chat) e **integrá-los ao código**: imagens de cada nível, efeitos animados e definição da construção. Este chat **não cria arte** e **não faz mudanças grandes de código**. Mudanças de sistema vão para o Claude Code, na forma de prompt.

---

## 1. O projeto

- **Pasta:** `C:\Users\Perdido\.antigravity\clash`, com Phaser 3, TypeScript, Vite e Vitest. Os dados são validados com zod.
- **O jogo:** o Ítalo é o mestre de uma mesa de RPG. Os jogadores constroem a base deles na **Axis**, um salão circular com muralha, 8 portões de prismas, espaços em arco encostados na muralha (`outer`), um anel intermediário (`middle`) e o Coração no centro (`core`).
- **Papéis:**
  - O **Claude Code** altera o código de sistema, a partir de prompts salvos em `docs/prompts/`.
  - O **chat de arte** produz os zips (contexto em `docs/art-pipeline/CONTEXTO_ASSETS_AXIS.md`).
  - **Este chat** integra os zips: arquivos de imagem, `buildings.json`, `assets.json` e a validação.

---

## 2. Estado atual (conferir no projeto antes de agir)

| Construção | id | Slots | Arte no jogo |
|---|---|---|---|
| Forja | `forge` | outer | `forge.outer.png` (nível 1) + 4 fx |
| Fontes Termais | `hot_springs` | outer | `.outer.png`, `.outer.lv2.png`, `.outer.lv3.png` + 8 fx (com `minLevel`/`maxLevel`) |
| Laboratório Arcano | `arcane_lab` | outer | `.outer.png`, `.lv2`, `.lv3` + 8 fx (com cor na fumaça e nas faíscas) |
| Coração da Axis | `axis_heart` | core | placeholder |
| Enfermaria | `infirmary` | middle, outer | placeholder |
| Biblioteca | `library` | middle | placeholder |
| Santuário | `sanctuary` | middle | placeholder |
| Arsenal, Quartel | `armory`, `barracks` | outer | placeholder |

### Transição do anel intermediário

- O jogo usava o `src/data/layout.json` **v3**, com os espaços `middle` em quadrados pequenos.
- O **v4** (`src/data/layout.v4.json`) transforma esses espaços em **arcos**: r = 0,220 a 0,274, abertura de ±16,5°, molde de **768×311**.
- O Claude Code está aplicando essa mudança pelo prompt `docs/prompts/prompt_anel_intermediario_arco.md`.
- **Antes de integrar arte `middle`, confira** se o `layout.json` já está na versão 4 e se o código aceita `shape: "arc"` em `middle` (`src/map/layout.ts`). Se ainda não aceitar, a arte pode ser instalada, mas não aparece no jogo. Avise o Ítalo.

### Outros pendentes

- `docs/prompts/prompt_bug_recursos.md`: valores de ouro absurdos na barra superior. É um bug de sistema, para o Claude Code.

---

## 3. O que o jogo espera

### Arquivos de imagem (`public/assets/buildings/`)

| Slot | Nome | Tamanho | Orientação |
|---|---|---|---|
| `outer` | `<id>.outer.png` | 768×506, RGBA | como se estivesse no espaço Norte: **muralha (borda externa) no topo**, frente para baixo |
| `middle` (v4) | `<id>.middle.png` | 768×311, RGBA | borda externa no topo, frente para o disco azul, embaixo |
| `core` | `<id>.core.png` | 512×512, RGBA | — |

- **Níveis:** `<id>.<slot>.lv2.png` e `<id>.<slot>.lv3.png`. Sem a imagem de um nível, o jogo usa o maior nível existente abaixo dele.
- **Placeholder:** o `<id>.png` simples é o placeholder gerado. Não apague.
- **Moldes:** `docs/art-templates/outer_arc_mask.png` e `middle_arc_mask.png`. Fora do molde, a arte deve ser transparente.

### Definição da construção (`src/data/buildings.json`)

É uma lista de objetos, em formato **compacto** (Prettier com `printWidth` 100). Campos:

```json
{
  "id": "hot_springs",
  "name": "Fontes Termais",
  "description": "…",
  "icon": "icon.hot_springs",
  "sprite": "building.hot_springs",
  "allowedSlots": ["outer"],
  "fx": [ … ],
  "requires": [{ "building": "library", "minLevel": 1 }],
  "levels": [
    { "cost": { "coins": 140, "materials": { "wood": 60, "iron": 12 } }, "buildTime": 3, "effect": "…" },
    { "cost": { … }, "buildTime": 5, "effect": "…", "requires": [{ "building": "axis_heart", "minLevel": 1 }] },
    { "cost": { … }, "buildTime": 8, "effect": "…", "requires": [{ "building": "axis_heart", "minLevel": 2 }] }
  ]
}
```

- **`coins`** é o valor em ouro (PO).
- **`materials`** usa ids de `src/data/materials.json` (por exemplo `iron`, `wood`, `aetherium`, `mithril`, `adamantine`). Confira os ids existentes.
- **Padrão de dificuldade:** os níveis 2 e 3 costumam exigir o Coração da Axis nos níveis 1 e 2.
- **Os zips às vezes vêm com `"slots"`.** O campo certo é **`"allowedSlots"`**.

### Efeitos (`fx`), validados pelo `buildingFxSchema` em `src/model/schema.ts`

Os efeitos são **uma lista única**, com coordenadas **na arte** (0–1, origem no canto superior esquerdo).

| `type` | Campos |
|---|---|
| `glow` | `x`, `y`, **`color`** (obrigatório, `#rrggbb`), **`radius`** (fração da largura da arte) |
| `smoke` | `x`, `y`, `color` opcional (padrão cinza) |
| `sparks` | `x`, `y`, `color` opcional (padrão laranja; o jogo mistura com tons mais claros) |

Qualquer tipo aceita ainda `minLevel` e `maxLevel`, ambos opcionais.

**Conversões frequentes:**
- Um zip com `{ "lv1": [...], "lv2": ["…tudo do lv1, mais:", ...] }` vira uma lista única. Os itens do nível 2 ganham `"minLevel": 2`, os do nível 3 ganham `"minLevel": 3`, e as strings de texto são descartadas.
- Arquivos separados por nível (`<id>.outer.lv2.fx.json` etc.): compare os níveis. O que aparece em todos fica sem limite. O que surge num nível ganha `minLevel`. O que **some** num nível acima ganha `maxLevel`.
- Quando um zip muda a arte de formato (por exemplo, de quadrado para arco), as coordenadas de `fx` precisam ser **recalculadas** para a arte nova, e o `radius` reescalado.

### Construção nova

Além da entrada no `buildings.json`:
1. Em `src/data/assets.json`, dentro de `"images"`, acrescente `"icon.<id>": "assets/icons/<id>.png"` e `"building.<id>": "assets/buildings/<id>.png"`.
2. Gere os placeholders (ícone e sprite simples) com `npx tsx scripts/gen-placeholders.ts`. Ele só cria os que faltam.
3. Se a arte usar um asset com licença que exige atribuição, acrescente uma entrada em `src/data/credits.json`.

---

## 4. Procedimento de integração (passo a passo)

1. **Descompacte o zip numa pasta vazia e isolada**, sem rodar nada que venha dentro dele. Use `python3 -I` para ler e inspecionar.
2. **Inspecione:**
   - nomes dos PNGs;
   - tamanho, modo RGBA e transparência fora do molde;
   - a orientação, olhando a imagem.
   - Se vierem **só scripts, sem PNG**, rode-os com os insumos de `docs/art-pipeline/` (texturas e renders) ou peça os PNGs ao Ítalo.
3. **Gere uma prévia** com `docs/art-pipeline/scripts/preview_no_mapa.py`, usando o layout, a `base_mapa_v4_1600.jpg`, a arte, a saída e os slots, em 2 ou 3 espaços. **Mostre ao Ítalo** junto com a imagem dos níveis lado a lado.
4. **Converta e valide o `fx`** para o formato da seção 3.
5. **Copie os PNGs** para `public/assets/buildings/`.
6. **Edite o `buildings.json` sem reformatar o arquivo inteiro.**
   - **Não** use `json.dump` no arquivo todo: isso expande o formato compacto e gera um diff enorme.
   - Insira ou substitua só o trecho da construção, como texto no estilo compacto, e rode `npx prettier --write src/data/buildings.json`.
   - O `git diff --stat` deve mostrar poucas linhas.
7. **Valide.** Typecheck, lint, testes e build devem passar.
8. **Relate ao Ítalo:** o que entrou, os efeitos por nível, os valores que você **inventou** (custos e efeitos, se o zip não trouxe) e o que está pendente.

### Armadilhas do ambiente (importante)

- **`node_modules` é do Windows.** No shell Linux do computador do Ítalo, `tsc`, `eslint` e `prettier` funcionam direto na pasta. Já `vitest`, `vite build` e `tsx` falham (binários nativos do rolldown e esbuild). Para testar e fazer o build, use um **clone Linux fora da pasta**:
  ```bash
  mkdir -p $HOME/work && cd $HOME/work && [ -d clash ] || git clone -q "$HOME/mnt/clash" clash
  cd $HOME/work/clash && git fetch -q "$HOME/mnt/clash" HEAD && git checkout -q -f FETCH_HEAD && npm ci --no-audit --no-fund
  # copie para o clone os arquivos alterados ou novos (git status na pasta real) e rode:
  npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
  ```
  Placeholders gerados no clone (`npx tsx scripts/gen-placeholders.ts`) devem ser copiados de volta para a pasta real.
- **Não faça commit pelo shell remoto.** Sem permissão de apagar arquivos, o git deixa arquivos `.lock` em `.git`, e depois os comandos git do Ítalo falham. O Ítalo faz os commits.
- **Não use `git checkout <arquivo>` para desfazer.** Ele também falha sem permissão de apagar. Para restaurar um arquivo, use `git show HEAD:<arquivo> > <arquivo>`.
- **Para enviar arquivos do container para a pasta do Ítalo,** grave-os em `/mnt/user-data/outputs/` e use a ferramenta de commit de arquivos no dispositivo, com o caminho Windows completo.
- **Pasta `"Claude outputs/"` no projeto:** é do Ítalo, não mexa.

---

## 5. Referências no projeto

| Caminho | Conteúdo |
|---|---|
| `docs/art-pipeline/CONTEXTO_ASSETS_AXIS.md` | contexto do chat de arte (estilo, moldes, formato de entrega) |
| `docs/art-pipeline/scripts/preview_no_mapa.py` | prévia de uma arte em arco nos espaços indicados |
| `docs/art-pipeline/scripts/gerar_moldes.py` | gera os moldes a partir de um `layout.json` |
| `docs/art-pipeline/base_mapa_v4_1600.jpg` | fundo para as prévias |
| `docs/art-pipeline/exemplos/` | artes finais já integradas, como referência |
| `docs/prompts/` | prompts do Claude Code (feitos e pendentes) |
| `README.md` | seções de assets, formatos e `fx` |
| `src/model/schema.ts` | schemas zod das construções e do `fx` |
| `src/map/layout.ts`, `src/map/buildingArt.ts` | layout, slots e resolução da arte por formato e nível |

---

## 6. Histórico das integrações (como exemplo)

- **Fontes Termais:**
  - A primeira entrega trouxe só o nível 2, sem efeitos de nível nem custos. Inventei os 3 níveis no padrão da Enfermaria.
  - A segunda trouxe os 3 níveis e os `fx` por nível em arquivos separados. A lanterna do meio do nível 2 some no nível 3, e daí surgiu o `maxLevel` (pequena mudança de código, com teste).
- **Laboratório Arcano:**
  - Veio **só com scripts**, no formato do quadrado pequeno (256 px), e com `fx` agrupado por nível e com cor na fumaça e nas faíscas.
  - Rodei os scripts com os insumos locais. A pedido do Ítalo, **adaptei a arte para o arco da muralha** (`compose_lab_outer.py`), recalculei as coordenadas dos `fx` e mudei `allowedSlots` para `["outer"]`.
  - Para as cores, acrescentei `color` opcional em `smoke`/`sparks` (`src/scenes/fxColors.ts`, com testes).
