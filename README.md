# Axis — Base Builder

Mini jogo de construção de base para navegador, feito para a mesa de RPG. Os personagens gastam recursos ganhos nas sessões para erguer e melhorar estruturas na **Axis**, o salão circular que serve de base do grupo.

Stack: **Phaser 3 + TypeScript + Vite**, interface em HTML/CSS sobre o canvas, testes com **Vitest**.

> Status: **Fase 1 (MVP offline)**. Modo Mestre, Supabase e deploy entram nas próximas fases.

## Como rodar

Requer Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes (regras do jogo + validação dos JSON) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run build` | Checagem de tipos + build estático em `dist/` |
| `npm run gen:placeholders` | Gera os PNGs placeholder que ainda não existem |

**Atalho de desenvolvimento:** com `npm run dev`, a tecla **D** avança 1 dia (no build final não existe; o mestre ganha esse botão na Fase 2).

## Como jogar

- **Scroll** dá zoom, **arrastar** move o mapa.
- Clique num espaço livre para ver as estruturas permitidas, com custo, tempo e efeito. As que não podem ser construídas aparecem desabilitadas, com o motivo.
- Clique numa estrutura para ver o efeito atual, melhorar de nível ou acompanhar a construção.
- O progresso fica salvo no navegador (`localStorage`). Use **Exportar save** para guardar um backup em JSON e **Importar save** para restaurá-lo.

### Regras

- Cada estrutura existe **uma vez** na Axis (os bônus não acumulam).
- O custo é cobrado ao **iniciar** a construção. O bônus só vale quando ela termina.
- Durante uma melhoria, o efeito do nível anterior continua ativo.
- O **Coração da Axis** (espaço central) libera os níveis mais altos: nível 2 das outras estruturas exige o Coração nv. 1, e nível 3 exige o Coração nv. 2.

## Estrutura

```
src/
  main.ts            monta UI + jogo
  store.ts           estado atual, persistência e eventos (camada imperativa)
  model/             schemas (zod) e tipos, carregamento/validação do catálogo
  systems/           regras puras: BuildSystem, ResourceSystem, TimeSystem, SaveSystem (+ testes)
  scenes/            Boot, Preload, Base, SlotView, CameraController
  ui/                barra superior, painel do espaço, save, toasts, CSS
  i18n/pt-BR.ts      todos os textos da interface
  data/              buildings.json, resources.json, slots.json, assets.json
scripts/             gerador de placeholders
public/assets/       map/, buildings/, icons/
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
       { "cost": { "gold": 120, "materials": 80 }, "buildTime": 2, "effect": "Montarias comuns custam metade." },
       {
         "cost": { "gold": 300, "materials": 160 },
         "buildTime": 4,
         "effect": "Viagens a partir da Axis levam 1 dia a menos.",
         "requires": [{ "building": "axis_heart", "minLevel": 1 }]
       }
     ]
   }
   ```

   - `allowedSlots`: `core`, `inner` (disco azul, junto às luminárias) e/ou `outer` (pilares).
   - `requires` no nível de cima vale para **todos** os níveis; dentro de um nível, só para aquele nível.
   - `buildTime` é em dias de jogo (`0` = imediato). Pode haver quantos níveis você quiser.
   - Os recursos do `cost` precisam existir em `resources.json`.
2. Registre as imagens em `src/data/assets.json`:
   ```json
   "icon.stables": "assets/icons/stables.png",
   "building.stables": "assets/buildings/stables.png"
   ```
3. Rode `npm run gen:placeholders` para gerar as imagens provisórias (ou coloque a arte final nesses caminhos).
4. Rode `npm test`. Se algum JSON tiver erro (id repetido, recurso inexistente, asset faltando, pré-requisito apontando para estrutura que não existe), o teste diz exatamente onde. O jogo também mostra o erro na tela em vez de abrir em branco.

Recursos novos seguem a mesma lógica em `resources.json` (`initial` é a quantidade no começo do jogo).

## Como trocar os assets

Todas as imagens são carregadas pelo manifesto `src/data/assets.json` (chave → caminho dentro de `public/`). Para trocar um placeholder pela arte final, **substitua o arquivo** no mesmo caminho ou aponte a chave para um arquivo novo. `npm run gen:placeholders` nunca sobrescreve arquivos existentes (só com `-- --force`).

| Asset | Caminho | Formato | Tamanho | Observações |
|---|---|---|---|---|
| Mapa | `public/assets/map/axis.png` | PNG ou JPG | quadrado, ≥ 2048×2048 | vista top-down; as posições dos espaços são proporcionais (0–1), então qualquer resolução quadrada funciona |
| Sprite de estrutura | `public/assets/buildings/<id>.png` | PNG com fundo transparente | 256×256 (ou 512×512) | vista top-down, centralizada, ocupando ~85% do quadro |
| Ícone de estrutura | `public/assets/icons/<id>.png` | PNG com fundo transparente | 64×64 (ou 128×128) | usado no painel |
| Ícone de recurso | `public/assets/icons/<recurso>.png` | PNG com fundo transparente | 64×64 | aparece pequeno (18–26 px), então prefira silhuetas simples |

O tamanho com que cada estrutura aparece no mapa vem de `sizes` em `src/data/slots.json` (fração da largura do mapa por tipo de espaço).

## Espaços (slots)

`src/data/slots.json` define os 17 espaços com coordenadas normalizadas (0–1). Eles foram distribuídos de forma **simétrica** a partir das luminárias da imagem (centro em 50,1% × 49,6%, raio de 12,2% no anel interno e 29,1% no externo). Para ajustar, edite os valores `x`/`y`. O editor visual com arrastar e exportar chega na Fase 2.
