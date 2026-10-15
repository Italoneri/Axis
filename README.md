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
| `npm run lpc:setup`               | Clona o gerador LPC em `vendor/` (fora do git) |
| `npm run lpc:build -- <nome>`     | Gera o sprite de um NPC pela receita           |
| `npm run lpc:items -- <busca>`    | Lista peças, variantes e cores do gerador LPC  |

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

- Cada estrutura existe **uma vez** na Axis (os bônus não acumulam), exceto o **Alojamento**, que pode ter **até 4**, em espaços diferentes. O limite é o campo opcional `maxCount` do `buildings.json` (padrão 1, de 1 a 8), e os que estão em obra também contam. No limite, o motivo do bloqueio é "Limite de 4 Alojamentos na Axis"; nas únicas, continua "Já existe na Axis". O painel do espaço vazio mostra "2 de 4 construídos".
  - Cada Alojamento é independente: tem o próprio nível, a própria melhoria e a própria obra, e cada um paga o custo cheio.
  - Os efeitos de texto não acumulam: em Bônus ativos o Alojamento aparece uma vez, no maior nível entre eles, com "(3 Alojamentos)". Requisitos e outras checagens também olham o maior nível.
  - Cada cópia tem um nome estável, "Alojamento I" a "Alojamento XIV", pela posição do espaço entre os espaços do anel externo, na ordem do layout. O nome não muda quando outro Alojamento é construído ou removido. Ele aparece no título do painel, no seletor de moradia e no log de obra, melhoria, conclusão, remoção e mudança de moradia.
  - O mestre pode forçar até o limite. Forçar um Alojamento novo além de 4 é recusado ("Limite de cópias…"); remova um antes. Forçar outro nível num Alojamento que já existe continua livre. Assim o servidor nunca guarda mais cópias do que as regras aceitam.
- O custo é cobrado ao **iniciar** a construção. O bônus só vale quando ela termina.
- Durante uma melhoria, o efeito do nível anterior continua ativo.
- O **Coração da Axis** (espaço central) libera os níveis mais altos: nível 2 das outras estruturas exige o Coração nv. 1, e nível 3 exige o Coração nv. 2.
- Os efeitos são **cumulativos**: uma estrutura nv. 3 dá os efeitos dos níveis 1, 2 e 3.

## Recursos

A barra superior mostra quatro recursos. Jogadores só **visualizam**. Criar, editar e remover itens e quantidades é exclusivo do Modo Mestre.

