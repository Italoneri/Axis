# Arquivo de registros: tópicos e notas no Arquivo

Objetivo: tirar os registros da campanha (relatórios, formulários, anotações sobre personagens, cartas) do canal do Discord e organizá-los no **Arquivo** (`archive`, anel do meio), numa janela com **tópicos** e **notas**. Jogadores e mestre editam tudo livremente; só as notas `mestre` são do mestre e **nunca chegam ao navegador dos jogadores**.

## Onde guardar: fora do `GameState`

O `GameState` inteiro vai e volta a cada comando e no realtime; centenas de KB de notas pesariam em cada clique. E, dentro do `GameState`, esconder as notas `mestre` exigiria um estado por papel (cortar no servidor antes de responder, no realtime, no `game_log`…). Tabelas com RLS resolvem isso no banco.

| Modo    | Onde                                                        | Quem decide                                                      |
| ------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Online  | `archive_topics`, `archive_notes` (Supabase, RLS, realtime) | as regras puras rodam no cliente; RLS e trigger são a autoridade |
| Offline | `localStorage['axis-base-builder:archive']`                 | as mesmas regras puras                                           |

Offline, as notas `mestre` ficam só escondidas pela interface: é o mesmo navegador, como já acontece com a senha do mestre.

## Dados (`src/systems/Archive.ts`, zod)

- **Tópico:** `id`, `name` (1–200), `icon?` (emoji), `order`, `authorId`, `deletedAt` (`null` fora da lixeira). Um nível só, sem subtópicos.
- **Nota:** `id`, `topicId`, `title` (1–200), `body` (até 20.000), `day`, `pinned`, `visibility: 'todos' | 'mestre'`, `order`, `authorId`, `editedBy?`, `createdAt`, `updatedAt`, `deletedAt`.
  - `order` não estava no pedido, mas sem ele não dá para reordenar notas.
  - `authorId` / `editedBy`: id do personagem ou `mestre`. A nota mostra "por Fulano · editado por Beltrano".
- **Quem vê (`Viewer`):** `{ role: 'master' }` ou `{ role: 'player', characterId }`. Offline o jogador escolhe o personagem num seletor da janela (lembrado em `uiMemory`); online vem do login.

## Regras (puras, iguais nos dois modos)

`applyArchiveCommand(archive, command, { viewer, now })` devolve o arquivo novo e um rascunho de log (ou `null`), ou um erro.

| Comando                         | Regra                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `topic_create` / `topic_update` | nome não vazio, sem repetir (como as categorias)                                        |
| `topic_shift` (`up`/`down`)     | troca a ordem com o vizinho visível                                                     |
| `topic_remove`                  | vai para a lixeira; precisa estar vazio, contando notas `mestre` → `category_not_empty` |
| `topic_restore`                 | sai da lixeira                                                                          |
| `note_create` / `note_update`   | título não vazio; limites; jogador nunca cria nem transforma em `mestre` → `forbidden`  |
| `note_move`                     | para outro tópico fora da lixeira                                                       |
| `note_shift`                    | troca a ordem com a vizinha visível                                                     |
| `note_remove` / `note_restore`  | lixeira; restaurar uma nota cujo tópico está na lixeira restaura o tópico junto         |
| `notes_paste`                   | várias notas de uma vez, num tópico                                                     |
| `trash_empty`                   | só o mestre; apaga de vez o que está na lixeira                                         |

- Para um jogador, nota `mestre` não existe: comandos sobre ela respondem `not_found`. Um tópico só com notas `mestre` aparece vazio e a remoção é recusada como `category_not_empty`, sem dizer o porquê.
- Ordem de exibição: tópicos por `order`; notas fixadas primeiro, depois `order`, depois `createdAt`.
- Busca: título e texto das notas visíveis, sem diferenciar maiúsculas nem acentos.

### Colar registros

`splitPastedRecords(text)` divide a cada linha só de traços (5 ou mais). Cada pedaço vira uma nota com o texto inteiro (só as linhas vazias das pontas saem). O título é numerado (`numberedTitle`): prefixo (padrão `Registro`, vazio = só o número) mais um número que começa no próximo livre do tópico (`nextRecordNumber`, contando a lixeira); cada título pode ser editado na prévia. Uma prévia mostra as notas antes de salvar; texto acima do limite marca a nota e bloqueia o salvamento.

## Texto formatado (markdown do Discord)

`parseDiscordMarkdown(text)` (puro, testado) gera uma árvore; `renderMarkdown` monta os elementos com `el()`. **Nada de `innerHTML`**: texto desconhecido (inclusive `<script>`) aparece literal.

