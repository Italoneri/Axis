# Prompt — Bug nos valores de recursos

Projeto em `C:\Users\Perdido\.antigravity\clash`. **Não escreva código novo antes de achar a causa.** Investigue, me mostre o diagnóstico e espere meu ok para corrigir.

## Sintoma

A barra superior mostra valores absurdos ou incoerentes. Por exemplo, **Ouro: 11.111.024,5 PO** num save de teste em que nunca dei tanto ouro. Os outros recursos (Materiais 173, Pesquisa 1/2, Influência 0%) também precisam ser conferidos.

## Hipóteses para verificar, nesta ordem

1. **Concatenação de texto:** algum campo numérico (dar ou remover moedas, depositar, transferir, materiais, influência) somando string em vez de número, como `"1" + "1"` = `"11"`. Procure por `.value` sem `Number()`, `valueAsNumber` ausente e `+=` sobre valores vindos de inputs ou do `localStorage`.
2. **Unidade das moedas:** valores em **bronze** (a menor unidade) sendo exibidos ou somados como **ouro**, ou o contrário. Isso daria uma diferença de ×100. Confira `currencies.json`, as funções de conversão, o total do Acampamento e a formatação da barra.
3. **Migração ou importação de save:** um save de versão antiga, um save importado ou o `localStorage` com formato antigo sendo lido sem migração correta, misturando carteiras antigas e novas.
4. **Formatação:** o número certo sendo mostrado errado (separador de milhar ou decimal, ou casas decimais em bronze).

## O que fazer

- Leia o save atual do `localStorage` e mostre os valores crus de cada carteira (Acampamento e personagens), dos materiais, das pesquisas e da influência.
- Reproduza o bug com um teste Vitest antes de corrigir.
- Corrija a causa e escreva testes de regressão para:
  - todas as entradas numéricas do modo mestre e do jogador (dar, remover, depositar, transferir);
  - a conversão bronze ↔ ouro;
  - o carregamento de saves antigos e importados.
- Valide os saves ao carregar com o schema zod. Valores inválidos (NaN, negativos, strings) devem ser corrigidos ou rejeitados com aviso no log, nunca exibidos.
- Se o save atual estiver corrompido, me diga como limpar e se dá para recuperar.

Ao terminar, rode typecheck, lint, testes e build, e explique em poucas linhas o que causava o bug.

## Depois deste

Ainda está pendente o prompt `docs/prompts/prompt_anel_intermediario_arco.md`, que ativa o `layout.v4.json` com o anel intermediário em arcos. **Só rode depois deste bug corrigido.**