Os valores iniciais ficam em JSON em `src/data/` (o _seed_). Tudo o que o mestre muda em jogo vive no estado salvo (`GameState`), que entra no export/import de save. Saves de formatos anteriores à versão 4 são descartados e o jogo começa do seed; a partir dela, cada formato novo vem com uma migração.

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
- O ícone pode ser uma foto enviada no jogo (veja [Fotos no jogo](#fotos-no-jogo)), uma chave do `assets.json` ou uma URL de imagem. Sem ícone, aparece um círculo com a inicial.

### Pesquisa

- O seed fica em `src/data/research.json`: `categories` e `entries`. Cada pesquisa tem `id`, `title`, `category`, `status` (`em_andamento` com `progress` de 0 a 100, ou `concluida` com `completedOnDay` opcional), `startedOnDay?`, `owner?` (texto livre), `description`, `notes` e `cost?`. O custo é só informativo e nunca é descontado.
- A barra mostra "X concluídas · Y em andamento". O painel tem as abas **Em andamento** e **Concluídas**.
- **Mestre:** **Nova pesquisa** (inclusive pesquisas antigas, já concluídas), **Editar**, **Concluir** (marca como concluída no dia atual), **Remover** e as categorias.
- **Biblioteca:** depois de construída (nv. 1), o painel lateral dela ganha o **Arquivo de Pesquisas**, com as fichas completas, filtro por status e categoria e busca por título. Antes disso, o painel da barra mostra a lista resumida com uma dica.

### Influência

- Os mundos são **fixos** e ficam em `src/data/influence.json` (`worlds`: `id`, `name`, `color`, `icon?`, `description?`), na ordem em que aparecem no jogo: Mundo Humano, Floresta dos Elfos, Bosque das Fadas, Montanhas Anãs, Reino dos Meio-Humanos, Terras Dracônicas e Terras Ínferas. Todos começam em 0%.
- O save guarda só a % de cada mundo e, se o mestre enviou, a foto dele (`worldIcons`). Nome, cor e descrição vêm sempre do JSON.
- A **influência total** não é editável: é a **média** das % dos mundos, mostrada com até 1 casa decimal (ex.: "42%", "37,1%").
- **Mestre:** **−/+** ou o campo numérico ajustam a % de cada mundo (sempre um inteiro entre 0 e 100). Não é possível criar nem remover mundos no jogo.
- Cada mudança entra no registro com o mundo e o novo total: "Dia 20 — Influência em Terras Dracônicas: 35% → 42% (total: 18,6%)".

### Formato de custo nas estruturas

```json
"cost": { "coins": 150, "materials": { "iron": 20, "wood": 40 } }
```

- `coins` é o valor em **ouro** e aceita frações, como `12.5`.
- `materials` usa os `id`s do catálogo de materiais. Se um material não existir no catálogo atual, o requisito aparece como **indisponível** e a construção fica bloqueada, sem quebrar o jogo.

### Registro

Toda alteração de recurso, seja do mestre, de um depósito ou de uma construção, gera uma entrada no registro. Exemplos: "Dia 14 — Thorin depositou 3 Platina e 12 Ouro no Acampamento" e "Dia 20 — Influência em Terras Dracônicas: 35% → 42% (total: 18,6%)".

## NPCs

Moradores e trabalhadores da Axis. O design completo está em `docs/plans/NPCS.md`.

- **Habilidades** em `src/data/skills.json` (`id`, `name`, `icon`, `description`): Construção, Ferraria, Gastronomia, Pesquisa, Medicina e Alquimia. Cada NPC tem de -10 a 15 em cada uma; negativo atrapalha o posto, e de 11 a 15 é "nível herói", com crescimento explosivo.
- **Atributos de aventura** em `src/data/attributes.json`: Força, Destreza e Poder Mágico, de -10 a 20 (ausente vale 0). Só o mestre os vê, na seção "Atributos" do **Novo NPC** / **Editar**; ficam ocultos no card, na lista e no quadro de missões. Servem para acelerar as missões da Guilda.
- **Moradia e postos** ficam por nível no `buildings.json`:

  ```json
  "housing": { "capacity": 4 },
  "jobs": [
    { "activity": "forjar", "name": "Forjar", "skill": "smithing",
      "effect": { "type": "produce", "material": "iron", "perDay": 2 } }
  ]
  ```

  Vagas por posto vêm do anel do espaço, pelo nível em vigor (`postSlots` em `src/data/npcs.json`): anel externo 3/6/8, anel interno 2/4/6. Reduzir o nível libera quem sobra.

  Moradia só no Alojamento (6/14/14 por nível, **por Alojamento**): `housingBuildings` em `src/data/npcs.json` lista as construções que podem ter `housing`, e o catálogo recusa as outras. Com até 4 Alojamentos, a capacidade soma: 4 Alojamentos nv. 2 abrigam 56 NPCs. O seletor de moradia mostra cada um pelo nome, "Alojamento I (3/14) · Alojamento II (14/14, lotado)", e remover um Alojamento libera só os moradores dele.

  Efeitos: `produce` (material por dia), `research` (pontos na pesquisa escolhida), `construction` (dias a menos na obra) e `bonus` (texto nos Bônus ativos, com um `penalty` opcional para quando alguém atrapalha). O posto **Construir**, que aparece em toda obra em andamento, e o divisor das habilidades negativas (`negativeDivisor`) ficam em `src/data/npcs.json`.

- **Rendimento:** `base × (1 + habilidade / 10)` até 10, mostrado com uma casa decimal ("Gus: +3,4 Ferro por dia"). De 11 a 15 vale a tabela `skillTenthsAbove10` de `src/data/npcs.json` (em décimos da base: 26, 35, 46, 61, 80), então 15 rende 4× o que 10 rende: se com 10 a Forja dá 10 Ferros, com 15 dá 40. Nível herói aparece em dourado claro no card do posto e com ★ no seletor. A fração se acumula no posto, e o NPC entrega unidades inteiras.
- **Habilidade negativa:** rende `base × habilidade / 5` e atrapalha: consome material (sem passar de 0), faz a pesquisa regredir (sem passar de 0%), atrasa a obra ou troca o bônus pela penalidade. Aparece em vermelho, com "⚠ atrapalha" no seletor do posto. Vários NPCs no mesmo posto contam separados, então um bom e um ruim se compensam.
- **Quem faz o quê:** só o mestre cria (bloco **Novo NPC**, no topo do painel, sempre fechado), edita (habilidades, atributos, salário, situação) e remove NPCs. Jogadores e mestre escolhem moradia e designam ou dispensam trabalho, pelo botão **NPCs** na barra e pelo painel de cada construção.
- **Regras:**
  - Trabalho exige moradia. Para tirar alguém de casa, use **Retirar** no card "Moradores" da construção ou **Retirar da moradia** no card do NPC; se ele trabalha, um segundo clique confirma que também deixa o posto.
  - Um trabalho por vez.
  - Capacidade e postos vêm do nível em vigor: durante uma melhoria a construção continua funcionando no nível atual.
  - Remover uma construção, reduzir a capacidade, terminar uma obra ou encerrar a pesquisa alvo libera os NPCs, com registro no log.
- **Ao avançar dias**, cada dia processa, nesta ordem:
  1. Salários: o Acampamento paga (o salário é digitado em moedas e salvo em PO); sem saldo, o NPC não trabalha naquele dia.
  2. Efeitos dos postos.
  3. Conclusão das obras.
  4. Retorno dos NPCs em missão (veja [Guilda](#guilda)).

  Pesquisas param em 100% com o aviso "pronta para concluir"; quem conclui é o mestre. Feridos e NPCs em missão mantêm casa e posto, mas não trabalham nem recebem.

- **Save:** versão 7. Saves da versão 4 ganham `npcs: []` ao carregar; os da versão 6 ganham `missions: []`. Nos da versão 5, quem morava na Taverna ou na Torre dos Magos muda para um Alojamento com vaga, mantendo o posto (fica no log); quem não couber perde a moradia e o posto. Online o estado continua no mesmo jsonb e passa pela mesma migração.

### Sprites dos NPCs

Os NPCs que andam no mapa usam personagens do [Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/). Cada personagem fica em `art-sources/npcs/<nome>/`, com a **receita** `character.json` (o mesmo JSON que o site exporta) e o que o site exportaria: `walk.png`, `idle.png`, as animações extras `run`, `sit`, `hurt` (o último quadro serve para "dormindo"), `slash`, `thrust`, `spellcast`, `watering` e `emote`, mais `credits.csv`, `credits.txt`, `metadata.json` e uma `preview.png` (as 4 direções do walk em 2×). Só `walk` e `idle` vão para `public/`, pelo `npm run import:npcs`; as extras esperam até o jogo usá-las.

- **Setup (uma vez por máquina):** `npm run lpc:setup` clona o gerador em `vendor/lpc-generator/` (fora do git do jogo: `vendor/` está no `.gitignore`), instala as dependências dele e confere se o Google Chrome abre. O clone é raso e esparso: definições e código agora, spritesheets só as que alguma receita usa. Fica com uns 410 MB, quase tudo `node_modules` do gerador. Rodar de novo atualiza o gerador.
- **Criar por receita:** coloque a receita em `art-sources/npcs/<nome>/character.json` e rode `npm run lpc:build -- <nome>` (ou `-- --all`). O script abre a própria página do gerador num Chrome invisível, faz **Import from Clipboard (JSON)** e **ZIP: Split by animation**, então a composição e as cores são as do site (a `aventureira` sai idêntica pixel a pixel à exportada pelo site, guardada em `aventureira/_site/`). Arquivos que não mudaram ficam intactos, e no fim ele roda o `import:npcs`. Uma peça, variante ou cor que não existe para o build antes de abrir o navegador, dizendo qual é e quais opções existem.
- **Catálogo:** `npm run lpc:items -- <busca> [--body female]` lista as peças com a chave em `selections`, variantes, cores, tipos de corpo e animações (ex.: `lpc:items -- hair long --body female`, `lpc:items -- apron`). Confira se a peça tem `walk` e `idle`: sem elas, a peça some nessa animação.
- **Pedir por descrição:** peça ao Claude, por exemplo, "crie a sprite da Bianca: maga, cabelo ruivo longo, túnica roxa, sem escudo, com cajado". Ele monta o `character.json` só com peças conferidas no `lpc:items`, roda o `lpc:build` e mostra a `preview.png`. NPCs civis vêm **sem escudo nem armas**, a não ser que você peça (compare `aventureira` com `aventureira_civil`).
- **Ligar ao NPC:** em `src/data/npc_sprites.json`, `{ "<npcId>": "<nome>" }`. O id está no save exportado (`"npcs": [{ "id": "npc_ab12", "name": "Bianca", … }]`). NPC sem entrada recebe um sprite sorteado pelo id, sempre o mesmo.
- **Créditos (obrigatório):** a arte LPC é CC-BY-SA, GPL ou OGA-BY, e todas pedem crédito aos autores. O `credits.csv` sai das definições do gerador; o `lpc:build` recusa camada sem autor ou licença, o `import:npcs` leva tudo para a tela **Créditos** e o `npm test` confere que nenhuma linha ficou sem autor e licença.
- **Publicar:** só quando houver sprite novo importado, e basta um build novo do site; não precisa de `deploy:functions` nem `db push`.

## Fotos no jogo

Retratos de **NPCs** e **personagens** e ícones de **materiais** e **mundos de influência** são enviados direto pelo jogo.

- **Onde:** nos formulários de NPC, material e personagem, o campo **Retrato**/**Ícone** virou um seletor com prévia redonda, **Enviar foto**, arrastar e soltar, colar com Ctrl+V e **Remover foto** (volta para a inicial com a cor). Mundos ganham **Trocar foto** no painel de Influência. O link discreto **usar URL ou chave do jogo** volta ao campo de texto antigo.
- **Quem troca:** o mestre troca tudo. O jogador troca só a foto do **próprio personagem**, pelo botão **Trocar foto** no cartão dele em **Ouro → Ver detalhes** (offline, como no depósito, qualquer personagem). A regra vale no `applyCommand` (comando `set_image`) e nas regras do Storage.
- **Recorte:** ao escolher a imagem abre um recorte **quadrado**: arraste (ou use as setas) para enquadrar e o zoom (barra ou roda do mouse, até 4×) para aproximar. O círculo mostra o que as miniaturas vão exibir. A matemática do recorte é pura (`cropRect`/`panView` em `src/systems/GameImages.ts`).
- **Tamanho:** a foto é salva em **512×512** (WebP, qualidade 0,85; JPEG se o navegador não gera WebP) mais uma miniatura **128×128**. Aceita JPG, PNG, WebP e GIF (fica o primeiro quadro), original até 10 MB; comprimida, até 300 KB (`PHOTO_LIMITS`). Erros aparecem embaixo do campo.
- **No estado:** o campo guarda `upload:<tipo>/<id>/<imagem>.webp` (ex.: `upload:npc/npc_ab12/img_9f.webp`). Chaves do `assets.json` e URLs continuam funcionando; o schema só ficou mais permissivo, sem migração de save. O envio só acontece ao **salvar** o formulário, então um formulário abandonado não deixa arquivo.
- **Onde ficam:** offline, no IndexedDB `axis-base-builder:game-images`; online, no bucket **privado** `game-images`, em `game_id/<tipo>/<id>/<imagem>.webp` (e `.thumb.webp`), com links assinados de 10 minutos. Membros do jogo leem; o mestre escreve em tudo; o jogador só em `character/<seu personagem>/`.
- **Arquivos antigos:** quando o jogo salvo deixa de citar uma foto (trocada, removida ou o NPC/material/personagem saiu), o arquivo é apagado. Isso acontece só depois de o servidor aceitar a mudança, para uma troca recusada não perder a foto antiga.
- **Exportar/Importar save:** as fotos entram no `.zip`, na pasta `game-images/`, junto com as imagens do Arquivo.
- **Publicar a mudança online:** `npx supabase db push` (bucket e regras de acesso, migração `20261013000000_game_images.sql`) e `npm run deploy:functions` (o servidor passa a aceitar o comando `set_image`). Testes pgTAP em `supabase/tests/game_images.test.sql` (`npx supabase test db`, precisa de Docker).

## Arquivo de registros

Os registros da campanha (relatórios, formulários, anotações sobre personagens, cartas) ficam no **Arquivo**, organizados em **tópicos** com **notas**. O design completo está em `docs/plans/ARQUIVO.md`.

- **Onde abrir:** no painel do Arquivo construído (nível ≥ 1), o botão **Abrir registros** mostra a contagem de tópicos e notas. O mestre também abre pelas ferramentas do mestre, mesmo sem o Arquivo construído.
- **Janela:** tópicos à esquerda (ícone, nome e quantidade de notas), notas do tópico à direita (fixadas primeiro, cada uma recolhe e expande) e uma busca no título e no texto, que ignora maiúsculas e acentos. No celular vira duas etapas (tópicos → notas). A janela lembra o último tópico aberto.
- **Quem faz o quê:** jogadores e mestre criam, editam, reordenam, movem e removem qualquer tópico ou nota `todos`. Só o mestre cria, vê e edita notas `mestre`; os jogadores nunca as recebem (nem na lista, nem na busca, nem na contagem, nem no log). Offline o jogador escolhe o personagem no topo da janela.
- **Lixeira:** remover manda para a lixeira, onde qualquer um restaura. Só o mestre esvazia. Um tópico só sai quando está vazio (mova as notas antes).
- **Colar registros:** cole o texto do Discord. Cada linha só de traços (`-----`, 5 ou mais) separa um registro. O texto vai inteiro para a nota, e os títulos são numerados (`Registro 1`, `Registro 2`...): na prévia dá para trocar o prefixo, o número inicial (sugere o próximo livre do tópico, contando a lixeira) e cada título antes de salvar.
- **Formatação do Discord:** `**negrito**`, `*itálico*`/`_itálico_`, `__sublinhado__`, `~~riscado~~`, `>`/`>>>` citação, listas `-`/`*`/`1.`, títulos `#`/`##`/`###` e linha de traços. O editor tem o botão **Prévia**. O texto é montado sem `innerHTML`: o que não é marcação aparece literal.
- **Limites:** título até 200 caracteres e nota até 20.000.
- **Imagens:** no editor da nota, **Anexar imagem**, arrastar e soltar ou colar com Ctrl+V (prints do Discord). Aceita JPG, PNG, WebP e GIF (fica a imagem parada). Antes de enviar, o navegador reduz o lado maior para até 2000 px, grava em WebP (ou JPEG, se o navegador não gera WebP) e faz uma miniatura de 320 px.
  - **Limites** (`IMAGE_LIMITS` em `src/systems/ArchiveImages.ts`): original até 10 MB, até 2 MB depois de comprimida e 12 imagens por nota. Acima disso a imagem é recusada com o motivo.
  - Cada imagem tem legenda opcional, que entra na busca, e pode ser reordenada. Remover uma imagem já salva vale na hora.
  - A nota mostra as miniaturas abaixo do texto. Clicar abre a imagem ampliada, com setas (ou ← →) para passar entre elas, zoom para o tamanho real e Esc para fechar.
  - Dá para criar uma nota só com imagens: o título continua obrigatório.
  - As imagens seguem a nota: vão para a lixeira e voltam com ela. Só esvaziar a lixeira apaga os arquivos. Imagens de notas `mestre` nunca chegam aos jogadores.
  - **Onde ficam:** offline, no IndexedDB do navegador (`axis-base-builder:archive-images`); online, no bucket privado `archive-images` do Supabase Storage, em `game_id/note_id/image_id.webp`, exibidas com links assinados de 10 minutos. Os dados de cada imagem (legenda, ordem, tamanho) ficam na própria nota (`images`).
  - **Exportar save:** com imagens, o arquivo vira um `.zip` (`save.json` mais a pasta `images/`). **Importar save** aceita `.json` e `.zip`.
  - **Publicar a mudança online:** `npx supabase db push` (coluna, bucket e regras de acesso) e `npm run deploy:functions` (o log ganhou "anexou"/"removeu uma imagem").
- **Log:** toda ação vira uma entrada com quem fez ("Thorin criou o tópico Pets", "Mestre moveu 'Zolt-Raak' de NPCs para Jogadores"), menos as que envolvem notas `mestre`.
- **Onde fica:** fora do `GameState`. Offline, em `localStorage` (`axis-base-builder:archive`); online, nas tabelas `archive_topics` e `archive_notes`. **Exportar/Importar save** levam o arquivo junto, na chave `archive`.

## Depósito

O **Depósito** guarda os itens do grupo (equipamentos, poções ou qualquer outra coisa) numa janela no mesmo estilo do Arquivo de registros, com **seções** (como os tópicos) e **itens**. Cada personagem também tem a sua **área privada**. O design está em `docs/plans/DEPOSITO.md`.

- **Onde abrir:** no painel do **Depósito** construído (nível ≥ 1; era o Arsenal, id `armory`, que foi renomeado), o botão **Abrir depósito** mostra a contagem de seções e itens. O mestre também abre pelas ferramentas do mestre, mesmo sem o Depósito construído.
- **Janela:** à esquerda, as seções do **Depósito do grupo** e, embaixo, a **área privada**: o jogador vê só a dele ("Minha área privada"); o mestre vê a de cada personagem. À direita, os itens da seção escolhida. A busca procura no nome e nas observações de tudo o que você pode ver. No celular vira duas etapas.
- **Item:** nome, tipo (⚔️ Equipamento, 🧪 Poção ou 📦 Outro), quantidade (1 a 99.999) e observações (até 2.000 caracteres). Os botões **−** e **+** do cartão retiram ou adicionam uma unidade; para zerar, remova o item.
- **Quem faz o quê:** no depósito do grupo, todos criam, editam, reordenam, movem e removem qualquer seção ou item. Na área privada, só o dono e o mestre. Para guardar ou retirar algo do depósito do grupo, use **Mover para** no item: a lista mostra as seções do grupo e as da sua área.
- **Privacidade:** os outros jogadores nunca recebem a área privada de alguém (nem na lista, nem na busca, nem no log). Online, isso é garantido pela RLS do banco; offline, é o mesmo navegador para todos, então a área só fica escondida pela janela (o jogador escolhe o personagem no topo, a mesma escolha do Arquivo).
- **Lixeira:** remover manda para a lixeira, onde quem vê o item ou a seção pode restaurar. Só o mestre esvazia. Uma seção só sai quando está vazia.
- **Log:** só o depósito do grupo entra no registro ("Thorin pôs 'Poção de cura' (×3) no depósito"). Mover da área privada para o grupo vira "Thorin guardou 'Escudo' (×1) no depósito, em Armas", e o contrário vira "retirou", sem citar a seção privada.
- **Onde fica:** fora do `GameState`. Offline, em `localStorage` (`axis-base-builder:depot`); online, nas tabelas `depot_sections` e `depot_items`. **Exportar/Importar save** levam o depósito junto, na chave `depot`.
- **Publicar a mudança online:** `npx supabase db push` (tabelas e regras de acesso) e `npm run deploy:functions` (o log ganhou as entradas do depósito).

## Taverna

A **Taverna** tem um **cardápio** com café da manhã, almoço e janta.

- **Onde abrir:** no painel da Taverna construída (nível ≥ 1), o botão **Ver cardápio**. O mestre também abre pelas ferramentas do mestre, mesmo sem a Taverna construída.
- **Janela:** uma aba por refeição (ela lembra a última vista) e os pratos em cards com foto, nome, descrição, preço e efeito. Clicar na foto amplia. Pratos que pedem uma Taverna de nível maior aparecem esmaecidos com "Disponível na Taverna nv. 2": o cardápio cresce junto com a construção. No celular os cards ficam em uma coluna.
- **Somente leitura:** o cardápio vem do JSON e muda com um novo deploy do site. Não passa por comando, banco nem save (e não precisa de `deploy:functions`).

### Editar o cardápio

Os pratos ficam em `src/data/tavern_menu.json`, validado no carregamento (`npm test` aponta o erro):

```json
{
  "id": "pao_mel",
  "meal": "breakfast",
  "name": "Pão com mel",
  "description": "Pão quente do forno da muralha, com mel escuro das colmeias do vale.",
  "image": "menu.pao_mel",
  "price": { "bronze": 2 },
  "effect": "+1 PV temporário até o próximo descanso.",
  "minLevel": 2
}
```

- `meal`: `breakfast` (café da manhã), `lunch` (almoço) ou `dinner` (janta). Os pratos aparecem na ordem do arquivo.
- `price`, `effect` e `minLevel` são opcionais. O preço é escrito em moedas de `currencies.json` e aparece agrupado como o salário dos NPCs (`{ "bronze": 12 }` vira "1 Prata e 2 Bronze"). `minLevel` vale 1 quando falta e não pode passar do nível máximo da Taverna.
- `id` não pode repetir e `image` precisa existir no `assets.json`.

### Trocar as fotos

Cada foto fica em `public/assets/menu/<id>.jpg` e está registrada no `assets.json` como `menu.<id>`. Para usar a foto real, **substitua o arquivo com o mesmo nome** (JPG em 4:3, por exemplo 800×600; o card corta o excesso com `object-fit: cover`). Prato novo: crie o arquivo, adicione `"menu.<id>": "assets/menu/<id>.jpg"` no `assets.json` e o item no `tavern_menu.json`.

- `npm run gen:placeholders` gera a imagem genérica (um prato na cor da refeição com o nome escrito) para os pratos sem foto e nunca sobrescreve arquivos existentes.
- Se o arquivo de uma foto não existir, o card mostra um prato desenhado em CSS no lugar, sem quebrar a janela.
- As fotos do cardápio não entram no carregamento do mapa: só são baixadas quando a janela abre.

## Guilda

O **Salão da Guilda** tem um **quadro de missões** onde mestre e jogadores penduram contratos. Cada missão é feita pelo **grupo** ou por **NPCs** enviados pela Axis. O design completo está em `docs/plans/MISSOES.md`.

- **Onde abrir:** no painel da Guilda construída (nível ≥ 1), o botão **Abrir quadro de missões**, com a contagem de abertas e em andamento. Se a Guilda for removida ou rebaixada, as missões e os NPCs fora continuam; só o botão some até reconstruir.
- **Quadro:** madeira escura com uma gema azul no topo e um pergaminho por missão, tudo em CSS. Cor (laranja, bege, roxo, amarelo-claro), inclinação e bordas rasgadas vêm do id, então são iguais para todos. O selo de cera mostra a dificuldade: verde fácil, amarelo média, vermelho difícil. Abas **Abertas · Em andamento · Concluídas** com contagem; no celular os pergaminhos viram uma coluna.
- **Primeiro plano:** clicar num pergaminho o traz para o centro com o quadro escurecido, mostrando o texto completo (mesmo markdown do Arquivo) e as ações. Fecha com Esc, no X ou clicando fora.
- **Nova missão** (aba Abertas): título, solicitante, local, descrição, recompensa (nos campos de moeda), tempo esperado em dias e dificuldade. Registra quem criou e o dia. Limites: título até 120 caracteres, descrição até 4.000, de 1 a 365 dias, recompensa maior que zero. Qualquer um edita ou remove uma missão **aberta**.
- **"O grupo vai":** a missão fica em andamento. Quando o grupo voltar, o mestre marca **Concluída** (o Acampamento recebe 100%) ou **Falhou** (ninguém recebe).
- **"Enviar NPCs":** escolha um ou mais NPCs `disponivel` ou `trabalhando` (a lista mostra habilidades, status e posto). Ao marcar, o primeiro plano mostra só o resultado: "Retorno previsto em 4 dias (prazo da missão: 10)". Eles ficam `em_missao`, mantêm casa e posto, mas não trabalham nem recebem. Ao avançar os dias até o retorno, a missão passa para **Aguardando o mestre**, com log.
  - **Tempo:** os atributos da equipe aceleram a missão. Cada atributo vale o próprio nível até 10 e, acima disso, a tabela `attributePointsAbove10` (15 vale 40, 20 vale 160); somam-se os três atributos de todos os enviados. Dias = `ceil(prazo × 160 / (160 + 3 × pontos))`, no mínimo 1 e no máximo o dobro do prazo (pontos negativos atrasam). Numa missão de 10 dias, 4 NPCs com 7/7/6 voltam em 4 dias e uma deusa 20/20/20 em 1. O tempo é fixado na saída: editar atributos depois não muda a missão. Missões do grupo não mudam. O mestre decide:
  - **Sucesso:** 80% para os NPCs, divididos igualmente em bronze e somados ao `earnings` de cada um ("Ganhou 1,6 PO em missões" no card), e 20% de comissão para o Acampamento. O resto da divisão vai para o Acampamento, então nenhuma moeda se perde (2 PO com 3 NPCs: 0,53 PO para cada e 0,41 PO para o Acampamento).
  - **Falha:** ninguém recebe, e o mestre marca quem voltou ferido.
  - Depois, cada NPC volta a `trabalhando` (se tem posto) ou `disponivel`, menos os feridos.
- **Guilda nv. 2:** as recompensas pagam 10% a mais nos dois modos enquanto o nível em vigor for ≥ 2 (o primeiro plano mostra o valor).
- **NPC removido em missão:** sai da equipe; se ninguém sobrar, a missão volta para Abertas, com log.
- **Configuração:** `src/data/missions.json` define a comissão (`campCommissionPercent`), o bônus da Guilda (`guildBonus`: construção, nível mínimo e percentual), os pontos dos atributos acima de 10 (`attributePointsAbove10`) e a fórmula do tempo (`teamSpeed`: `k`, `m`, `minDays`, `maxSlowdown`).
- **Regras:** tudo passa pelo `applyCommand` (`mission_create`, `mission_update`, `mission_remove`, `mission_take_party` e `mission_send_npcs` para jogador e mestre; `mission_resolve` só para o mestre), sem sorteio: servidor e cliente chegam ao mesmo resultado. As missões ficam no `GameState` (`missions`).
- **Publicar a mudança online:** `npm run deploy:functions`. Não há migração SQL: o save migra ao carregar.

## Online / Supabase

> Em andamento (Fase 3). Plano completo em [`docs/plans/FASE3_SUPABASE.md`](docs/plans/FASE3_SUPABASE.md).

Sem as variáveis do Supabase, o jogo roda **offline**, como sempre: o save fica no `localStorage` do navegador.

Como as mudanças viajam:

- Toda ação é um **comando** em dados (`src/commands/schema.ts`), aplicado por `applyCommand`, que também confere as permissões (mestre ou jogador).
- O `GameStore` mostra a mudança na hora e envia o comando ao **repositório** (`src/persistence/`). Offline, o `LocalRepository` aplica o comando no save guardado; online, a Edge Function aplica o mesmo `applyCommand` no servidor.
- O save é um JSON versionado (`version`). Formatos novos (como os NPCs) entram com uma migração em `SAVE_MIGRATIONS` (`src/systems/SaveSystem.ts`), sem mudar as tabelas; saves antigos são migrados, não descartados.
- Cada mudança aceita incrementa a `revision` do jogo. Se outra aba (ou outro jogador) gravou antes, o repositório responde **conflito**, a loja recarrega e reaplica os comandos pendentes.

### No navegador

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (veja `.env.example`) ligam o modo online. Só a chave **anon** vai para o front; a service role fica na Edge Function.
- `SupabaseRepository` (`src/online/`): `load` lê `games.state` (RLS), `submit` chama a Edge Function e transforma 409 em conflito e as recusas em mensagens do jogo, e `subscribe` escuta o Realtime de `games`. Toda chamada tem tempo limite (15 s).
- O eco do próprio comando pelo Realtime é ignorado enquanto o envio está em andamento, para não aplicar a mudança duas vezes.

### Entrar na mesa (online)

1. **Login:** botão **Entrar com Google** (a conta Gmail do jogador). O link por e-mail continua como alternativa ("Entrar com e-mail"), mas só funciona com um servidor de e-mail (SMTP) próprio configurado no Supabase: o e-mail padrão do Supabase manda pouquíssimas mensagens por hora. Os dois logins voltam para a mesma URL, então `?game=`, `?invite=` e `?join=` sobrevivem.
2. **Link de entrada da mesa (`?join=…`):** o link que o mestre manda no grupo. Quem abre, logado e ainda fora da mesa, vê a tela **"Entrar na Axis"**:
   - **"Sou um personagem que já existe":** lista, com foto e nome, os personagens sem jogador. Escolher liga o jogador a ele, sem aprovação; o registro mostra "Um jogador assumiu Thorin" e o mestre pode desfazer.
   - **"Criar meu personagem":** nome, cor e a foto da conta Google como começo. O personagem nasce com a carteira vazia e o registro mostra "Bruna entrou na Axis". Para trocar a foto, o jogador usa o seletor de foto da ficha depois de entrar (antes disso ele ainda não pode enviar arquivos para a mesa).
   - Quem já está na mesa e abre o link de novo entra direto.
3. **Convite por personagem (`?invite=…`):** continua existindo. Liga quem aceitar a um personagem escolhido pelo mestre; vale uma vez.
4. **Mesa:** quem ainda não participa de nenhuma mesa pode criar uma (vira o mestre), começando do seed ou de um save exportado. Com várias mesas, `?game=<id>` escolhe qual abrir.
5. **Papel:** as ferramentas de mestre aparecem para quem tem `role = master` em `players`. No online, "Sair da conta" substitui "Sair do modo mestre". Quem decide de fato é o servidor.

**Link de entrada e jogadores (mestre):** na aba **Mestre** da gaveta, o cartão **Link de entrada** gera o link da mesa (sem validade, 7 ou 30 dias), mostra os links ativos e cancela um link. Abaixo, **Jogadores** lista quem está na mesa (nome ou e-mail da conta → personagem) com **Desligar**: o personagem e a carteira ficam, só o vínculo sai (o registro mostra "Mestre desligou o jogador de Thorin").

**Convites (mestre):** o cartão **Convites** gera um link por personagem (botão **Copiar link**) e lista os convites pendentes, que podem ser cancelados.

**Histórico completo:** na aba **Registro**, abaixo das entradas recentes (o `state.log` guarda só as últimas 200), o cartão **Histórico completo** lê o `game_log` em páginas de 50.

O código online (e o `supabase-js`) só é baixado quando as variáveis do Supabase existem; offline, o jogo carrega como antes.

### Regras no servidor (Edge Function)

O servidor roda **o mesmo código** do jogo. `npm run build:functions` empacota (esbuild) as regras, o zod e os JSONs de `src/data` num único módulo, `supabase/functions/_shared/game.js` (gerado, fora do git). Assim a Edge Function valida com exatamente os dados do commit publicado.

| Comando                   | O que faz                                                                    |
| ------------------------- | ---------------------------------------------------------------------------- |
| `npm run build:functions` | Gera o bundle das regras para as Edge Functions                              |
| `npm run parity`          | Gera o bundle e roda os mesmos comandos em Node e em Deno; falha se divergir |

O Deno vem como devDependency (`npx deno`), não precisa instalar à parte.

A função `game` (`supabase/functions/game/index.ts`) só liga o bundle ao `supabase-js`. A lógica está em `src/server/`:

- **JWT:** sem token ou com token inválido → **401**. O papel e o personagem vêm da tabela `players`, nunca do corpo da requisição.
- **`command`:** `{ gameId, command, expectedRevision }` → aplica o `applyCommand` e grava com `commit_game_update`. Respostas: **200** `{ state }`, **403** (não membro ou sem permissão), **409** (revisão desatualizada), **422** (requisição ou comando inválidos).
- **`create_game`:** cria o jogo a partir do seed ou de um save exportado (`state`); quem cria vira mestre.
- **`restore_save`:** (mestre) substitui o jogo por um backup, como a próxima revisão.
- **Convites:** `create_invite` (mestre) gera um token de uso único para um personagem, válido por 7 dias (até 30); o banco guarda só o hash. `accept_invite` liga quem aceitou ao personagem; `revoke_invite` cancela um convite pendente.
- **Link de entrada:** `create_join_link` (mestre) gera o token da mesa, reutilizável, sem validade ou com até 90 dias; o banco guarda só o hash. `revoke_join_link` cancela. `join_preview` devolve a mesa e os personagens sem jogador (fotos enviadas vão como URL assinada, porque quem entra ainda não é membro). `join_game` faz `claim` (assumir um personagem livre) ou `create` (nome, cor, foto do Google), validado no servidor: nome não vazio e sem repetir, um personagem por usuário, um jogador por personagem. Os comandos `character_join`, `character_claim` e `character_release` só rodam nesse fluxo (`CommandContext.membership`); enviados como comando comum, são recusados.
- **`unlink_player`** (mestre): desliga um jogador do personagem e registra no log.
- Testes em `src/server/http.test.ts` e `src/server/handler.test.ts`, com o banco simulado em memória.

| Comando                    | O que faz                                                |
| -------------------------- | -------------------------------------------------------- |
| `npm run check:functions`  | Gera o bundle e confere os tipos da função com o Deno    |
| `npm run deploy:functions` | Gera o bundle e publica a função (precisa do CLI logado) |

### Banco (Supabase)

`supabase/migrations/` cria as tabelas `games` (estado em jsonb + `revision`), `players` (papel e personagem), `game_log` (histórico completo), `invites` (convites de uso único) e `join_links` (links de entrada da mesa). Dos dois tipos de link, só o hash do token é gravado.

- **RLS:** clientes só **leem**, e só os jogos de que participam. Ninguém grava direto: as escritas passam pela Edge Function, que usa a service role e as funções `commit_game_update` (grava só se a `revision` bater), `create_game` e `accept_invite`.
- `games` está na publicação do Realtime, que também respeita a RLS.
- **Arquivo de registros:** `archive_topics` e `archive_notes` são a exceção: membros escrevem direto, e a RLS só deixa o mestre ler e escrever as notas `mestre` (jogador não cria nem transforma uma nota em `mestre`). Um trigger recusa mandar à lixeira um tópico com notas, contando as `mestre` sem revelá-las, e `replace_archive` (só o mestre) restaura o arquivo de um save importado. As duas tabelas estão no Realtime.
- **Depósito:** `depot_sections` e `depot_items` seguem o mesmo modelo. `owner_id` nulo é o depósito do grupo; com o id de um personagem, é a área privada dele, que a RLS só mostra ao dono (`my_character`) e ao mestre. O item guarda uma cópia do `owner_id` da seção (um trigger confere), uma seção nunca muda de área, outro trigger recusa mandar à lixeira uma seção com itens, e `replace_depot` (só o mestre) restaura o depósito de um save importado. As duas tabelas estão no Realtime.
- **Entrar e sair:** `join_game` liga o usuário e grava o estado numa transação só, com as mesmas garantias de `accept_invite` (chave `(game_id, user_id)` e índice único por personagem); `unlink_player` nunca remove o mestre. `list_players` (só o mestre) junta `players` com o nome e o e-mail das contas, que os clientes não leem direto.
- **Verificação:** `supabase/tests/games_rls.test.sql`, `supabase/tests/archive_rls.test.sql` e `supabase/tests/join_links.test.sql` (pgTAP). Com o Docker rodando: `npx supabase start` e depois `npx supabase test db`.

O Supabase CLI vem como devDependency: use `npx supabase …`.

### Login com Google (configuração única)

1. **Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)): crie um projeto (ou use um existente).
2. **APIs e serviços → Tela de consentimento OAuth:** tipo **Externo**, nome do app (Axis) e seu e-mail de suporte. Escopos: os padrão (`email`, `profile`, `openid`). Publique o app (**Em produção**) para qualquer conta Google entrar, ou deixe em teste e adicione os jogadores em **Usuários de teste**.
3. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth:** tipo **Aplicativo da Web**.
   - **Origens JavaScript autorizadas:** `https://italoneri.github.io` e `http://localhost:5173`.
   - **URIs de redirecionamento autorizados:** a URL de callback do Supabase, `https://icpsmdtkirgfmlxmgxvd.supabase.co/auth/v1/callback` (o painel mostra a mesma em _Authentication → Providers → Google → Callback URL_).
4. Copie o **Client ID** e o **Client Secret**.
5. **Supabase → Authentication → Providers → Google:** ative, cole o Client ID e o Client Secret e salve.
6. **Supabase → Authentication → URL Configuration:** Site URL `https://italoneri.github.io/Axis/`; em Redirect URLs, `https://italoneri.github.io/Axis/**` e `http://localhost:5173/**`.

Para o Supabase local (`npx supabase start`), o `supabase/config.toml` lê `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` e `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` do ambiente (veja `.env.example`); os valores nunca vão para o arquivo.

### Publicação (GitHub Pages)

Todo push na `master` roda `.github/workflows/pages.yml`: testes, build com as variáveis do Supabase e publicação em `https://italoneri.github.io/Axis/`. O build falha se as variáveis faltarem, para não publicar o jogo offline por engano.

Configuração única no GitHub:

1. **Settings → Pages → Source:** `GitHub Actions`.
2. **Settings → Secrets and variables → Actions → Variables:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (a chave publishable; como Variables ou Secrets, o workflow lê os dois). Nunca a service role.

No Supabase, **Authentication → URL Configuration:** Site URL `https://italoneri.github.io/Axis/` e, em Redirect URLs, `https://italoneri.github.io/Axis/**` e `http://localhost:5173/**`. O `**` é necessário: o magic link volta para a URL inteira, com `?invite=` e `?game=`.

## Estrutura

```
src/
  main.ts            monta UI + jogo
  store.ts           estado atual, envio de comandos e eventos (camada imperativa)
  commands/          comandos serializáveis e applyCommand (regras + permissões)
  archiveStore.ts    Arquivo de registros: envio de comandos e avisos de mudança
  depotStore.ts      Depósito: o mesmo, para seções e itens
  persistence/       GameRepository e LocalRepository (localStorage); ArchiveRepository e
                     LocalArchiveRepository
  server/            Edge Function: handler, acesso ao banco, catálogo e entrada do bundle
  online/            SupabaseRepository, SupabaseArchiveRepository, cliente Supabase e
                     configuração online/offline
  model/             schemas (zod) e tipos, carregamento/validação do catálogo
  map/               mapa gerado por código: layout, geometria, veios, gerador, portões, tema
  systems/           regras puras: Build, Coins, Wallets, Materials, Research, Influence,
                     Characters, Time, Save, Master, Bonus, Archive (+ testes)
  scenes/            Boot, Preload, Base, SlotView, CameraController
  ui/                barra superior e painéis de recursos (ui/resources), painel do espaço,
                     gaveta (bônus/registro/mestre), login, save, janela do Arquivo
                     (ui/archive, com o markdown do Discord), CSS
  i18n/pt-BR.ts      todos os textos da interface
  data/              buildings.json, layout.json, theme.json, credits.json, assets.json,
                     currencies.json e os seeds
                     wallets.json, materials.json, research.json, influence.json
scripts/             gerador de placeholders, bundle das Edge Functions, paridade Node/Deno,
                     import:npcs e lpc/ (sprites dos NPCs pelo gerador LPC)
public/assets/       textures/, buildings/, icons/
docs/map-reference/  imagem e scripts de referência do mapa
supabase/            config, migrations SQL (tabelas + RLS), testes pgTAP e Edge Functions
art-sources/         originais das texturas (fora do git) e npcs/ (receitas e sprites LPC)
vendor/              gerador LPC clonado pelo lpc:setup (fora do git)
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
         "party": "Montarias comuns custam metade.",
         "axis": ""
       },
       {
         "cost": { "coins": 300, "materials": { "wood": 100, "iron": 60 } },
         "buildTime": 4,
         "party": "Viagens a partir da Axis levam 1 dia a menos.",
         "axis": "",
         "requires": [{ "building": "axis_heart", "minLevel": 1 }]
       }
     ]
   }
   ```

   - `allowedSlots`: `core` (centro), `middle` (os 8 arcos em volta do disco azul) e/ou `outer` (os arcos junto à muralha).
   - `requires` no nível de cima vale para **todos** os níveis; dentro de um nível, só para aquele nível.
   - `party` é o texto para a mesa de RPG e `axis` o buff da base. Os dois são obrigatórios; `""` aparece como "a definir".
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

| Tipo de slot | Formato             | Arquivo                                   | Tamanho | Orientação da arte                                                                                    |
| ------------ | ------------------- | ----------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `outer`      | arco (setor anelar) | `public/assets/buildings/<id>.outer.png`  | 768×506 | desenhada como no espaço **Norte**: muralha no **topo**, frente voltada para baixo (centro da Axis)   |
| `middle`     | arco (setor anelar) | `public/assets/buildings/<id>.middle.png` | 768×311 | desenhada como no espaço **Norte**: borda externa no **topo**, frente voltada para baixo (disco azul) |
| `core`       | círculo             | `public/assets/buildings/<id>.core.png`   | 512×512 | —                                                                                                     |

- **Arcos:** a imagem é escalada para a caixa do arco (calculada a partir do `layout.json`), girada pelo ângulo do espaço e recortada pela forma exata do arco. Vale para a muralha (`outer`) e para o anel intermediário (`middle`), cada um com seu molde em `docs/art-templates/`: `outer_arc_mask.png`/`outer_arc_guide.png` (768×506) e `middle_arc_mask.png`/`middle_arc_guide.png` (768×311). Para regerar os moldes depois de mudar o layout: `python docs/art-pipeline/scripts/gerar_moldes.py src/data/layout.json docs/art-templates`.
- **Quadrados (layout v3):** a imagem gira para a frente apontar para o centro. Como os quadrados do mapa não giram, nos espaços diagonais a arte encolhe para caber (até 71%).
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

| `type`   | Efeito                                | Campos extras                                                                   |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `smoke`  | partículas subindo e se dispersando   | `color` opcional (hex); padrão cinza                                            |
| `glow`   | luz pulsante                          | `color` (hex `#rrggbb`) e `radius` (fração da largura da arte)                  |
| `sparks` | faíscas curtas em momentos aleatórios | `color` opcional (hex), misturada com tons mais claros; padrão laranja de forja |

- Os efeitos só aparecem com a construção **concluída** e com arte final no formato do espaço.
- `minLevel` (opcional) mostra o efeito só a partir daquele nível; `maxLevel` (opcional) esconde a partir do nível seguinte (útil quando a arte de um nível acima substitui um detalhe).
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

Por cima ficam objetos normais do Phaser: as fundações dos espaços (arcos translúcidos que brilham no hover), os **portões** (desenhados por código com as cores de `entrances.prisms`, com sombra e um halo que pulsa devagar) e as construções.

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
  - `middle` (`shape: "arc"`, como o `outer`; o layout v3 usava `shape: "square"` com `size` = lado, e ainda é aceito).
  - `outer` (`shape: "arc"`, com `arc.innerRadius`, `arc.outerRadius`, `arc.startAngle` e `arc.endAngle`; `startAngle` pode ser negativo para arcos que cruzam o Norte).
- `rings`: parâmetros do planejador `docs/art-pipeline/axis_anel_intermediario.html` (em `rings.middle`: `count`, `shape`, `radius`, `depth`, `span` e `rotation`). É só documentação: o jogo usa os `slots`.
- `reserved`: trechos da muralha onde nenhum espaço pode ficar. O trecho existe só nos dados: o mapa não desenha nada que o diferencie.

Os ids dos espaços são a chave das construções no save: **não renumere** (por isso eles pulam de `outer_10` para `outer_13`). Se um save tiver uma construção num espaço que saiu do layout (por exemplo, menos `mid_N`), ela é removida ao carregar e o log registra. O `npm test` acusa id repetido, espaço sobre um trecho reservado, estrutura cujo `allowedSlots` não tem espaço no layout e prismas em número diferente dos portões.

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
