# Contexto: assets de construções da Axis (v2)

Documento de passagem para continuar a arte das construções em outro chat. Esta versão substitui a v1. Ela inclui a Forja, as Fontes Termais e o Laboratório Arcano, o anel intermediário redesenhado em arcos, os efeitos com cor e o formato exato de entrega.

---

## 1. O projeto

- **O que é:** um mini jogo de construção de base, no navegador, para a mesa de RPG do Ítalo. A **Axis** é um salão circular enorme de mármore negro com veios dourados, cercado por uma muralha de pedra com 8 portões de prismas coloridos.
- **Código:** `C:\Users\Perdido\.antigravity\clash`, com Phaser 3, TypeScript e Vite. Quem escreve o código é o Claude Code, por prompts. **Este chat de arte produz imagens, a definição de efeitos (`fx`) e, se for preciso, prompts.**
- **O mapa é gerado por código** a partir de `src/data/layout.json` e `src/data/theme.json`, com as texturas Tiles075 (chão), Stone Wall 23 (muralha) e o mármore preto com ouro da Freepik (veios dourados).
- **Coordenadas:** normalizadas de 0 a 1 sobre um quadrado. Ângulo 0 = Norte, sentido horário.

---

## 2. Espaços de construção

> ⚠️ **Transição em andamento.** O jogo ainda usa o **layout v3**, em que o anel intermediário são 8 quadrados pequenos (111 px no mapa de 2048). O **layout v4**, com o anel intermediário em **arcos grandes**, já está pronto em `src/data/layout.v4.json`. O código passa a aceitá-lo quando o Ítalo rodar o prompt `docs/prompts/prompt_anel_intermediario_arco.md`. **Faça as artes novas para o v4.**

| Tipo | Qtd | Formato (v4) | Medidas |
|---|---|---|---|
| `core` | 1 | círculo, centro | raio 0,092 |
| `middle` | 8 (`mid_1`…`mid_8`) | **arco** | r = 0,220 a 0,274, abertura de 33° (±16,5°), centrados em 0°, 45°… (alinhados aos portões) |
| `outer` | 14 | **arco** encostado na muralha | r = 0,358 a 0,44, abertura de 17,04° (±8,52°) |

- Não há espaços dentro do disco azul além do `core`.
- `outer_11` e `outer_12` não existem. Entre SO e O (229,74° a 265,26°) há uma **porta secreta**: nada pode ser desenhado ali.
- **Portões**, a partir do Norte em sentido horário: Roxo, Verde, Branco, Laranja, Azul, Preto, Vermelho e Amarelo.

---

## 3. Construções

| id | Nome | Slots | Arte |
|---|---|---|---|
| `forge` | Forja | outer | ✅ nível 1 (`forge.outer.png`). Níveis 2 e 3 opcionais |
| `hot_springs` | Fontes Termais | outer | ✅ níveis 1, 2 e 3 |
| `arcane_lab` | Laboratório Arcano | outer | ✅ níveis 1, 2 e 3 (adaptado do formato pequeno para o arco da muralha) |
| `axis_heart` | Coração da Axis | core | a fazer |
| `infirmary` | Enfermaria | middle, outer | a fazer |
| `library` | Biblioteca | middle | a fazer |
| `sanctuary` | Santuário | middle | ✅ níveis 1, 2 e 3 |
| `armory` | Depósito | middle | ✅ níveis 1, 2 e 3 (era o Arsenal da muralha; saves antigos com ele num espaço outer continuam valendo) |
| `barracks` | Quartel | outer | a fazer |

O Ítalo vai criar **mais construções para o anel intermediário**. Os efeitos de nível e os custos ficam no `src/data/buildings.json`. Construção nova = arte + uma entrada nova nesse arquivo.

---

## 4. Decisões de estilo (fixas)

1. **Realista e texturizado**, no mesmo tom do mapa. O Kenney foi testado e descartado, e o Medieval RTS não serve por mostrar a fachada em perspectiva.
2. **Ver de longe não é problema.** A Axis é enorme e o jogador dá zoom, então a prioridade é o detalhe.
3. **Vista estritamente de cima** (ortográfica). O jogo gira cada sprite conforme o espaço.
4. **Linguagem comum:**
   - Dourado `#E2B84A`, dourado escuro `#966F28`, brasas `#FF7A1A`.
   - Contornos e cumeeiras douradas.
   - Sombra projetada para baixo e à direita.
   - Pedra Stone Wall 23 dessaturada para cinza quente nos pisos.
   - Ardósia RoofingTiles013A (dessaturada, contraste ×2,2) nos telhados.
