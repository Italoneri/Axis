# Prompt — Enviar fotos dentro do jogo (NPCs, materiais, personagens e mundos)

Projeto em `C:\Users\Perdido\.antigravity\clash`. Hoje o retrato de NPCs e personagens e o ícone de materiais e mundos (`imageRef` em `src/model/schema.ts`) são um **campo de texto**, onde se digita uma chave do `assets.json` ou uma URL. Quero **enviar a foto direto pelo jogo**.

Leia o código e reaproveite o que o Arquivo já tem para imagens: compressão no navegador, `LocalImageStore` (IndexedDB) offline, bucket privado com signed URLs online e o export/import em `.zip`. Me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte. No final, diga quais comandos de publicação a mudança exige (deve precisar de `npx supabase db push` e `npm run deploy:functions`).

## Como funciona

- Nos formulários de **NPC**, **material**, **personagem** e **mundo de influência**, troque o campo de texto por um **seletor de imagem** com:
  - prévia redonda, no mesmo recorte do `thumb`;
  - botões **"Enviar foto"** (seletor de arquivo), **arrastar e soltar** e **colar (Ctrl+V)**;
  - **"Remover foto"**, que volta para a inicial com a cor, como hoje.
  
  Mantenha um link discreto "usar URL ou chave do jogo" para quem quiser o comportamento antigo.
- **Recorte:** ao escolher a imagem, abra um recorte **quadrado** simples (arrastar e dar zoom) antes de salvar, porque retratos e ícones aparecem em círculo. Um recorte central automático já serve se o manual complicar; justifique no plano.
- **Tamanho:** salve em **512×512** (WebP, qualidade ~0,85) mais uma miniatura de **128×128**. Limites: arquivo original até 10 MB, resultado até 300 KB. Formatos: JPG, PNG, WebP e GIF estático.
- **Quem pode trocar** segue quem já edita cada coisa:
  - NPC, material e mundo: o mestre;
  - personagem: o **próprio jogador dono dele** e o mestre.

## Onde guardar

- **No estado:** o `imageRef` passa a aceitar também uma referência a imagem enviada (ex.: `upload:<id>`), resolvida para URL pelo `resolveImage`/`thumb`. As referências antigas (chave de asset ou URL) continuam funcionando. Se precisar de migração, faça; se o schema só ficar mais permissivo, não precisa.
- **Online:** um bucket **privado** novo (ex.: `game-images`), com caminho `game_id/<tipo>/<id>.webp` mais a miniatura. Policies:
  - membros do jogo **leem**;
  - o mestre escreve tudo;
  - um jogador escreve só no caminho do **próprio personagem**.
  
  Migração SQL nova e testes pgTAP, como os do Arquivo.
- **Offline:** IndexedDB, reaproveitando o `LocalImageStore` ou com um store irmão.
- **Exportar/Importar save:** essas imagens entram no `.zip`, junto com as do Arquivo.
- Ao trocar ou remover uma foto, apague o arquivo antigo, para não acumular.

## Testes

- Validação de formato e tamanho.
- Cálculo do recorte e das dimensões (função pura).
- Resolução de `upload:` e das referências antigas.
- Permissões: jogador troca a foto do próprio personagem, mas não a de outro personagem, NPC ou material (no `applyCommand` e em pgTAP).
- Export/import com as fotos.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`, e atualize o README.
