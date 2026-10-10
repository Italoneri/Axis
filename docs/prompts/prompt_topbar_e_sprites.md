# Prompt — Barra superior responsiva + sprites de construção encaixados nos espaços

Projeto em `C:\Users\Perdido\.antigravity\clash`, branch `feat/procedural-map`. Leia o código relacionado antes de começar, me mostre o plano em poucas linhas e espere meu ok. Faça um commit por parte.

## Parte 1 — Barra superior responsiva (bug)

A barra superior estoura a largura da tela: `scrollWidth` de 1727 px numa janela de 1400 px.
- Abaixo de cerca de 1500 px, o botão **Créditos** sai cortado.
- No celular (390 px), **Influência**, **Registro e bônus**, **Mestre** e **Créditos** ficam fora da tela e não há como alcançá-los.

**O que fazer:**
- A barra deve caber em qualquer largura, sem scroll horizontal na página.
- Em telas estreitas, os recursos ficam compactos: só o ícone e o número. O nome do recurso some, e o painel suspenso continua abrindo ao tocar.
- **Registro**, **Mestre** e **Créditos** vão para um menu **"☰"** quando não couberem.
- O indicador do dia continua visível.
- Teste em 390, 768, 1280 e 1920 px, e confira que todos os botões são alcançáveis em cada largura.

## Parte 2 — Sprites de construção encaixados no formato do espaço

Hoje cada construção é um sprite quadrado de 256×256 centralizado no espaço. Nos espaços da muralha, que são **arcos**, sobra espaço e o sprite não acompanha a curva. Vou começar a fazer a arte final, uma construção por vez, começando pela **Forja**. O jogo precisa estar pronto para isso.

### Formatos

| Tipo de slot | Formato | Arquivo de arte | Orientação da arte |
|---|---|---|---|
| `outer` | arco (setor anelar) | `public/assets/buildings/<id>.outer.png`, 768×506 | desenhada como se estivesse no espaço **Norte**: muralha no **topo** e frente voltada para baixo (centro da Axis) |
| `middle` | quadrado | `public/assets/buildings/<id>.middle.png`, 256×256 | frente voltada para o centro |
| `core` | círculo | `public/assets/buildings/<id>.core.png`, 512×512 | — |

O molde exato do arco está em `docs/art-templates/outer_arc_mask.png` (máscara) e `outer_arc_guide.png` (guia visual). Eles foram gerados a partir do `layout.json`: o arco tem cerca de 17° de abertura, do raio 0,358 ao 0,44.

### Renderização

- **Espaços `outer`:** a imagem é escalada para a caixa do arco, **girada pelo ângulo do slot** (para a muralha da imagem ficar sempre contra a muralha do mapa) e **recortada pela forma exata do arco**, com uma máscara geométrica. Calcule a caixa a partir do `layout.json`, sem números fixos.
- **Espaços `middle`:** a imagem é girada para a frente apontar para o centro.
- Se a arte de um formato não existir, use o placeholder atual, para nunca quebrar.
- **Variações por nível (opcional):** `<id>.outer.lv2.png`, `<id>.outer.lv3.png`. Use a do nível atual, ou a mais próxima abaixo dele se não existir.
- **Em construção:** mostre a arte do nível-alvo em baixa opacidade (cerca de 35%), com um padrão de andaime ou tracejado dourado por cima e a barra de progresso que já existe.
- Atualize o manifesto de assets para resolver esses caminhos automaticamente, sem eu precisar cadastrar cada arquivo.

### Efeitos animados por construção

Adicione ao `buildings.json` um campo opcional `fx`, uma lista de efeitos com coordenadas **na imagem de arte** (0–1, com 0,0 no canto superior esquerdo), convertidas para o mapa já com a rotação aplicada:

```json
"fx": [
  { "type": "smoke", "x": 0.30, "y": 0.22 },
  { "type": "glow",  "x": 0.30, "y": 0.22, "color": "#ff7a1a", "radius": 0.08 },
  { "type": "sparks", "x": 0.55, "y": 0.70 }
]
```

- `smoke`: partículas cinza subindo devagar e dispersando.
- `glow`: luz pulsante com a cor e o raio informados.
- `sparks`: faíscas curtas e ocasionais.
- Os efeitos só aparecem quando a construção está **concluída**.
- Permita filtrar efeitos por nível (`"minLevel": 2`).
- Limite o número de partículas para não pesar no celular.

### Ferramenta de pré-visualização (modo mestre)

Na aba **"Visual do mapa"**, adicione o seletor **"Pré-visualizar construção"**: escolho uma construção, um nível e um slot, e ela aparece ali **só visualmente**, sem mudar o estado do jogo. Isso me permite testar a arte nova em qualquer espaço antes de salvar. Um botão limpa a pré-visualização.

## Ao terminar

- Rode typecheck, lint, testes e build.
- Escreva testes para a conversão das coordenadas de `fx` (arte → mapa, com rotação) e para a escolha do arquivo por formato e nível.
- Atualize a seção de assets do README com a nova tabela de formatos e o campo `fx`.
- Me diga como testar a pré-visualização com a Forja.
