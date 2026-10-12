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
- O `icon` aceita uma chave do `assets.json` ou uma URL de imagem. Sem ícone, aparece um círculo com a inicial.

### Pesquisa

- O seed fica em `src/data/research.json`: `categories` e `entries`. Cada pesquisa tem `id`, `title`, `category`, `status` (`em_andamento` com `progress` de 0 a 100, ou `concluida` com `completedOnDay` opcional), `startedOnDay?`, `owner?` (texto livre), `description`, `notes` e `cost?`. O custo é só informativo e nunca é descontado.
- A barra mostra "X concluídas · Y em andamento". O painel tem as abas **Em andamento** e **Concluídas**.
- **Mestre:** **Nova pesquisa** (inclusive pesquisas antigas, já concluídas), **Editar**, **Concluir** (marca como concluída no dia atual), **Remover** e as categorias.
- **Estação de Estudo:** depois de construída, o painel lateral dela ganha o **Arquivo de Pesquisas**, com as fichas completas, filtro por status e categoria e busca por título. Antes disso, o painel da barra mostra a lista resumida com uma dica.

### Influência

- Os mundos são **fixos** e ficam em `src/data/influence.json` (`worlds`: `id`, `name`, `color`, `icon?`, `description?`), na ordem em que aparecem no jogo: Mundo Humano, Floresta dos Elfos, Bosque das Fadas, Montanhas Anãs, Reino dos Meio-Humanos, Terras Dracônicas e Terras Ínferas. Todos começam em 0%.
- O save guarda só a % de cada mundo. Nome, cor e descrição vêm sempre do JSON.
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

- **Habilidades** em `src/data/skills.json` (`id`, `name`, `icon`, `description`): Construção, Ferraria, Gastronomia, Pesquisa, Medicina e Alquimia. Cada NPC tem de -10 a 10 em cada uma; negativo atrapalha o posto.
- **Moradia e postos** ficam por nível no `buildings.json`:

  ```json
  "housing": { "capacity": 4 },
  "jobs": [
    { "activity": "forjar", "name": "Forjar", "skill": "smithing", "slots": 2,
      "effect": { "type": "produce", "material": "iron", "perDay": 2 } }
  ]
  ```

  Moradia por nível: Alojamento 6/14/14, Torre dos Magos 2/3/4 e Taverna 2/2/3.

  Efeitos: `produce` (material por dia), `research` (pontos na pesquisa escolhida), `construction` (dias a menos na obra) e `bonus` (texto nos Bônus ativos, com um `penalty` opcional para quando alguém atrapalha). O posto **Construir**, que aparece em toda obra em andamento, e o divisor das habilidades negativas (`negativeDivisor`) ficam em `src/data/npcs.json`.

- **Rendimento:** `base × (1 + habilidade / 10)`, mostrado com uma casa decimal ("Gus: +3,4 Ferro por dia"). A fração se acumula no posto, e o NPC entrega unidades inteiras.
- **Habilidade negativa:** rende `base × habilidade / 5` e atrapalha: consome material (sem passar de 0), faz a pesquisa regredir (sem passar de 0%), atrasa a obra ou troca o bônus pela penalidade. Aparece em vermelho, com "⚠ atrapalha" no seletor do posto. Vários NPCs no mesmo posto contam separados, então um bom e um ruim se compensam.
- **Quem faz o quê:** só o mestre cria, edita (habilidades, salário, situação) e remove NPCs. Jogadores e mestre escolhem moradia e designam ou dispensam trabalho, pelo botão **NPCs** na barra e pelo painel de cada construção.
- **Regras:**
  - Trabalho exige moradia.
  - Um trabalho por vez.
  - Capacidade e postos vêm do nível em vigor: durante uma melhoria a construção continua funcionando no nível atual.
  - Remover uma construção, reduzir a capacidade, terminar uma obra ou encerrar a pesquisa alvo libera os NPCs, com registro no log.
