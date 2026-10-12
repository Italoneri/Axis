# Prompt — Imagens anexadas no Arquivo de registros

Projeto em `C:\Users\Perdido\.antigravity\clash`. O Arquivo de registros (`src/systems/Archive.ts`, `src/persistence/*ArchiveRepository.ts`, `src/ui/archive/`) já funciona com tópicos, notas, lixeira e notas `mestre`. Agora quero **anexar imagens às notas**: tenho anotações em foto, prints do Discord e mapas.

Leia o código atual do Arquivo e o `docs/plans/ARQUIVO.md`, me mostre o plano em poucas linhas e **espere meu ok**. Atualize o plano antes de implementar e faça um commit por parte. No final, diga quais comandos de publicação a mudança exige: aqui deve precisar de `npx supabase db push`, por causa do Storage.

## Como funciona

- No editor da nota há três formas de anexar uma ou várias imagens:
  - **"Anexar imagem"**, que abre o seletor de arquivos;
  - **arrastar e soltar**;
  - **colar com Ctrl+V**, para prints copiados direto do Discord.
- A nota mostra as imagens em **miniaturas** abaixo do texto. Clicar abre a imagem **ampliada**, numa visualização com zoom, setas para passar entre as imagens da nota e Esc para fechar.
- Cada imagem tem uma **legenda** opcional e pode ser removida ou reordenada.
- Dá para criar uma nota **só com imagem**, sem texto. Nesse caso o título continua obrigatório.
- A busca procura também nas legendas.
- **Permissões:** as mesmas das notas, então qualquer membro anexa e remove. Imagens de notas `mestre` seguem a nota e **nunca chegam aos jogadores**.

## Tamanho e formato

- Aceite JPG, PNG, WebP e GIF (GIF estático). Recuse outros formatos com uma mensagem.
- **Comprima no navegador antes de enviar:** lado maior de até 2000 px, em WebP ou JPEG com qualidade em torno de 0,85. Gere também uma miniatura de cerca de 320 px.
- Limites, todos configuráveis:
  - até 10 MB por arquivo original;
  - até 2 MB depois de comprimido;
  - até 12 imagens por nota.
  
  Acima disso, recuse com uma mensagem clara.

## Onde guardar

- **Online:** um bucket **privado** no Supabase Storage (ex.: `archive-images`), com caminho `game_id/note_id/image_id.webp` e a miniatura ao lado. As policies de Storage seguem as mesmas regras de leitura e escrita das notas, inclusive a de notas `mestre`. Crie isso numa migração nova, com testes pgTAP como os de `archive_rls.test.sql`. Os metadados (id, legenda, ordem, largura, altura, tamanho) ficam numa coluna `images jsonb` em `archive_notes`, ou numa tabela própria. Escolha e justifique. Exiba com signed URLs de curta duração, renovadas quando expirarem.
- **Offline:** **IndexedDB** (o `localStorage` não aguenta imagens), com repositório separado no mesmo estilo do `LocalArchiveRepository`. Os metadados continuam junto com a nota.
- **Lixeira:** nota na lixeira mantém as imagens, e elas voltam se a nota for restaurada. Só esvaziar a lixeira apaga os arquivos de verdade. Remover uma imagem avulsa do editor apaga na hora.
- **Exportar/Importar save:** inclua as imagens. Se o arquivo ficar grande demais em JSON com base64, gere um `.zip` (save + pasta de imagens) e aceite os dois formatos na importação. Saves antigos sem imagens continuam válidos.

## Log

- "Bia anexou 2 imagens a 'Mapa do Portão Oito'" e "Gus removeu uma imagem de '...'".
- Como já acontece hoje, nada sobre notas `mestre` vai para o log.

## Testes

- Validação de formato e limites.
- Redimensionamento: teste com uma função pura de cálculo de dimensões.
- Ordem e legenda.
- Imagens seguindo a nota para a lixeira e voltando ao restaurar.
- Esvaziar a lixeira apagando os arquivos.
- Policies de Storage (pgTAP):
  - jogador lê e envia imagens em notas `todos`;
  - jogador nunca acessa imagens de notas `mestre`;
  - não membro não acessa nada.
- Export/import com imagens, offline.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` (e `npx supabase test db`, se o Docker estiver rodando), e atualize o README (seção Arquivo de registros).