- Blocos: `#`/`##`/`###`, `> ` (linhas seguidas), `>>> ` (até o fim), listas `-`/`*`/`1.`, linha de traços (`---` ou mais) e parágrafos com quebras de linha.
- Inline: `**negrito**`, `*itálico*`, `_itálico_` (só entre palavras, como no Discord: `snake_case` fica literal), `__sublinhado__`, `~~riscado~~`, combináveis.

## Log

Novo `GameCommand` `archive_log` (liberado para jogadores) com uma entrada `archive_changed`: `action` (`created`, `edited`, `moved`, `reordered`, `removed`, `restored`, `pasted`, `trash_emptied`), `target` (`topic`/`note`), `title`, `from?`, `to?`, `count?`. O `actor` é carimbado pelo `applyCommand` (online, pelo servidor a partir do login), então a entrada entra no `state.log` e no `game_log` como qualquer outra.

- É despachado depois que a escrita no arquivo deu certo. Não é atômico (são duas escritas) e o servidor não confere o texto da entrada; para uma mesa de amigos, aceitável.
- **Nunca** é despachado para notas `mestre` (nem para colar em lote só de notas `mestre`).
- "Colar registros" gera uma entrada só ("Bia colou 12 registros em NPCs"). Esvaziar a lixeira registra só o fato, sem contagem.
- Novo tipo de entrada é só um acréscimo: não muda a versão do save.

## Online (Supabase)

Migração `supabase/migrations/20261011000000_archive.sql`:

- Tabelas com chave `(game_id, id)`, `check` nos limites, `deleted_at`, coluna `position` (`order` é palavra reservada) e `on delete cascade` das notas pelo tópico.
- RLS:
  - tópicos: membros leem e escrevem; `delete` (esvaziar lixeira) só o mestre;
  - notas: membros leem/inserem/editam as `todos`; o `with check` impede um jogador de criar ou transformar uma nota em `mestre`; só o mestre lê/escreve as `mestre`; `delete` só o mestre.
- Trigger `security definer`: mandar à lixeira um tópico com notas fora da lixeira (de qualquer visibilidade) falha com a mensagem `category_not_empty`, a mesma da regra pura.
- Realtime nas duas tabelas (respeita o RLS). Limitação conhecida: se o mestre transformar uma nota `todos` em `mestre`, o jogador não recebe o evento e mantém a cópia antiga até reabrir a janela.
- O autor não é conferido pelo banco (`author_id` vem do cliente): mesa de amigos.
- pgTAP em `supabase/tests/archive_rls.test.sql`.

`SupabaseArchiveRepository` roda a regra pura sobre a cópia em memória, grava a diferença (`upsert` de linhas mudadas, `delete` das apagadas) e traduz `42501` em `forbidden` e o erro do trigger em `category_not_empty`.

## Exportar/Importar

O save exportado ganha uma chave `archive` opcional (`{ topics, notes }`). Saves antigos continuam válidos e versões antigas do jogo ignoram a chave.

- Offline: exporta e importa tudo.
- Online: exporta o que quem exporta vê (o mestre vê tudo). Importar um save com arquivo substitui as tabelas; o RLS só permite isso ao mestre.

## Interface

- Painel do Arquivo construído (nível em vigor ≥ 1): seção com **"Abrir registros"** e a contagem de tópicos e notas.
- Ferramentas do mestre: o mesmo botão, mesmo sem o Arquivo construído.
- `ArchiveWindow`: `<dialog>` modal quase tela cheia (Esc ou ×). Esquerda: busca, tópicos (ícone, nome, contagem), lixeira. Direita: notas do tópico (recolher/expandir, fixadas primeiro), "Nova nota", "Colar registros". No celular, duas etapas (tópicos → notas). Último tópico em `uiMemory`.
- Editor de nota com botão **Prévia** (cru ↔ formatado).

## Partes (um commit cada)

1. Este documento.
2. `Archive.ts`, markdown e colar registros, com testes.
3. Repositório offline e exportar/importar.
4. Comando `archive_log` e textos do log.
5. Migração, pgTAP e repositório online (antes da janela, que liga os dois modos).
6. Janela e entradas na interface.
7. README.

---

# Imagens anexadas às notas

Fotos de anotações, prints do Discord e mapas anexados às notas.

## Metadados: dentro da nota (`images`)

Cada nota ganha `images: ArchiveImage[]` (no máximo 12), e a posição no array é a ordem:

- `id`, `caption` (legenda, até 300 caracteres, pode ser vazia), `width`, `height`, `bytes` (tamanho comprimido) e `format` (`webp` ou `jpeg`, o mesmo da miniatura).

Online fica numa coluna **`images jsonb`** em `archive_notes`, e não numa tabela própria, porque assim:

