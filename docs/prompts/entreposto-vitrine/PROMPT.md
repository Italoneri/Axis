# Prompt: redesign da vitrine do Entreposto

Imagens nesta pasta:
- `docs/prompts/entreposto-vitrine/referencia-barraca.png`: referência visual (inspiração, não cópia).
- `docs/prompts/entreposto-vitrine/estado-atual.png`: como a janela está hoje (visão do mestre), com os erros de enquadramento.

---

```
Contexto: projeto "clash", branch feat/entreposto-comercio. A janela "Entreposto — Comércio"
(src/ui/shop/ShopWindow.ts + src/ui/shop/shopViews.ts, estilos no fim de src/ui/ui.css, seção
"Entreposto: Comércio") está funcional, mas visualmente pobre e com erros de enquadramento.
Quero refazer a vitrine com foco na VISÃO DO JOGADOR, sem mudar regras de negócio
(src/systems/Shop.ts, comandos, servidor e SQL ficam intocados).

Abra e olhe as duas imagens antes de começar:
- docs/prompts/entreposto-vitrine/estado-atual.png  (como está hoje)
- docs/prompts/entreposto-vitrine/referencia-barraca.png  (a referência de estilo)

## 1. Corrigir os erros de enquadramento (bugs)
- O botão "Novo item" (this.toolbar, um `.row` entre as abas e o `.menu__body`) está colado
  na borda esquerda e na linha das abas, sem padding. Dê a ele o mesmo respiro horizontal das
  abas/corpo (16px) e um espaçamento vertical, ou mova-o para o header/linha das abas,
  alinhado à direita.
- Nos cartões do mestre, a linha de botões "Comprar / Vender / Promoção" ultrapassa a borda do
  cartão (o "Promoção" vaza para fora). Nenhum botão pode sair do cartão em nenhuma largura,
  inclusive no mobile (regra já existente em @media do .dialog--menu/.menu__grid).
- Os cartões não ocupam a largura disponível de forma equilibrada (3 cartões e um vazio enorme à
  direita). Ajuste a grade da loja para tiles menores e mais numerosos por linha.

## 2. Nova vitrine para o jogador (referência: uma "barraca de mercador" de jogo)
Inspiração, não cópia: tiles quadrados, ícone grande no centro, preço logo abaixo,
botão de comprar fixo na base do tile, todos dentro de uma moldura de barraca/balcão.
Manter a identidade atual do jogo (tokens em :root: --gold, --surface-raised, --font-display
Cinzel, --font-body Alegreya Sans, fundo escuro). Nada de laranja chapado nem cartoon.

- Moldura: o corpo da loja vira um "balcão do mercador" — uma placa/letreiro no topo com o
  nome do Entreposto, e a área dos itens com fundo de madeira/couro escuro feito em CSS
  (gradientes, bordas internas, sombra). Se quiser textura, pode usar o que já existe em
  public/assets/textures; não baixe imagens novas.
- Tile do item (`.shop-card`) para o jogador:
  - quadrado (aspect-ratio 1 para a área da imagem), largura ~150–170px na grade;
  - imagem/ícone grande ocupando o topo do tile, sobre um "nicho" com leve brilho dourado;
  - nome abaixo (uma linha, ellipsis), preço em destaque dourado com o ícone da moeda
    (public/assets/icons/coin_bronze.png, coin_silver.png, coin_gold.png...) em vez de só texto;
  - estoque discreto (badge pequeno no canto: "∞" ou o número);
  - botão Comprar ocupando a largura da base do tile;
  - promoção: faixa/selo diagonal no canto com "−25%", preço antigo riscado acima do novo;
  - esgotado: tile dessaturado, selo "Esgotado" sobre a imagem, botão desabilitado;
  - hover/focus: leve elevação e borda dourada; foco de teclado visível.
- Placeholder sem foto: hoje aparece um círculo com a inicial ("M", "F", "A"), que fica pobre.
  Troque por um placeholder temático (ex.: ícone public/assets/icons/materials.png para
  materiais e um ícone genérico para equipamento), mantendo o fallback de inicial só como último
  recurso. Ajuste via `thumb()` em src/ui/widgets.ts sem quebrar os outros usos dele.
- "Vender" (nível 3) para o jogador: botão secundário pequeno sob o Comprar, só quando existir
  (já controlado por onSell).
- Faixa do "mercador de passagem" (itens featured): destaque visual próprio no topo do balcão
  (ex.: uma prateleira de cima com brilho/letreiro "Mercador de passagem"), usando os mesmos tiles.
- Abas Tudo / Básicos / Raros: manter, mas estilizadas como placas penduradas ou etiquetas
  combinando com o balcão.

## 3. Visão do mestre
- O mestre continua vendo a mesma vitrine, mas os controles extras (Promoção, Editar, Remover)
  NÃO podem ficar como uma fileira de botões grandes. Coloque-os como uma barra de ações
  compacta (botões só-ícone com aria-label/title, ou um menu "⋯" no canto do tile) que aparece
  no tile sem alterar seu tamanho. "Remover" continua usando confirmButton.
- Marcas "libera no Nv X" e "oculto" viram badges sobre a imagem do tile.

## Restrições
- Textos novos em pt-BR em src/i18n/pt-BR.ts (atualize src/i18n/pt-BR.test.ts se ele cobrir as chaves).
- Não alterar shopCardModel nem a API de ShopCardContext além do necessário; se mudar,
  atualize src/ui/shop/shopViews.test.ts. Testes de lógica existentes devem continuar passando.
- Acessibilidade: a grade continua <ul>/<li>, botões reais, contraste legível, foco visível,
  imagens decorativas com alt="".
- Responsivo: no mobile (≤ 600px) 2 tiles por linha sem rolagem horizontal.
- CSS só na seção da loja em ui.css (ou um arquivo próprio importado do mesmo jeito que o resto);
  não alterar estilos globais de .menu__grid/.dialog--menu que a Taverna usa — crie classes
  específicas (ex.: .shop-grid, .dialog--shop).
- Rodar: npm test, lint/tsc do projeto e prettier nos arquivos tocados.
- Commit local ao terminar (sem push), seguindo o estilo dos commits da branch
  (ex.: "style: redesign the entreposto storefront").

Antes de codar, me mostre um plano curto (estrutura do DOM do tile e da moldura + lista de
classes CSS) para eu aprovar.
```
