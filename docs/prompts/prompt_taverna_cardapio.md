# Prompt — Cardápio da Taverna

Projeto em `C:\Users\Perdido\.antigravity\clash`. Quero que a **Taverna** (`tavern`) tenha um **cardápio** com foto, nome e descrição das opções de **café da manhã, almoço e janta**. As imagens reais eu mando depois. Por enquanto, use **imagens genéricas**.

Leia o código, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte. Siga o padrão do Arquivo de registros: um botão no painel da construção (como o "Abrir registros" em `SlotPanel`) que abre um `<dialog>` grande. No final, diga se a mudança exige `npm run deploy:functions` ou `npx supabase db push`.

## Como funciona

- Clicar na Taverna construída (nível em vigor ≥ 1) mostra no painel o botão **"Ver cardápio"**.
- A janela tem três abas: **Café da manhã · Almoço · Janta**. Ela abre na última aba vista (`uiMemory`).
- Cada aba mostra **cards em grade**, cada um com:
  - foto grande (proporção 4:3, `object-fit: cover`);
  - nome do prato;
  - descrição curta;
  - preço opcional, em moedas, com a mesma formatação do salário dos NPCs (`ctx.gold`);
  - efeito opcional, por exemplo "+1 PV temporário até o próximo descanso".
- Clicar na foto abre a imagem ampliada.
- No celular, a grade vira uma coluna e as abas continuam no topo.
- Opções que exigem um nível maior da Taverna aparecem esmaecidas, com "Disponível na Taverna nv. 2". Assim o cardápio cresce junto com a construção, que vai de barzinho a restaurante.

## Dados

- Novo arquivo `src/data/tavern_menu.json`, validado com zod no `parseCatalog`, como os outros JSON:

  ```json
  { "items": [
    { "id": "pao_mel", "meal": "breakfast", "name": "Pão com mel",
      "description": "...", "image": "menu.pao_mel",
      "price": { "bronze": 3 }, "effect": "...", "minLevel": 1 }
  ] }
  ```

  - `meal` é um destes: `breakfast`, `lunch`, `dinner`.
  - `price`, `effect` e `minLevel` são opcionais.
  - `image` é uma chave do `assets.json`.
- **Imagens:** ficam em `public/assets/menu/<id>.jpg` e são registradas em `src/data/assets.json` como `menu.<id>`.
- **Placeholders:** gere imagens genéricas com o `scripts/gen-placeholders.ts`, ou um script parecido: um prato estilizado com a cor da refeição e o nome escrito. Elas devem ser fáceis de substituir depois: troco o arquivo com o mesmo nome e pronto.
- Imagem faltando (arquivo inexistente) vira placeholder, sem quebrar a janela.
- **Itens iniciais:** crie de 4 a 5 por refeição, de fantasia medieval, com preços baixos (a economia do mundo gira em torno de 4 bronze por dia, então os pratos custam de 1 bronze a algumas pratas). Deixe 1 ou 2 itens por refeição com `minLevel` 2 ou 3. Me mostre a lista no plano para eu ajustar.
- **Somente leitura**, como os dados das construções: o cardápio vem do JSON e muda com novo deploy. Não precisa de comando, nem de banco, nem de save.

## Testes

- Validação do JSON (meal inválido, imagem sem chave no `assets.json`, id repetido).
- Filtro por refeição.
- Item bloqueado pelo nível.
- Formatação do preço.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`, e atualize o README (seção Taverna) explicando como trocar as imagens e editar o cardápio.
