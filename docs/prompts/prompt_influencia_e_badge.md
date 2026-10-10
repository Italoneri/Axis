# Prompt — Remover numeral de nível do mapa + mundos fixos de influência

Projeto em `C:\Users\Perdido\.antigravity\clash`. São mudanças pequenas. Faça um commit por parte.

## Parte 1 — Remover o numeral romano do mapa

O `SlotView` desenha um numeral romano (`badge`: I, II, III…) embaixo de cada construção para mostrar o nível. **Remova esse badge do mapa.**

- O nível continua visível só no painel lateral da construção, onde já aparece "Nv. 1".
- Apague também a constante `LEVEL_LABELS` e o código de posicionamento do badge, se ficarem sem uso.
- A barra ou anel de progresso de construção continua igual.

## Parte 2 — Influência: 7 mundos fixos e total como média

### Mundos fixos

A lista de mundos é **fixa**: são sempre estes 7, nesta ordem.

| id | Nome | Cor sugerida |
|---|---|---|
| `human` | Mundo Humano | `#d9b26a` |
| `elves` | Floresta dos Elfos | `#4f9d5d` |
| `fairies` | Bosque das Fadas | `#d77fd1` |
| `dwarves` | Montanhas Anãs | `#9c6b45` |
| `halfhumans` | Reino dos Meio-Humanos | `#e08a3c` |
| `draconic` | Terras Dracônicas | `#c0392b` |
| `infernal` | Terras Ínferas | `#6a3fa0` |

- Substitua o `src/data/influence.json`, que hoje tem Valdren, Aurélia e Nyx, por esses 7 mundos, com influência inicial de 0%.
- **Remova a criação e a remoção de mundos** do modo mestre. O mestre só **edita a % de cada mundo** (0–100). Nome, cor e descrição ficam no JSON.

### Total = média

- A **influência total deixa de ser um valor editável**. Ela passa a ser **calculada**: a média aritmética das % dos 7 mundos.
- Remova o campo `total` do estado (`GameState`, schema zod e save), do `influence.json` e do controle de edição do total no modo mestre.
- Crie uma função pura `averageInfluence(worlds)` e use em todos os lugares que mostram o total (barra superior, painel suspenso e ferramentas do mestre).
- **Exibição:** arredonde para 1 casa decimal e omita o ",0" (ex.: "42%", "37,1%").
- Ao mudar a % de um mundo, o log registra a mudança do mundo **e** o novo total. Exemplo: "Dia 20 — Influência em Terras Dracônicas: 35% → 42% (total: 18,6%)".

### Compatibilidade e testes

- Ainda não há dados reais. Saves com o formato antigo podem ser descartados, ou migrados descartando os mundos antigos. Use o mesmo mecanismo de versão que já existe no `SaveSystem`.
- Atualize o `Influence.test.ts`:
  - a média de valores variados, todos 0, todos 100 e valores decimais;
  - a edição de um mundo recalcula o total;
  - não existe mais a ação de editar o total, nem de criar ou remover mundos.
- Atualize os textos de `pt-BR.ts` e a seção de Influência do README.

Ao terminar, rode typecheck, lint, testes e build.