5. **Licenças:** prefira **CC0** (Poly Haven, ambientCG, ShareTextures). Uma licença com atribuição exige uma entrada nova em `src/data/credits.json`.

---

## 5. Formato de entrega (o que o jogo espera)

### Arte

| Slot | Arquivo | Tamanho | Orientação |
|---|---|---|---|
| `outer` | `public/assets/buildings/<id>.outer.png` | **768×506** | como se estivesse no espaço Norte: **muralha (borda externa) no topo**, frente voltada para baixo (centro da Axis) |
| `middle` (v4) | `public/assets/buildings/<id>.middle.png` | **768×311** | igual: **borda externa no topo**, frente voltada para o **disco azul, embaixo** |
| `core` | `public/assets/buildings/<id>.core.png` | 512×512 | — |

- **Níveis:** `<id>.<slot>.lv2.png` e `<id>.<slot>.lv3.png`. Sem o arquivo do nível, o jogo usa o maior nível disponível abaixo dele.
- **Toda arte em arco termina recortada pelo molde** `templates/<slot>_arc_mask.png`. Use o guia `templates/<slot>_arc_guide.png` para orientação.
- **Geometria do molde:** `sc = 768 / (2·ro·sin(meia abertura))`. O centro do círculo do mapa fica em `(384, ro·sc)`. Um ponto `(r, a)`, com `a` medido a partir do centro do espaço, vira `x = 384 + r·sc·sin a` e `y = ro·sc − r·sc·cos a`.
  - outer: `sc ≈ 5890,7`
  - middle: `sc ≈ 4934,5`

### Efeitos (`fx`) — formato EXATO

Os efeitos são **uma lista única**, com coordenadas **na arte** (0–1, origem no canto superior esquerdo). Não agrupe por nível nem use texto do tipo "…tudo do lv1".

```json
"fx": [
  { "type": "smoke",  "x": 0.593, "y": 0.207, "color": "#7dffa0" },
  { "type": "glow",   "x": 0.5,   "y": 0.372, "color": "#9b6bff", "radius": 0.093 },
  { "type": "sparks", "x": 0.855, "y": 0.239, "color": "#b48cff", "minLevel": 2 },
  { "type": "glow",   "x": 0.659, "y": 0.303, "color": "#ffb347", "radius": 0.05, "minLevel": 2, "maxLevel": 2 }
]
```

| Campo | Regra |
|---|---|
| `type` | `smoke`, `glow` ou `sparks` |
| `color` | **obrigatório no `glow`**. Opcional em `smoke` (padrão cinza) e `sparks` (padrão laranja; a cor é misturada com tons mais claros) |
| `radius` | só no `glow`, como fração da **largura da arte** |
| `minLevel` / `maxLevel` | opcionais. Use `maxLevel` quando a arte de um nível acima substitui um detalhe (ex.: uma lanterna que some no nível 3) |

### Pacote de entrega para o Ítalo

Um zip contendo:

1. Os PNGs **finais**, prontos com o nome certo. **Não mande só scripts.**
2. Um `<id>.buildings.json` com `"allowedSlots"` (não `"slots"`) e o `fx` no formato acima. Se a construção for nova, inclua também nome, descrição e 3 níveis com `cost`, `buildTime`, `effect` e `requires`, no mesmo padrão das existentes.
3. Uma imagem de prévia no mapa e uma lado a lado dos níveis.
4. Os scripts usados, para reprodução.

---

## 6. Receita (como as três foram feitas)

### Ferramentas

- **Python, Pillow e NumPy** para a composição. Rode com `python3 -I`.
- **Blender como módulo Python**, para renderizar modelos 3D de cima:
  ```bash
  python3.13 -m venv bvenv && ./bvenv/bin/pip install bpy        # bpy 5.2 exige Python 3.13
  ./bvenv/bin/python -I scripts/render_topdown.py -- <arquivo.blend> <saida.png> 512
  ```
  O script usa câmera ortográfica de cima, sol suave e Cycles na CPU com 48 amostras, com fundo transparente.

### Padrão de composição, comum às três

