# Contexto: assets de construções da Axis

Documento de passagem para continuar a criação dos assets das construções em outro chat. Ele resume o que o jogo é, as decisões já tomadas e o passo a passo de como a **Forja**, a primeira construção aprovada, foi feita.

---

## 1. O projeto

- **O que é:** um mini jogo de construção de base, no navegador, para a mesa de RPG do Ítalo. Os personagens dos jogadores vivem na **Axis**, um salão circular enorme de mármore negro com veios dourados, cercado por uma muralha de pedra com 8 portões.
- **Código:** `C:\Users\Perdido\.antigravity\clash`, com Phaser 3, TypeScript e Vite. Quem escreve o código é o Claude Code, a partir de prompts. Este chat de assets **só produz imagens** e, quando for preciso, prompts para o Claude Code.
- **O mapa é gerado por código** a partir de `src/data/layout.json` (geometria) e `src/data/theme.json` (visual), com três texturas: chão Tiles075, muralha Stone Wall 23 e veios dourados vindos do mármore Freepik do autor kjpargeter.
- **Coordenadas:** normalizadas de 0 a 1 sobre um quadrado. Ângulo 0 = Norte, sentido horário.

### Espaços de construção (`layout.json` v3)

| Tipo | Qtd | Formato | Observação |
|---|---|---|---|
| `core` | 1 | círculo (raio 0,092) | centro, Coração da Axis |
| `middle` | 8 | quadrado (lado 0,054) | anel intermediário, raio 0,248 |
| `outer` | 14 | **arco** encostado na muralha | raio interno 0,358, externo 0,44, abertura de cerca de 17,04° (±8,52°) |

- Não há espaços dentro do disco azul além do `core`.
- Os ids `outer_11` e `outer_12` não existem. Entre SO e O (229,74° a 265,26°) há uma **porta secreta**: não desenhe nada ali.
- **Portões**, a partir do Norte em sentido horário: Roxo, Verde, Branco, Laranja, Azul, Preto, Vermelho e Amarelo. Cada um tem um prisma colorido.

### Construções e onde podem ficar (`buildings.json`)

| id | Nome | Slots permitidos | Status da arte |
|---|---|---|---|
| `forge` | Forja | outer | ✅ **v1 aprovada** |
| `axis_heart` | Coração da Axis | core | a fazer |
| `infirmary` | Enfermaria | middle, outer | a fazer |
| `library` | Biblioteca | middle | a fazer |
| `armory` | Arsenal | outer | a fazer |
| `sanctuary` | Santuário | middle | a fazer |
| `watchtower` | Torre de Vigia | outer | a fazer |
| `barracks` | Quartel | outer | a fazer |
| `arcane_lab` | Laboratório Arcano | middle | a fazer |
| `study_station` | Estação de Estudo | middle, outer | a fazer |

---

## 2. Decisões de estilo (já tomadas)

1. **Visual realista e texturizado**, no mesmo tom do mapa (mármore negro, pedra e ouro). Foi testado contra o Kenney Fantasy Town Kit recolorido, e o Ítalo achou a versão realista "absurdamente melhor".
2. **Ver de longe não é problema.** A Axis é enorme, e o jogador dá zoom. A prioridade é a riqueza de detalhe.
3. **Kenney descartado** para as construções. O *Medieval RTS* também não serve, porque os prédios mostram a fachada em perspectiva e ficariam de cabeça para baixo quando girados nos espaços do sul. O *Castle Kit* pode servir no máximo como peça de apoio.
4. **Vista estritamente de cima** (ortográfica), porque o jogo gira cada sprite conforme o ângulo do espaço.
5. **Linguagem visual comum** entre as construções:
   - Dourado da Axis: `#E2B84A`. Dourado escuro: `#966F28`.
   - Cumeeira e contornos dourados ligam cada construção ao mapa.
   - Sombra projetada para baixo e à direita (deslocamento de cerca de 6 a 7 px, blur 5).
   - Brasas e brilhos laranja (cerca de `#FF7A1A`) quando faz sentido.
6. **Preferir licença CC0** (Poly Haven, ambientCG, ShareTextures). Licenças com atribuição devem ir para `src/data/credits.json`.

---

## 3. Formato de entrega (o que o jogo espera)

