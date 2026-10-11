# Prompt — Arquivo de Registros (tópicos e notas no Arquivo)

Projeto em `C:\Users\Perdido\.antigravity\clash`. Hoje guardo os registros da campanha (relatórios, formulários, anotações sobre personagens, cartas) num canal do Discord, e fica tudo desorganizado. Quero que o **Arquivo** (`archive`, anel do meio) tenha uma **janela de registros organizados em tópicos**, cada um com suas **notas**.

Leia o código, me mostre o plano em poucas linhas e **espere meu ok**. Registre o design em `docs/plans/ARQUIVO.md` antes de implementar. Faça um commit por parte. Use como referência o `ResearchArchive` da Estação de Estudo (seção extra no painel da construção) e o `<dialog>` de `src/ui/Credits.ts`.

## Como funciona

- Clicar no Arquivo já construído (nível em vigor ≥ 1) mostra no painel lateral o botão **"Abrir registros"**, com a contagem de tópicos e notas.
- O botão abre uma **janela grande** (`<dialog>` modal, quase tela cheia, que fecha com Esc ou no X), com duas colunas:
  - **à esquerda, os tópicos**: nome, ícone/emoji opcional e quantidade de notas. Inclua uma busca que procura no título e no texto de todas as notas;
  - **à direita, as notas do tópico escolhido**: título, dia de jogo e texto formatado. Cada nota pode ser recolhida ou expandida, e as notas fixadas aparecem primeiro.
- No celular, as colunas viram navegação em duas etapas (lista de tópicos → notas).
- A janela lembra o último tópico aberto (`uiMemory`).
- Se o Arquivo não estiver construído, o **mestre** continua podendo abrir a janela pelas ferramentas do mestre. Os jogadores só têm acesso depois que o Arquivo é construído.
- **Se o Arquivo for removido** (só o mestre pode remover estruturas), os registros **não são apagados**. Os jogadores só perdem o acesso até o Arquivo ser reconstruído; aí tudo volta como estava. Durante uma melhoria, o Arquivo continua acessível. Os registros não dependem do espaço nem do nível da construção. Teste isso.

## Tópicos e notas

- **Tópico:** `id`, `name`, `icon?`, `order`, `authorId`. Um nível só, sem subtópicos (decidido). Exemplos: NPCs, Monstros, Jogadores, Itens, Mapas, Relatórios.
- **Nota:** `id`, `topicId`, `title`, `body` (texto), `day` (dia de jogo em que foi registrada; preenche com o dia atual e pode ser editado), `pinned`, `visibility: 'todos' | 'mestre'`, `createdAt`, `updatedAt`.
- **Quem faz o quê:** é uma mesa de amigos, então a liberdade é total.
  - **jogadores e mestre** criam, editam, reordenam, movem e removem **qualquer** tópico ou nota `todos`, inclusive os criados por outra pessoa;
  - só o **mestre** cria, vê, edita e remove notas `mestre`;
  - os jogadores **nunca veem** notas `mestre` (o "coiso secreto"): nem na lista, nem na busca, nem na contagem do tópico, nem no log. Um tópico que só tem notas `mestre` aparece vazio para eles. Se um jogador tentar remover esse tópico, a remoção é recusada como "não vazio", sem revelar o porquê.
- **Tudo vai para o histórico, com quem fez:** criar, editar (com o título), mover, reordenar e remover, tanto de tópico quanto de nota. Ver a seção Log.
- **Lixeira:** nota ou tópico removido não some de vez. Vai para uma lixeira na própria janela, onde qualquer um pode restaurar. Esvaziar a lixeira é só do mestre. Assim, um clique errado não apaga registros de 20 sessões.
- A nota guarda o **autor** (`authorId`: o id do personagem, ou `mestre`) e quem editou por último (`editedBy`), e mostra "por Fulano · editado por Beltrano". Offline, sem login, o jogador escolhe o personagem como já é feito no depósito de moedas.
- Para remover um tópico, ele precisa estar vazio: quem for remover move as notas antes. Use o mesmo padrão de `category_not_empty`.
- **Colar vários de uma vez:** no tópico, a opção "Colar registros" recebe um texto grande e divide em notas a cada linha só de traços (`-----`, 5 ou mais), que é como separo no Discord. Mostre uma prévia antes de salvar. O título de cada nota é a primeira linha (sem `**`).

## Texto formatado

O texto vem colado do Discord, então suporte o **markdown do Discord**: `**negrito**`, `*itálico*` / `_itálico_`, `__sublinhado__`, `~~riscado~~`, `> citação` (e `>>>`), listas com `-` / `*` / `1.`, títulos `#` / `##` / `###`, linha de traços como separador e quebras de linha.

- **Nada de `innerHTML`.** Monte os elementos com `el()` (`src/ui/dom.ts`), num renderizador pequeno e testado. Texto desconhecido aparece literal.
- No editor, deixe um botão **Prévia** para alternar entre o texto cru e o formatado.

## Onde guardar (decida e justifique no plano)

Hoje o `GameState` inteiro vai e volta a cada comando e no realtime, e as notas podem passar de centenas de KB. Além disso, as notas só do mestre **não podem chegar ao navegador dos jogadores**. Minha sugestão, que você pode contestar:

- **Online:** tabelas próprias no Supabase (`archive_topics`, `archive_notes`), com RLS:
  - membros do jogo leem os tópicos e as notas `todos`;
  - membros escrevem (inserir, editar, remover) qualquer tópico e qualquer nota `todos`. Jogadores não podem criar uma nota `mestre` nem mudar uma nota para `mestre`;
  - só o mestre lê e escreve as notas `mestre`.
  
  Realtime nessas tabelas. Migração nova em `supabase/migrations/` e testes pgTAP como os de `games_rls.test.sql`.
- **Offline:** chave própria no `localStorage`, com repositório no mesmo formato do `LocalRepository`. O **Exportar/Importar save** inclui o arquivo.
- As regras (validação com zod, permissões, colar em lote, ordenação) ficam em funções puras em `src/systems/Archive.ts`, testadas, e iguais nos dois modos.
- Limites: título até 200 caracteres, nota até 20.000. Acima disso, recuse com mensagem.

Se você concluir que é melhor ficar no `GameState` (com migração para a versão 6), explique como as notas do mestre ficam escondidas dos jogadores.

## Log

- Toda ação no Arquivo entra no log do jogo, com o `actor` de sempre:
  - "Thorin criou o tópico Pets";
  - "Bia editou 'Requisição de Selos'";
  - "Mestre moveu 'Zolt-Raak' de NPCs para Jogadores";
  - "Gus removeu 'Mapa do Portão Oito' (está na lixeira)";
  - "Bia restaurou ...".
- Online, as entradas vão também para o histórico completo (`game_log`).
- Ações sobre notas `mestre` **não** vão para o log, para não vazar.

## Testes

- Renderizador de markdown (cada marcação, combinações e texto malicioso tipo `<script>`).
- Divisão do "Colar registros".
- Permissões, offline e online (pgTAP):
  - jogador cria, edita e remove tópico e nota `todos`, inclusive de outro autor;
  - jogador é recusado ao criar uma nota `mestre` ou ao transformar uma nota em `mestre`;
  - jogador nunca recebe notas `mestre`;
  - remover e restaurar pela lixeira;
  - o log registra o autor de cada ação e nunca registra notas `mestre`.
- Remover tópico com notas.
- Mover nota.
- Busca.
- Export/import com o arquivo.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`, e atualize o README (seção "Arquivo de registros").
