# Prompt: escolher o ícone e a aparência de um cultivo

```
Contexto: projeto "clash", branch master (crie uma branch feat/estufa-aparencia antes de mexer).
No jardim da Estufa de Ervas (src/ui/garden/), o ícone de cada cultivo é sorteado: cropLook(seedId)
em src/ui/garden/sceneLayout.ts tira de um hash do seedId se a planta é "folhagem" ou "flor" e uma
cor (hue), e cropIcon() em GardenScene.ts desenha leaf0 ou flower3 com essa cor. Esse ícone aparece
na bandeja de sementes, no balão de "pronta", no fantasma ao arrastar, nos ícones que voam ao colher
e nos chips "Colhido" e "Sementes no estoque" (GardenWindow.ts). Exemplo do problema: a semente
"tulipa" saiu como um trevo de folhas, e o mestre não tem como trocar.

Quero que o mestre possa escolher como cada cultivo aparece, em duas camadas:

## 1. Foto do material (sem mudar dados)
Os materiais já têm `icon` e já aceitam foto pelo set_image (kind 'material', MaterialsPanel).
- Se o material tiver ícone/foto, o jardim usa essa imagem no lugar do sprite sorteado:
  - chips de "Sementes no estoque" e cartões da bandeja de sementes → ícone do material SEMENTE;
  - balão de "pronta", ícones que voam ao colher e chips de "Colhido" → ícone do material COLHEITA.
- Sem ícone no material, continua o sprite com a cor (comportamento de hoje).
- Use o mesmo caminho de imagem do resto do jogo (thumb()/resolveImage em src/ui/widgets.ts e
  GameImages para uploads com URL assinada); não duplique a lógica. Fotos enviadas carregam
  depois: mostre o sprite enquanto isso.
- A planta DESENHADA nos canteiros continua sendo os sprites (a foto é só para ícones).

## 2. Aparência da planta no formulário do cultivo (CropForm)
Na aba Cultivos (só o mestre), o formulário ganha uma seção "Aparência":
- Tipo: "Folhagem" ou "Flor".
- Cor da flor: uns 8 a 10 botões de cor prontos (a pré-visualização é o próprio sprite com
  hue-rotate) + um controle deslizante para ajuste fino. Desabilitado em "Folhagem".
- Pré-visualização ao vivo: o ícone e um tufo crescido como aparecem no jardim.
- Opção "Automática" (padrão), que mantém o sorteio de hoje.
Dados:
- Campo opcional novo no cultivo: `look?: { kind: 'foliage' | 'flower'; hue: number }`
  (hue inteiro de -180 a 180) em cropBase (src/model/schema.ts). Ausente = automático, então saves
  antigos continuam válidos sem migração.
- garden_crop_create / garden_crop_update passam a aceitar o campo (validação no schema do comando).
- cropLook passa a receber o cultivo (ou o look opcional) e só cai no hash quando não há look.
  Atualize todos os chamadores e os testes (sceneLayout.test.ts, CropForm.test.ts, Garden.test.ts).

## Restrições
- Textos em pt-BR em t.garden (src/i18n/pt-BR.ts).
- Acessibilidade: botões de cor com aria-label do nome da cor e aria-pressed; foco visível.
- Rodar npm test, npm run typecheck, npm run lint e prettier nos arquivos tocados.
- Atualize docs/plans/ESTUFA.md (campo look, de onde vem cada ícone).
- Deploy: como o schema do cultivo muda, a ordem é `npm run deploy:functions` e depois o site
  (merge no master). Sem migration SQL. Anote isso no ESTUFA.md.
- Commits locais pequenos, sem push.

Antes de codar, me mostre um plano curto com os arquivos que vai alterar e um esboço da seção
"Aparência" do formulário.
```