| Slot | Arquivo | Tamanho | Orientação |
|---|---|---|---|
| `outer` | `public/assets/buildings/<id>.outer.png` | **768×506**, PNG transparente | desenhado para o espaço **Norte**: **muralha no topo**, frente (pátio) voltada **para baixo**, que é o centro da Axis |
| `middle` | `public/assets/buildings/<id>.middle.png` | 256×256 | frente voltada para o centro |
| `core` | `public/assets/buildings/<id>.core.png` | 512×512 | — |

- **Variações por nível (opcional):** `<id>.outer.lv2.png`, `<id>.outer.lv3.png`.
- **Molde do arco:** `outer_arc_mask.png` (máscara) e `outer_arc_guide.png` (guia), nesta pasta e em `docs/art-templates/` no projeto. **Toda arte `outer` termina recortada por essa máscara.**
- **Efeitos animados** (fumaça, brilho, faíscas) não são desenhados no PNG. Vão no campo `fx` do `buildings.json`, com coordenadas **na imagem** (0–1, origem no canto superior esquerdo). O jogo anima e gira.
- **Prompt pendente:** existe um prompt pronto para o Claude Code implementar o recorte em arco, os níveis e o `fx` (`docs/prompts/prompt_topbar_e_sprites.md` no projeto). Confirmar com o Ítalo se ele já rodou esse prompt antes de depender dessas funções.

### Geometria do molde `outer`, em pixels da arte

- Escala: `sc = 768 / (2·0,44·sin 8,52°) ≈ 5890,7 px` por unidade normalizada.
- O centro do círculo do mapa fica em `(384, 0,44·sc ≈ 2591,9)`, muito abaixo da imagem.
- Um ponto `(raio r, ângulo a relativo ao centro do espaço)` vira `x = 384 + r·sc·sin a` e `y = 2591,9 − r·sc·cos a`.
- Profundidade útil: de r = 0,358 (frente) a 0,44 (muralha), cerca de 483 px no eixo radial do centro.

---

## 4. Como a Forja foi feita (receita)

### 4.1 Ferramentas

- **Python + Pillow + NumPy** para compor tudo. Rode qualquer script que leia arquivos baixados com `python3 -I`.
- **Blender como módulo Python**, para fotografar modelos 3D de cima:
  ```bash
  python3.13 -m venv bvenv && ./bvenv/bin/pip install bpy   # bpy 5.2 exige Python 3.13
  ./bvenv/bin/python -I scripts/render_topdown.py -- <arquivo.blend> <saida.png> 512
  ```
  O `render_topdown.py` abre o `.blend`, remove câmeras e luzes, enquadra todos os meshes com uma câmera **ortográfica de cima**, coloca um sol suave mais luz ambiente e renderiza em Cycles na CPU (48 amostras) com **fundo transparente**. Um objeto leva de 6 a 8 s.

### 4.2 Assets usados (todos CC0)

| Elemento | Fonte | Observação |
|---|---|---|
| Telhado | ambientCG **RoofingTiles013A** (2K-JPG, Color) | a textura tem uma mancha amarela. Use só o recorte `[:900, :900]`, **dessature** e aumente o contraste ×2,2 |
| Barris | Poly Haven **wooden_barrels_01** (.blend 2K) | o .blend traz várias peças soltas. Os dois barris inteiros vistos de cima estão nos recortes `(110,60,225,175)` e `(370,60,480,175)` do render 512 px |
| Caixote | Poly Haven **wooden_crate_01** (.blend 2K) | render direto |
| Fornalha | ShareTextures **Brazier 3** | o zip veio **só com texturas, sem modelo 3D**. Use a basecolor como metal de uma bacia redonda feita por código |
| Pedra do pátio e da chaminé | ShareTextures **Stone Wall 23** (a mesma da muralha) | dessaturada para um cinza quente |
| Bigorna | **feita por código** | não foi achada bigorna 3D CC0. É o elemento mais fraco: substituir se aparecer um modelo |

### 4.3 Composição (`scripts/compose_forja.py`)

A construção ocupa o arco inteiro, dividido em duas faixas:

1. **Oficina coberta (fundo, contra a muralha):** de r = 0,394 a 0,44.
   - Textura do telhado **mapeada em coordenadas polares** (u = ângulo × raio, v = raio), para as fileiras de telha acompanharem a curva.
   - **Duas águas:** cumeeira no meio da faixa. A água de trás fica a 62% do brilho, e o brilho cai em direção às bordas (`1,15 − 0,45·dist`), o que dá volume.
   - **Cumeeira dourada** (linha em arco de 5 px, `#E2B84A`), beiral e laterais em dourado escuro (3 px).
   - Sombra do beiral projetada sobre o pátio, com blur 6.
