# Prompt — Remover estruturas: Estação de Estudo e Torre de Vigia

Projeto em `C:\Users\Perdido\.antigravity\clash`. **O jogo já está online com os jogadores.** Quero tirar do jogo duas construções: a **Estação de Estudo** (`study_station`), que repete o papel da Biblioteca e do Laboratório de Pesquisa, e a **Torre de Vigia** (`watchtower`), que não faz sentido na Axis.

Leia o código, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por parte. No final, diga exatamente o que publicar e em que ordem.

## O save não pode se perder

Ninguém construiu essas duas, nem offline nem online, então **não precisa de reembolso nem de migração com custos**. O que importa é que **nenhum save atual deixe de carregar** por causa da remoção:

- Hoje, `referenceProblems` (`src/systems/SaveSystem.ts`) **recusa o save inteiro** se encontra uma construção que não existe no catálogo (`unknown building`). Troque essa recusa por **tolerância**: ao carregar, uma construção desconhecida é **retirada do espaço**, com um aviso no console e uma entrada no log (`building_dropped`, que já existe para espaços que sumiram do layout), e o resto do save carrega normalmente. Isso vale offline, no import de save e online (`parseState` no cliente e na Edge Function).
- **Antes de publicar**, confira de verdade que o meu save não tem nenhuma das duas. Ele está no jogo online: me passe uma consulta SQL **só de leitura** para o SQL Editor do Supabase que mostre os `buildingId` de `games.state->'slots'`. Confira também o save local (`localStorage`), se houver.
- Teste: um save com uma `watchtower` carrega, só sem ela; um save sem as duas fica idêntico; o export/import continua funcionando.

## O que muda nos dados e no código

- `src/data/buildings.json`: remova `study_station` e `watchtower`. Remova também quaisquer `requires` que apontem para elas, se houver.
- `src/data/assets.json` e `public/assets/`: remova os sprites, os ícones e as artes de nível dessas duas. Remova também as referências em `scripts/gen-placeholders.ts`, nos créditos e no `layout.json`, se houver.
- **Arquivo de Pesquisas:** hoje ele é liberado pela Estação de Estudo (`STUDY_STATION_ID` e `hasResearchArchive` em `src/systems/Research.ts`, seção extra em `SlotPanel.ts`). Passe essa função para a **Biblioteca** (`library`), nível 1: o painel da Biblioteca construída mostra o Arquivo de Pesquisas. Atualize o texto do efeito da Biblioteca nv. 1 para mencionar isso, sem perder o efeito atual.
- **Efeitos que somem:**
  - da Estação: "pesquisas avançam 10% mais rápido" e "consultar o Arquivo para vantagem num teste de conhecimento";
  - da Torre: surpresa, aviso de ameaças e vantagem na iniciativa.
  
  Não reponha esses efeitos em outra construção. Só me liste no plano, para eu decidir depois.
- **Postos de NPC:** a Estação tinha o posto "Estudar (Pesquisa)". Ele simplesmente deixa de existir; os de Biblioteca, Laboratório de Pesquisa e Torre dos Magos continuam.
- **Textos, testes, README e `docs/plans/*`:** procure todas as menções (`grep -ri "study_station\|watchtower\|Estação de Estudo\|Torre de Vigia"`) e atualize. Os testes devem usar o `testCatalog`. Se algum depender dessas construções, troque por outra.

## Testes

- Save com construção desconhecida carrega sem ela; save sem essas construções continua idêntico.
- A Biblioteca nv. 1 libera o Arquivo de Pesquisas.
- O catálogo não tem mais referências às duas.
- Paridade com a Edge Function.

## Publicação (o jogo está no ar)

Muda o catálogo e a validação do save no servidor, então precisa de `npm run deploy:functions` **e** do novo build do site. Não precisa de `db push`. Me diga a ordem segura (esperado: a função primeiro, depois o site) e se é melhor fazer fora da sessão. **Recomende que eu exporte o save antes de publicar**, como backup.

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
