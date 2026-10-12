# Prompt — "Colar registros" com títulos numerados

Projeto em `C:\Users\Perdido\.antigravity\clash`. Hoje, no **Colar registros** do Arquivo, `splitPastedRecords` (`src/systems/ArchivePaste.ts`) usa a **primeira linha** de cada bloco como título e a **tira do texto**. Isso me atrapalha: preciso copiar o título, apagar e colar de volta no corpo. Quero o contrário. Mudança pequena: me mostre o plano em 2 ou 3 linhas, **espere meu ok** e faça um commit só.

## Como deve ficar

- **O texto inteiro de cada bloco vai para o corpo da nota**, incluindo a primeira linha, sem tirar `**`, `#` nem nada. Só corte as linhas vazias do começo e do fim.
- **Títulos numerados:** `Registro 1`, `Registro 2`, `Registro 3`...
  - Na prévia do "Colar registros", um campo **"Prefixo do título"** (padrão `Registro`) e um campo **"Começar em"**.
  - O "Começar em" é preenchido sozinho com o próximo número livre do tópico: se o tópico já tem `Registro 1` a `Registro 4` com o mesmo prefixo (incluindo os da lixeira, para não repetir), sugere 5. Com o prefixo vazio, o título vira só o número (`1`, `2`, `3`).
  - A prévia mostra o título de cada nota e deixa editar um por um antes de salvar.
- A divisão continua igual: linha só de traços (5 ou mais).
- Colar **um bloco só** (sem separador) também segue essa regra. Na prática, cria uma única nota numerada.
- Notas já criadas não mudam.

## Testes

Atualize `ArchivePaste.test.ts`:
- corpo com a primeira linha preservada, marcações incluídas;
- numeração começando de 1 e de N;
- próximo número livre ignorando outros prefixos e contando a lixeira;
- prefixo vazio;
- blocos vazios ignorados sem pular número;
- limite do corpo (`isTooLong`) ainda funcionando.

Ao terminar, rode `npm run typecheck`, `npm run lint` e `npm test`. Não precisa de `deploy:functions` nem de `db push`.