1. **Coordenadas polares** para tudo que acompanha a curva: pisos, telhados e linhas douradas. Usa-se u = ângulo × raio e v = raio.
2. **Faixas radiais:** o fundo, junto da borda externa, guarda o prédio ou elemento principal. A frente, voltada para o centro, guarda o pátio com os objetos.
3. **Objetos** (`paste(img, r, ângulo, tamanho)`), girados por `−ângulo` para alinhar à curva e com sombra projetada.
4. **Recorte final** pela máscara do molde.
5. **Prévia** com `scripts/preview_no_mapa.py`, aplicada em 2 ou 3 espaços em ângulos diferentes para conferir a rotação.

### Específicos

- **Forja** (`scripts/forja/`):
  - Oficina coberta com ardósia em duas águas, cumeeira dourada e chaminé em brasa.
  - Pátio de pedra com fornalha, bigorna (feita por código), caixote e barris (renders do Poly Haven).
- **Fontes Termais** (`scripts/termas/`), feitas no outro chat:
  - Piscinas termais entre rochas e um deque de madeira.
  - O nível 2 acrescenta lanternas. O nível 3 acrescenta borda de mármore e jardim zen.
- **Laboratório Arcano** (`scripts/laboratorio/`):
  - Foi composto primeiro no formato pequeno (`compose_lab_middle_original.py`) e depois **adaptado** ao arco da muralha (`compose_lab_outer.py`).
  - A adaptação gera a torre octogonal numa camada separada, recorta, reduz e posiciona.
  - Ela também reposiciona mesa, caldeirão e cristais em coordenadas polares e redesenha o anel de runas do nível 3.
  - **Use esse método para converter qualquer arte entre formatos.**

### Armadilhas conhecidas

- **RoofingTiles013A** tem uma mancha amarela. Use o recorte `[:900, :900]` e dessature.
- **Brazier 3**, da ShareTextures, veio **sem modelo 3D**, só com texturas.
- **wooden_barrels_01**, do Poly Haven, traz peças soltas. Os barris inteiros vistos de cima já estão em `renders/barris.png`.
- **Não há bigorna 3D CC0 conhecida.** A atual é feita por código.
- Os scripts têm **caminhos fixos** das sessões em que foram feitos. Ajuste no topo antes de rodar.

---

## 7. Conteúdo desta pasta (`docs/art-pipeline/` no projeto)

| Caminho | Para quê |
|---|---|
| `CONTEXTO_ASSETS_AXIS.md` | este documento |
| `layout.v4.json` | **layout a usar** (anel intermediário em arcos) |
| `layout.v3.json` | layout atual do jogo, só como referência |
| `templates/outer_arc_mask.png`, `outer_arc_guide.png` | molde da muralha, 768×506 |
| `templates/middle_arc_mask.png`, `middle_arc_guide.png` | molde do anel intermediário (v4), 768×311 |
| `base_mapa_v4_1600.jpg` | mapa completo com texturas, portões e os contornos do v4, usado como fundo nas prévias |
| `exemplos/` | Forja, Termas (3 níveis) e Laboratório (3 níveis) finais, mais as imagens lado a lado dos níveis. **São a referência de qualidade** |
| `renders/` | barris, caixote, livros e candelabro já renderizados de cima, reaproveitáveis |
| `scripts/render_topdown.py` | render ortográfico de cima de um `.blend` |
| `scripts/gerar_moldes.py` | gera os moldes a partir de qualquer `layout.json` |
| `scripts/preview_no_mapa.py` | aplica uma arte em arco (outer ou middle) nos espaços indicados |
| `scripts/forja/`, `scripts/termas/`, `scripts/laboratorio/` | composição de cada construção |
| `axis_anel_intermediario.html` | planejador usado para desenhar o anel intermediário v4 |

---

## 8. Fluxo para a próxima construção

1. Combinar com o Ítalo o **conceito**: o elemento principal, o pátio e o que muda em cada nível.
2. Listar os **assets CC0 necessários**, com links. O Ítalo baixa e manda. Não baixe sozinho.
3. Renderizar os modelos 3D de cima.
4. Compor no **molde do slot certo**, seguindo a linguagem visual da seção 4.
5. Gerar a prévia no mapa e a imagem dos níveis lado a lado, mandar e iterar.
6. Entregar o pacote no formato da seção 5.

**Próximas sugeridas:**
- Para o anel intermediário (v4): Biblioteca, Santuário e as construções novas que o Ítalo vai inventar.
- Para a muralha: Quartel.
- Por último, o Coração da Axis.