- **Ao avançar dias**, cada dia processa, nesta ordem:
  1. Salários: o Acampamento paga (o salário é digitado em moedas e salvo em PO); sem saldo, o NPC não trabalha naquele dia.
  2. Efeitos dos postos.
  3. Conclusão das obras.

  Pesquisas param em 100% com o aviso "pronta para concluir"; quem conclui é o mestre. Feridos e NPCs em missão mantêm casa e posto, mas não trabalham nem recebem.

- **Save:** versão 5. Saves da versão 4 ganham `npcs: []` ao carregar; online o estado continua no mesmo jsonb.

## Arquivo de registros

Os registros da campanha (relatórios, formulários, anotações sobre personagens, cartas) ficam no **Arquivo**, organizados em **tópicos** com **notas**. O design completo está em `docs/plans/ARQUIVO.md`.

- **Onde abrir:** no painel do Arquivo construído (nível ≥ 1), o botão **Abrir registros** mostra a contagem de tópicos e notas. O mestre também abre pelas ferramentas do mestre, mesmo sem o Arquivo construído.
- **Janela:** tópicos à esquerda (ícone, nome e quantidade de notas), notas do tópico à direita (fixadas primeiro, cada uma recolhe e expande) e uma busca no título e no texto, que ignora maiúsculas e acentos. No celular vira duas etapas (tópicos → notas). A janela lembra o último tópico aberto.
- **Quem faz o quê:** jogadores e mestre criam, editam, reordenam, movem e removem qualquer tópico ou nota `todos`. Só o mestre cria, vê e edita notas `mestre`; os jogadores nunca as recebem (nem na lista, nem na busca, nem na contagem, nem no log). Offline o jogador escolhe o personagem no topo da janela.
- **Lixeira:** remover manda para a lixeira, onde qualquer um restaura. Só o mestre esvazia. Um tópico só sai quando está vazio (mova as notas antes).
- **Colar registros:** cole o texto do Discord. Cada linha só de traços (`-----`, 5 ou mais) separa um registro, e a primeira linha vira o título. Há uma prévia antes de salvar.
- **Formatação do Discord:** `**negrito**`, `*itálico*`/`_itálico_`, `__sublinhado__`, `~~riscado~~`, `>`/`>>>` citação, listas `-`/`*`/`1.`, títulos `#`/`##`/`###` e linha de traços. O editor tem o botão **Prévia**. O texto é montado sem `innerHTML`: o que não é marcação aparece literal.
- **Limites:** título até 200 caracteres e nota até 20.000.
- **Log:** toda ação vira uma entrada com quem fez ("Thorin criou o tópico Pets", "Mestre moveu 'Zolt-Raak' de NPCs para Jogadores"), menos as que envolvem notas `mestre`.
- **Onde fica:** fora do `GameState`. Offline, em `localStorage` (`axis-base-builder:archive`); online, nas tabelas `archive_topics` e `archive_notes`. **Exportar/Importar save** levam o arquivo junto, na chave `archive`.

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

1. **Login por e-mail:** a pessoa digita o e-mail e recebe um link (magic link), sem senha.
2. **Convite:** o link de convite do mestre (`?invite=…`) liga o jogador ao personagem. Ele sobrevive ao login, porque o magic link volta para a mesma URL.
3. **Mesa:** quem ainda não participa de nenhuma mesa pode criar uma (vira o mestre), começando do seed ou de um save exportado. Com várias mesas, `?game=<id>` escolhe qual abrir.
4. **Papel:** as ferramentas de mestre aparecem para quem tem `role = master` em `players`. No online, "Sair da conta" substitui "Sair do modo mestre". Quem decide de fato é o servidor.

**Convites (mestre):** na aba **Mestre** da gaveta, o cartão **Convites** gera um link por personagem (botão **Copiar link**) e lista os convites pendentes, que podem ser cancelados.

**Histórico completo:** na aba **Registro**, abaixo das entradas recentes (o `state.log` guarda só as últimas 200), o cartão **Histórico completo** lê o `game_log` em páginas de 50.

O código online (e o `supabase-js`) só é baixado quando as variáveis do Supabase existem; offline, o jogo carrega como antes.

### Regras no servidor (Edge Function)

