# Prompt — Sistema de NPCs (moradores e trabalhadores da Axis)

Projeto em `C:\Users\Perdido\.antigravity\clash`. **Rode depois da Fase 3 (Supabase) concluída**, ou pelo menos depois da camada de comandos estar pronta. Tudo aqui deve nascer como `GameCommand`, validado no `applyCommand`, para funcionar igual offline e online.

Leia o código, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte. Registre o design em `docs/plans/NPCS.md` antes de implementar.

## Objetivo

O mestre cria NPCs (exemplo: **Bianca, uma maga**) com habilidades. Eles **moram** em construções de moradia e são **designados para trabalhar** em outras construções, gerando efeitos a cada dia de jogo.

## Decisões já tomadas (padrões; deixe tudo configurável em JSON)

- **Habilidades** em `src/data/skills.json` (id, nome, ícone, descrição). Iniciais: **Construção, Ferraria, Gastronomia, Pesquisa, Medicina, Alquimia**. O mestre pode adicionar outras no JSON.
- **Escala:** de **0 a 10** por habilidade.
- **Quem cria e edita NPCs:** só o **mestre**. **Quem designa trabalho e moradia:** jogadores e mestre.
- **Um trabalho por vez** para cada NPC.
- **Salário diário opcional** por NPC, pago do Acampamento ao avançar dias. Se faltar dinheiro, o NPC fica "sem pagamento" e não trabalha naquele dia, e isso vai para o log.

## Modelo de dados

**NPC**, no estado e validado por zod:
- `id` único, `name`, `title` (ex.: "Maga"), `portrait` opcional, `description`;
- `skills`: um mapa `{ skillId: 0–10 }`;
- `home`: o slotId da moradia, ou `null`;
- `job`: `{ slotId, activityId }` ou `null`;
- `status`: `disponivel` | `trabalhando` | `ferido` | `em_missao`;
- `wage`: em PO por dia, opcional.

**No `buildings.json`**, dois campos opcionais por nível de construção:

```json
"housing": { "capacity": 4 },
"jobs": [
  { "activity": "forjar", "skill": "smithing", "slots": 2,
    "effect": { "type": "produce", "material": "iron", "perDay": 2 } }
]
```

**Tipos de efeito iniciais:**
- `produce`: gera material por dia;
- `research`: soma progresso diário à pesquisa escolhida;
- `construction`: reduz os dias restantes das obras em andamento;
- `bonus`: texto exibido nos Bônus ativos, só quando o posto está ocupado.

**Fórmula:** `valor = base × (1 + habilidade / 10)`, arredondada. Os números ficam no JSON para eu calibrar. Uma habilidade 0 ainda trabalha, mas rende só o valor base.

Exemplos de vínculo:
- Alojamento ou Quartel → `housing`;
- Forja → Ferraria;
- Taverna → Gastronomia;
- Estação de Estudo e Biblioteca → Pesquisa;
- Enfermaria → Medicina;
- Laboratório Arcano → Alquimia;
- qualquer obra em andamento → Construção.

Proponha os valores iniciais de cada construção existente.

## Regras

- Um NPC só pode ser designado para trabalhar se tiver moradia. A moradia respeita a `capacity` do nível atual.
- Construção removida ou em obra libera os NPCs dela (moradia e trabalho), com registro no log.
- Rebaixar a capacidade (ex.: remover um nível) desaloja os excedentes, e isso vai para o log.
- `advanceDays` processa, **na ordem**: salários → efeitos dos postos ocupados → conclusão de obras. Tudo determinístico (sem `Math.random`), para servidor e cliente chegarem ao mesmo resultado.
- Todo comando registra o `actor` no log.

## Comandos novos (`GameCommand`)

- **Mestre:** `npc_create`, `npc_update` (incluindo habilidades e status), `npc_remove`.
- **Jogador e mestre:** `npc_set_home`, `npc_assign_job`, `npc_unassign`.
- Permissões validadas no `applyCommand`, com testes de recusa.

## Interface

- Painel **"NPCs"** na barra ou no menu: cards com retrato, título, barras de habilidade, moradia, trabalho e status. Filtros por habilidade e por "sem trabalho".
- No painel de cada construção:
  - **moradores** (quantos de quantos);
  - **postos de trabalho**, com seletor de NPC ordenado pela melhor habilidade para aquele posto e prévia do rendimento ("Bianca: +3,4 de progresso por dia").
- No mapa: pequenos retratos ou iniciais sobre as construções com trabalhadores (opcional, leve).
- Bônus ativos: incluir os efeitos dos postos ocupados.

## Testes

- Fórmula de rendimento.
- Capacidade de moradia.
- Designação inválida: sem moradia, posto lotado, habilidade errada continua permitida mas com rendimento base.
- Salário com e sem saldo.
- Ordem do `advanceDays`.
- Construção removida liberando NPCs.
- Determinismo: o mesmo estado e os mesmos comandos geram o mesmo resultado.
- Migração do save: a versão nova acrescenta `npcs: []`, e o jsonb do Supabase não muda de tabela.

## Fora do escopo agora (anotar no plano como "futuro")

Evolução de habilidades com o uso, moral, traços de personalidade, eventos aleatórios e missões externas.

Ao terminar, rode typecheck, lint, testes e build, e atualize o README (seção "NPCs").
