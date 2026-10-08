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
- **Editar espaços:** arraste os espaços pelo mapa (o id de cada um aparece), clique em **Exportar slots.json** e substitua `src/data/slots.json` pelo arquivo baixado. As alterações não são salvas no navegador: o arquivo exportado é o que vale.

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
  slotEditor.ts      cópia de trabalho do slots.json para o editor do mestre
  systems/           regras puras: Build, Coins, Wallets, Materials, Research, Influence,
                     Characters, Time, Save, Master, Bonus, SlotLayout (+ testes)
  scenes/            Boot, Preload, Base, SlotView, CameraController
  ui/                barra superior e painéis de recursos (ui/resources), painel do espaço,
                     gaveta (bônus/registro/mestre), login, save, CSS
  i18n/pt-BR.ts      todos os textos da interface
  data/              buildings.json, slots.json, assets.json, currencies.json e os seeds
                     wallets.json, materials.json, research.json, influence.json
scripts/             gerador de placeholders
public/assets/       map/, buildings/, icons/
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

   - `allowedSlots`: `core`, `inner` (disco azul, junto às luminárias) e/ou `outer` (pilares).
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

| Asset               | Caminho                             | Formato                    | Tamanho               | Observações                                                                                                      |
| ------------------- | ----------------------------------- | -------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Mapa                | `public/assets/map/axis.png`        | PNG ou JPG                 | quadrado, ≥ 2048×2048 | vista top-down; as posições dos espaços são proporcionais (0–1), então qualquer resolução quadrada funciona      |
| Sprite de estrutura | `public/assets/buildings/<id>.png`  | PNG com fundo transparente | 256×256 (ou 512×512)  | vista top-down, centralizada, ocupando ~85% do quadro                                                            |
| Ícone de estrutura  | `public/assets/icons/<id>.png`      | PNG com fundo transparente | 64×64 (ou 128×128)    | usado no painel                                                                                                  |
| Ícone de recurso    | `public/assets/icons/<recurso>.png` | PNG com fundo transparente | 64×64                 | ícones da barra (`icon.gold`, `icon.materials`, `icon.research`, `icon.influence`); aparecem pequenos (18–26 px) |
| Ícone de moeda      | `public/assets/icons/coin_<id>.png` | PNG com fundo transparente | 64×64                 | um por moeda de `currencies.json`                                                                                |

O tamanho com que cada estrutura aparece no mapa vem de `sizes` em `src/data/slots.json` (fração da largura do mapa por tipo de espaço).

## Espaços (slots)

`src/data/slots.json` define os 17 espaços com coordenadas normalizadas (0–1). Eles foram distribuídos de forma **simétrica** a partir das luminárias da imagem (centro em 50,1% × 49,6%, raio de 12,2% no anel interno e 29,1% no externo). Para ajustar, use **Editar espaços** no Modo Mestre ou edite os valores `x`/`y` à mão.