O servidor roda **o mesmo código** do jogo. `npm run build:functions` empacota (esbuild) as regras, o zod e os JSONs de `src/data` num único módulo, `supabase/functions/_shared/game.js` (gerado, fora do git). Assim a Edge Function valida com exatamente os dados do commit publicado.

| Comando                   | O que faz                                                                   |
| ------------------------- | --------------------------------------------------------------------------- |
| `npm run build:functions` | Gera o bundle das regras para as Edge Functions                             |
| `npm run parity`          | Gera o bundle e roda os mesmos comandos em Node e em Deno; falha se divergir |

O Deno vem como devDependency (`npx deno`), não precisa instalar à parte.

A função `game` (`supabase/functions/game/index.ts`) só liga o bundle ao `supabase-js`. A lógica está em `src/server/`:

- **JWT:** sem token ou com token inválido → **401**. O papel e o personagem vêm da tabela `players`, nunca do corpo da requisição.
- **`command`:** `{ gameId, command, expectedRevision }` → aplica o `applyCommand` e grava com `commit_game_update`. Respostas: **200** `{ state }`, **403** (não membro ou sem permissão), **409** (revisão desatualizada), **422** (requisição ou comando inválidos).
- **`create_game`:** cria o jogo a partir do seed ou de um save exportado (`state`); quem cria vira mestre.
- **`restore_save`:** (mestre) substitui o jogo por um backup, como a próxima revisão.
- **Convites:** `create_invite` (mestre) gera um token de uso único para um personagem, válido por 7 dias (até 30); o banco guarda só o hash. `accept_invite` liga quem aceitou ao personagem; `revoke_invite` cancela um convite pendente.
- Testes em `src/server/http.test.ts` e `src/server/handler.test.ts`, com o banco simulado em memória.

| Comando                    | O que faz                                                   |
| -------------------------- | ----------------------------------------------------------- |
| `npm run check:functions`  | Gera o bundle e confere os tipos da função com o Deno        |
| `npm run deploy:functions` | Gera o bundle e publica a função (precisa do CLI logado)      |

### Banco (Supabase)

`supabase/migrations/` cria as tabelas `games` (estado em jsonb + `revision`), `players` (papel e personagem), `game_log` (histórico completo) e `invites` (convites de uso único, só o hash do token é gravado).

- **RLS:** clientes só **leem**, e só os jogos de que participam. Ninguém grava direto: as escritas passam pela Edge Function, que usa a service role e as funções `commit_game_update` (grava só se a `revision` bater), `create_game` e `accept_invite`.
- `games` está na publicação do Realtime, que também respeita a RLS.
- **Arquivo de registros:** `archive_topics` e `archive_notes` são a exceção: membros escrevem direto, e a RLS só deixa o mestre ler e escrever as notas `mestre` (jogador não cria nem transforma uma nota em `mestre`). Um trigger recusa mandar à lixeira um tópico com notas, contando as `mestre` sem revelá-las, e `replace_archive` (só o mestre) restaura o arquivo de um save importado. As duas tabelas estão no Realtime.
- **Verificação:** `supabase/tests/games_rls.test.sql` e `supabase/tests/archive_rls.test.sql` (pgTAP). Com o Docker rodando: `npx supabase start` e depois `npx supabase test db`.

O Supabase CLI vem como devDependency: use `npx supabase …`.

## Estrutura

```
src/
  main.ts            monta UI + jogo
  store.ts           estado atual, envio de comandos e eventos (camada imperativa)
  commands/          comandos serializáveis e applyCommand (regras + permissões)
  archiveStore.ts    Arquivo de registros: envio de comandos e avisos de mudança
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
scripts/             gerador de placeholders, bundle das Edge Functions, paridade Node/Deno
public/assets/       textures/, buildings/, icons/
docs/map-reference/  imagem e scripts de referência do mapa
supabase/            config, migrations SQL (tabelas + RLS), testes pgTAP e Edge Functions
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

   - `allowedSlots`: `core` (centro), `middle` (os 8 arcos em volta do disco azul) e/ou `outer` (os arcos junto à muralha).
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