- as imagens seguem a nota de graça: RLS e visibilidade `mestre`, lixeira (`deleted_at`), realtime, `replace_archive` e o export;
- uma tabela à parte exigiria repetir as policies, e ainda haveria uma janela em que a imagem existe e a nota não.

12 itens pequenos não pesam na linha. Saves e arquivos antigos sem `images` são lidos como `[]`.

## Regras (puras)

- **`note_create` / `note_update`** recebem a lista `images` completa, com ids únicos e no máximo 12. Os blobs já foram enviados quando o editor anexou (veja abaixo).
  - Se a lista tem imagens novas, o log é "Bia anexou 2 imagens a 'Mapa do Portão Oito'". Sem imagens novas, segue "editou".
- **`note_image_remove { noteId, imageId }`**: remover uma imagem já salva vale **na hora**, sem esperar o "Salvar" do editor. Log: "Gus removeu uma imagem de '...'".
- **Lixeira:** a nota leva as imagens junto e as devolve ao ser restaurada. **`droppedImages(antes, depois)`** lista as imagens que deixaram de existir: removidas da nota ou cuja nota foi apagada de vez ao esvaziar a lixeira. Só essas têm os arquivos apagados.
- **Busca:** procura também nas legendas.
- **Notas `mestre`:** nada sobre elas vai para o log, como já é hoje.

## Arquivos (blobs)

`ArchiveImageStore` tem `put`, `url`, `read` e `remove`, com chave `nota/imagem` e o tipo (`full` ou `thumb`).

| Modo    | Onde                                                                                             | URL                                                                    |
| ------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Offline | IndexedDB `axis-base-builder:archive-images`                                                     | `URL.createObjectURL`, guardada em cache                               |
| Online  | bucket privado `archive-images`, `game_id/note_id/image_id.webp` e `image_id.thumb.webp` ao lado | signed URL de 10 min, guardada até perto de expirar e renovada sozinha |

- **Fluxo do editor:**
  1. Anexar (seletor, arrastar ou Ctrl+V) valida o arquivo, comprime e envia o blob na hora. O editor mostra o arquivo local.
  2. "Cancelar" apaga os blobs enviados e não salvos.
  3. "Salvar" grava a lista.
- **Apagar os arquivos:** o `ArchiveStore` faz isso depois de cada escrita aceita, a partir de `droppedImages`.
- **Compressão no navegador:**
  - lado maior até 2000 px, WebP 0,85 (JPEG 0,85 se o navegador não gera WebP), miniatura de 320 px;
  - GIF vira estático (o primeiro quadro);
  - formatos aceitos: JPG, PNG, WebP e GIF;
  - limites em `IMAGE_LIMITS`: original até 10 MB, comprimida até 2 MB, 12 por nota. Acima disso, a recusa vem com a mensagem do motivo.
  - O cálculo das dimensões (`fitWithin`) e a validação (`checkImageFile`) são funções puras, com teste.

## Storage (migração `20261012000000_archive_images.sql`)

- Bucket privado, limite de 2 MB por objeto e apenas `image/webp` e `image/jpeg`.
- `can_read_archive_image(nome)` e `can_write_archive_image(nome)` (`security definer`, para enxergar a visibilidade da nota) leem `game_id/note_id` do caminho:
  - **ler:** a nota existe e quem pede a vê (mestre vê tudo); arquivo sem nota, só o mestre;
  - **escrever ou apagar:** membro da mesa, e a nota ainda não existe (nota nova no editor) ou é uma que ele vê. Jogador nunca toca imagens de nota `mestre`; não membro, nada.
- `replace_archive` passa a gravar `images`.
- Testes pgTAP em `supabase/tests/archive_images.test.sql`.

## Exportar/Importar

- Sem imagens, o save continua um `.json`.
- Com imagens, vira um **`.zip`**: `save.json` mais `images/<nota>/<imagem>.<ext>` e `.thumb.<ext>` (`fflate`; as imagens já estão comprimidas, então o zip só as guarda).
- A importação aceita `.json` e `.zip`. Imagem faltando no zip não derruba a importação: a nota fica sem o arquivo e mostra o placeholder.
- Online, exporta as imagens que quem exporta vê. Importar (só o mestre) grava as notas, envia as imagens e apaga as das notas antigas.

## Publicação

- `npx supabase db push`, por causa do bucket, das policies e da coluna.
- `npm run deploy:functions`: o log ganha dois tipos de entrada que o servidor valida (`archive_log`).

## Partes (um commit cada)

1. Este plano.
2. Regras e metadados (`Archive.ts`, log), limites e dimensões, com testes.
3. Arquivos offline (IndexedDB), compressão e `ArchiveStore`.
4. Online: migração, pgTAP e Storage no repositório.
5. Interface: anexar, legendas, miniaturas e visualizador.
6. Exportar/Importar com `.zip`.
7. README.
