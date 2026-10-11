# Prompt — Ajustes do sistema de NPCs (pós-revisão)

Projeto em `C:\Users\Perdido\.antigravity\clash`. O sistema de NPCs (commits `b274a0a` a `0d0c420`) está pronto e com os testes passando. Esta rodada é curta: corrige a capacidade do Alojamento e ajusta a interface. Tudo continua passando por `GameCommand` / `applyCommand`. No final, rode `npm run build:functions` e `npm run parity` para o bundle da Edge Function acompanhar.

Leia `docs/plans/NPCS.md` e o código citado, me mostre o plano em poucas linhas e **espere meu ok**. Faça um commit por item e atualize `docs/plans/NPCS.md` e o README onde algo mudar.

**Não mexa** na velocidade das obras, nos salários (cobrança, pagamento ou bônus sem pagamento) nem na validação do valor do salário. Isso fica como está, por decisão minha.

## 1. Capacidade do Alojamento (`barracks`)

Hoje está 4 / 6 / 8. A arte tem **6 camas no nível 1** e **14 camas nos níveis 2 e 3**. Ajuste o `housing.capacity` em `src/data/buildings.json` para **6 / 14 / 14** e atualize a tabela de valores iniciais em `docs/plans/NPCS.md` e no README.

Confira se algum teste usa os números do JSON real (os testes deveriam usar o `testCatalog`). Taverna (2/2/3) e Torre dos Magos (2/3/4) ficam como estão.

## 2. Salário em prata e bronze

A economia do mundo gira em torno de **4 bronze por dia**, então os salários vão ficar na casa das pratas, ou abaixo disso. Hoje o campo é "Salário diário (PO)", com passo de 0,01, e o card mostra "Salário: 0,04 PO/dia". Isso é ruim de ler e de digitar.

- **No formulário do NPC (`NpcPanel.npcForm`)**: digitar o salário em moedas (pelo menos prata e bronze; pode reaproveitar `coinInputs` de `widgets.ts`) ou num único campo em bronze. Converta para o formato salvo. Pode continuar salvando em PO; só a interface muda.
- **No card e na prévia**: mostrar com a mesma formatação de moedas do log (`ctx.gold`), por exemplo "Salário: 4 PC/dia" ou "1 PP 2 PC/dia". Salário 0 ou ausente aparece como "Sem salário".
- Testes de conversão: ida e volta PO ↔ bronze, sem perda de valor.

## 3. Interface dos NPCs

- **Seletor de moradia (`NpcPanel.homeRow`)**: construções lotadas aparecem como opção. Ao escolher uma, o comando é recusado (`home_full`), mas o select continua mostrando a casa errada. Desabilite as opções lotadas (menos a casa atual) e, se mesmo assim houver recusa, redesenhe o painel.
- **Seletor do posto (`SlotNpcs.assignForm`)**: mostre no rótulo onde o NPC trabalha hoje, por exemplo "Bia (10) · trabalha na Biblioteca", para o jogador saber que vai tirá-lo de outro posto. Mostre também o status `ferido` / `em_missao`.
- **Iniciais no mapa (`WorkerBadges`)**: hoje contam NPCs feridos ou em missão. Conte só quem está em serviço (`isOnDuty`).
- **Mensagem de erro**: `npc_set_home` num espaço sem moradia (construção na primeira obra, sem `housing`, ou espaço inexistente) responde `home_full` ("lotada"). Crie um erro próprio (`no_housing`) com texto em pt-BR, e coloque-o também em `COMMAND_ERRORS`. Adicione um teste de recusa.

## Fora do escopo

A ordem das entradas do log num avanço de dias fica como está: o "saiu do posto" aparece antes do resumo do trabalho. Anote isso no plano como detalhe conhecido. Evolução de habilidades, moral e missões continuam no "futuro".

Ao terminar, rode `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `npm run parity`.