2. **Pátio (frente, voltado ao centro):** de r = 0,358 a 0,394.
   - Piso de pedra em coordenadas polares, com uma linha dourada fina na borda frontal.
3. **Objetos**, com a função `paste(img, r, ângulo, tamanho)`. Cada um é girado por `−ângulo` para ficar alinhado à curva e ganha sombra projetada.
   - **Chaminé** de pedra (96 px), com a boca em brasa e um halo laranja sobre o telhado.
   - **Fornalha** (112 px): bacia de metal com carvões em brasa aleatórios.
   - **Bigorna** (116 px) com faíscas.
   - **Caixote** (112 px) e **2 barris** (60 e 56 px).
4. **Recorte final** pela máscara `outer_arc_mask.png`, com alpha = mínimo entre o alpha da arte e a máscara.
5. **Prévia no mapa** (`scripts/preview_no_mapa.py`): escala a arte para o mapa de 1600 px, posiciona o centro do círculo no centro do mapa e gira por `−ângulo do slot`. Testado em `outer_1`, `outer_7` e `outer_13`, para conferir a rotação.

### 4.4 Efeitos sugeridos para a Forja (`fx`, coordenadas na arte)

```json
"fx": [
  { "type": "smoke",  "x": 0.239, "y": 0.191 },
  { "type": "glow",   "x": 0.239, "y": 0.191, "color": "#ff7a1a", "radius": 0.08 },
  { "type": "glow",   "x": 0.419, "y": 0.747, "color": "#ff7a1a", "radius": 0.07 },
  { "type": "sparks", "x": 0.612, "y": 0.713 }
]
```

Os pontos são, na ordem: chaminé, fornalha e bigorna.

---

## 5. Conteúdo desta pasta

| Arquivo | Para quê |
|---|---|
| `CONTEXTO_ASSETS_AXIS.md` | este documento |
| `layout.json` | layout v3 (igual ao `src/data/layout.json` do projeto) |
| `outer_arc_mask.png`, `outer_arc_guide.png` | molde do arco 768×506 |
| `base_mapa_1600.jpg` | prévia do mapa completo (texturas e portões), usada como fundo nas prévias |
| `exemplo-forja/forge.outer.png` | **Forja v1 aprovada**, a referência de qualidade e estilo |
| `exemplo-forja/forja_no_mapa.jpg` | a Forja aplicada em 3 espaços |
| `exemplo-forja/render_barris.png`, `render_caixote.png` | renders de cima já prontos, reaproveitáveis |
| `scripts/render_topdown.py` | render ortográfico de cima de qualquer `.blend` (bpy) |
| `scripts/compose_forja.py` | composição completa da Forja (receita reaproveitável) |
| `scripts/preview_no_mapa.py` | aplica uma arte `outer` em espaços do mapa para conferir |
| `scripts/gerar_molde_arco.py` | gera o molde a partir do `layout.json` |

**Atenção:** os scripts têm caminhos fixos da sessão anterior (`/tmp/.../scratchpad`, `/mnt/user-data/outputs/...`). Ajuste no topo de cada um antes de rodar: a pasta das texturas `tex/`, a pasta dos assets `forge/`, o `layout.json`, a máscara e a base do mapa (`prism.jpg` = `base_mapa_1600.jpg`).

---

## 6. Fluxo para a próxima construção

1. Combinar com o Ítalo o **conceito** da construção: o que fica no telhado, o que fica no pátio e o que muda por nível.
2. Listar os **assets CC0 necessários**, com links. O Ítalo baixa e manda. Este ambiente não deve baixar sozinho.
3. Renderizar os modelos 3D de cima com `render_topdown.py`.
4. Compor no molde certo (arco, quadrado ou círculo), seguindo a linguagem visual da seção 2.
5. Gerar a prévia no mapa, mandar ao Ítalo e iterar.
6. Entregar o PNG final com o nome `<id>.<slot>.png`, o `fx` sugerido e os créditos novos, se houver.

**Ordem sugerida:** as outras construções de muralha primeiro, reaproveitando a receita da Forja (Arsenal, Quartel, Torre de Vigia), depois as do anel intermediário e por último o Coração da Axis.
