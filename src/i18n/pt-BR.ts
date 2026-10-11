import type { SlotType } from '../map/layout';
import type { LogEntry, ResearchStatus } from '../model/schema';
import type { BlockReason } from '../systems/BuildSystem';
import type { CommandError } from '../commands/applyCommand';

const percentFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Every user-facing text lives here. Building, coin and seed names live in src/data/*.json. */
export const t = {
  appTitle: 'Axis — Base',
  loading: 'Despertando a Axis…',
  forgingMap: 'Talhando a muralha e o mármore…',
  mapError: 'Não foi possível gerar o mapa. Veja o console do navegador.',
  dataError: 'Erro nos dados do jogo',

  day: (day: number) => `Dia ${day}`,
  days: (n: number) => (n === 1 ? '1 dia' : `${n} dias`),
  level: (level: number) => `Nv. ${level}`,
  /** "42%", "37,1%": one decimal at most, no trailing ",0". */
  percent: (value: number) => `${percentFormat.format(value)}%`,
  instant: 'Imediato',

  topbar: {
    more: 'Mais opções',
  },

  slotTypes: {
    core: 'Coração',
    middle: 'Anel do meio',
    outer: 'Anel externo',
  } satisfies Record<SlotType, string>,

  panel: {
    close: 'Fechar',
    emptySlot: (type: string) => `${type} — espaço livre`,
    chooseBuilding: 'Escolha uma estrutura para erguer aqui.',
    noOptions: 'Nenhuma estrutura pode ser construída neste espaço.',
    cost: 'Custo',
    time: 'Tempo',
    effect: 'Efeito',
    build: 'Construir',
    upgrade: 'Melhorar',
    currentEffect: 'Efeito atual',
    nextLevel: (level: number) => `Próximo nível (${level})`,
    maxLevel: 'Nível máximo alcançado.',
    underConstruction: (level: number) => `Em construção — nível ${level}`,
    upgrading: (level: number) => `Melhorando para o nível ${level}`,
    progress: (startedOnDay: number, completesOnDay: number, currentDay: number) =>
      `Iniciado no dia ${startedOnDay} · conclui no dia ${completesOnDay} (faltam ${t.days(Math.max(0, completesOnDay - currentDay))})`,
    notYetActive: 'Nenhum efeito ativo até a conclusão.',
  },

  save: {
    export: 'Exportar save',
    import: 'Importar save',
    imported: 'Save importado.',
    invalid: (detail: string) => `Save inválido: ${detail}`,
    confirmImport: 'Importar este save substitui a base atual. Continuar?',
    storageFailed:
      'Não foi possível salvar no navegador. Exporte o save para não perder o progresso.',
  },

  drawer: {
    open: 'Registro e bônus',
    close: 'Fechar',
    bonusesTab: 'Bônus ativos',
    logTab: 'Registro',
    masterTab: 'Mestre',
    mapTab: 'Visual do mapa',
    noBonuses: 'Nenhuma estrutura concluída ainda.',
    emptyLog: 'Nada aconteceu na Axis ainda.',
  },

  master: {
    enter: 'Mestre',
    title: 'Modo Mestre',
    password: 'Senha do mestre',
    unlock: 'Entrar',
    cancel: 'Cancelar',
    wrongPassword: 'Senha incorreta.',
    notConfigured: 'Modo Mestre desativado: defina VITE_MASTER_PASSWORD no arquivo .env.',
    unlocked: 'Modo Mestre ativado.',
    leave: 'Sair do modo mestre',
    timeSection: 'Tempo',
    daysToAdvance: 'Dias',
    advance: 'Avançar',
    charactersSection: 'Personagens',
    charactersHint: 'O grupo da mesa. Cada personagem tem a própria carteira de moedas.',
    buildingsHint: 'Para forçar ou remover estruturas, clique num espaço do mapa.',
    forceSection: 'Mestre',
    forceLevel: 'Nível',
    force: 'Forçar',
    completeNow: 'Concluir agora',
    remove: 'Remover estrutura',
    confirmRemove: 'Clique de novo para confirmar',
  },

  mapVisual: {
    hint: 'Cada ajuste regenera o mapa na hora. As mudanças valem só nesta aba do navegador: exporte o theme.json e coloque em src/data para salvar.',
    edited: 'Tema alterado (ainda não salvo no projeto).',
    reference: 'Sobrepor a referência (só no npm run dev)',
    veinsSection: 'Veios dourados',
    discSection: 'Disco azul',
    wallSection: 'Muralha e chão',
    prismsSection: 'Prismas dos portões',
    goldColor: 'Cor do ouro',
    floorVeins: 'Intensidade no chão',
    wallVeins: 'Intensidade na muralha',
    veinCopies: 'Densidade (cópias giradas)',
    discHueShift: 'Tom (graus)',
    discBrightness: 'Brilho',
    wallDesaturation: 'Dessaturação da pedra',
    wallWarmth: 'Tom quente da pedra',
    floorScale: 'Escala do ladrilho',
    innerShadow: 'Sombra interna',
    prismGlow: 'Intensidade do brilho',
    prismPulseSeconds: 'Duração da pulsação (s)',
    export: 'Exportar theme.json',
    reset: 'Restaurar padrão',
    previewSection: 'Pré-visualizar construção',
    previewHint:
      'Mostra uma construção num espaço só na tela, sem mudar o jogo. Some ao limpar ou recarregar a página.',
    previewBuilding: 'Construção',
    previewLevel: 'Nível',
    previewSlot: 'Espaço',
    previewShow: 'Pré-visualizar',
    previewClear: 'Limpar pré-visualização',
    timings: (size: number, analysisMs: number, renderMs: number) =>
      `Mapa ${size}px · análise das texturas ${Math.round(analysisMs)} ms · pintura ${Math.round(renderMs)} ms`,
  },

  credits: {
    open: 'Créditos',
    title: 'Créditos',
    textures: 'Texturas do mapa',
    license: (license: string) => `Licença: ${license}`,
    by: (author: string) => `Autor: ${author}`,
    authorMissing: 'Autor: (a preencher em src/data/credits.json)',
    close: 'Fechar',
  },

  common: {
    save: 'Salvar',
    cancel: 'Cancelar',
    edit: 'Editar',
    remove: 'Remover',
    add: 'Adicionar',
    create: 'Criar',
    name: 'Nome',
    color: 'Cor',
    icon: 'Ícone (chave do assets.json ou URL)',
    description: 'Descrição',
    category: 'Categoria',
    increase: 'Aumentar',
    decrease: 'Diminuir',
  },

  resources: {
    gold: 'Ouro',
    materials: 'Materiais',
    research: 'Pesquisa',
    influence: 'Influência',
    /** Abbreviation used after gold amounts. */
    goldUnit: 'PO',
    materialsSummary: (units: number) => (units === 1 ? '1 item' : `${units} itens`),
    researchSummary: (done: number, inProgress: number) =>
      `${done} concluídas · ${inProgress} em andamento`,
    researchCompact: (done: number, inProgress: number) => `${done}/${done + inProgress}`,
  },

  gold: {
    camp: 'Acampamento',
    campHint: 'Só as moedas do Acampamento pagam construções e melhorias.',
    total: 'Total',
    showDetails: 'Ver detalhes',
    hideDetails: 'Ocultar detalhes',
    groupWealth: 'Patrimônio total do grupo',
    groupWealthHint: 'Acampamento + carteiras pessoais. É só informativo.',
    deposit: 'Depositar no Acampamento',
    depositTotal: 'Total do depósito',
    confirmDeposit: 'Depositar',
    adjust: 'Ajustar',
    adjustTotal: 'Valor do ajuste',
    give: 'Dar',
    take: 'Remover',
    consolidate: 'Consolidar',
    transferTitle: 'Transferir entre carteiras',
    transfer: 'Transferir',
    from: 'De',
    to: 'Para',
    noCharacters: 'Nenhum personagem cadastrado. O mestre cadastra na aba Mestre.',
  },

  materials: {
    empty: 'Nenhum material nesta categoria.',
    noCategories: 'Nenhuma categoria cadastrada.',
    quantity: 'Quantidade',
    amount: 'Qtd.',
    newMaterial: 'Novo material nesta categoria',
  },

  categories: {
    title: 'Categorias',
    rename: 'Renomear esta categoria',
    newCategory: 'Nova categoria',
    removeHint: 'Só categorias vazias podem ser removidas.',
  },

  research: {
    statuses: {
      em_andamento: 'Em andamento',
      concluida: 'Concluídas',
    } satisfies Record<ResearchStatus, string>,
    status: 'Status',
    statusOptions: {
      em_andamento: 'Em andamento',
      concluida: 'Concluída',
    } satisfies Record<ResearchStatus, string>,
    empty: 'Nenhuma pesquisa aqui.',
    buildStationHint: 'Construa a Estação de Estudo para ver os detalhes.',
    archiveTitle: 'Arquivo de Pesquisas',
    allStatuses: 'Todos os status',
    allCategories: 'Todas as categorias',
    search: 'Buscar por título',
    title: 'Título',
    progress: 'Progresso (%)',
    startedOnDay: 'Dia de início',
    completedOnDay: 'Dia de conclusão',
    owner: 'Responsável',
    description: 'Descrição',
    notes: 'Resultados / notas',
    cost: 'Custo (informativo)',
    costCoins: 'Moedas (PO)',
    addCostMaterial: 'Adicionar material ao custo',
    newResearch: 'Nova pesquisa',
    complete: 'Concluir',
    started: (day: number) => `Início: dia ${day}`,
    completed: (day: number) => `Concluída no dia ${day}`,
  },

  influence: {
    total: 'Influência total',
    totalHint: 'Média da influência nos mundos.',
    worlds: 'Mundos',
  },

  characters: {
    portrait: 'Retrato (chave do assets.json ou URL)',
    newCharacter: 'Novo personagem',
  },

  errors: {
    empty_name: 'Informe um nome.',
    duplicate_name: 'Já existe um item com esse nome.',
    not_found: 'Item não encontrado (talvez já tenha sido removido).',
    category_not_empty: 'A categoria ainda tem itens. Mova-os ou remova-os antes.',
    insufficient_coins: 'Não há moedas suficientes nessa carteira.',
    nothing_to_move: 'Informe ao menos uma moeda.',
    same_wallet: 'Escolha carteiras diferentes.',
    character_has_coins: 'Este personagem ainda tem moedas. Transfira-as antes de remover.',
    forbidden: 'Somente o Mestre pode fazer isso.',
    invalid_command: 'Ação inválida. Confira os valores informados.',
    blocked: 'A construção não atende aos requisitos.',
  } satisfies Record<CommandError, string>,
} as const;

/** Lookups and formatters the texts need; built from the catalog and current state in ui/format.ts. */
export interface TextContext {
  building: (id: string) => string;
  material: (id: string) => string;
  /** "3 Platina e 12 Ouro". */
  coins: (bag: Readonly<Record<string, number>>) => string;
  /** Bronze amount shown in gold: "1.234,5 PO". */
  gold: (bronze: number) => string;
}

export function blockReasonText(reason: BlockReason, ctx: TextContext): string {
  switch (reason.kind) {
    case 'wrong_slot_type':
      return 'Não pode ser construída neste tipo de espaço.';
    case 'slot_occupied':
      return 'Este espaço já está ocupado.';
    case 'already_built':
      return 'Já existe na Axis.';
    case 'under_construction':
      return 'Aguarde a construção atual terminar.';
    case 'max_level':
      return 'Nível máximo alcançado.';
    case 'missing_requirement':
      return `Requer ${ctx.building(reason.requirement.building)} nv. ${reason.requirement.minLevel}.`;
    case 'missing_coins':
      return `Faltam ${ctx.gold(reason.missingBronze)} no Acampamento. O grupo tem ${ctx.gold(reason.personalBronze)} nas carteiras pessoais.`;
    case 'missing_materials':
      return `Faltam ${listText(
        Object.entries(reason.missing).map(([id, amount]) => `${amount} de ${ctx.material(id)}`),
      )}.`;
    case 'unknown_materials':
      return `Material indisponível: ${listText(reason.ids)} (não existe no catálogo de materiais).`;
    default:
      return assertNever(reason);
  }
}

export function logEntryText(entry: LogEntry, ctx: TextContext): string {
  return `Dia ${entry.day} — ${logAction(entry, ctx)}`;
}

function logAction(entry: LogEntry, ctx: TextContext): string {
  switch (entry.kind) {
    case 'days_advanced':
      return `${t.days(entry.days)} se passaram`;
    case 'build_started':
    case 'upgrade_started':
    case 'build_completed':
    case 'building_forced':
    case 'building_removed':
    case 'building_dropped':
      return buildingAction(entry, ctx);
    case 'coins_adjusted':
      return `Mestre ajustou as moedas ${walletOf(entry.wallet)}: ${signedList(entry.delta, ctx)}`;
    case 'coins_deposited':
      return `${entry.character} depositou ${ctx.coins(entry.coins)} no Acampamento`;
    case 'coins_transferred':
      return `Mestre transferiu ${ctx.coins(entry.coins)} ${walletOf(entry.from)} para ${walletName(entry.to)}`;
    case 'coins_consolidated':
      return `Mestre consolidou as moedas ${walletOf(entry.wallet)}`;
    case 'material_adjusted':
      return entry.delta > 0
        ? `Mestre adicionou ${entry.delta} ${entry.material}`
        : `Mestre removeu ${-entry.delta} ${entry.material}`;
    case 'material_added':
      return `Mestre cadastrou o material ${entry.material}`;
    case 'material_removed':
      return `Mestre removeu o material ${entry.material}`;
    case 'research_added':
      return `Pesquisa '${entry.title}' registrada`;
    case 'research_completed':
      return `Pesquisa '${entry.title}' concluída`;
    case 'research_removed':
      return `Pesquisa '${entry.title}' removida`;
    case 'research_progressed':
      return `Pesquisa '${entry.title}': ${entry.from}% → ${entry.to}%`;
    case 'influence_changed':
      return `Influência em ${entry.world}: ${t.percent(entry.from)} → ${t.percent(entry.to)} (total: ${t.percent(entry.total)})`;
    case 'character_added':
      return `${entry.name} entrou no grupo`;
    case 'character_removed':
      return `${entry.name} saiu do grupo`;
    default:
      return assertNever(entry);
  }
}

type BuildingEntry = Extract<LogEntry, { buildingId: string }>;

function buildingAction(entry: BuildingEntry, ctx: TextContext): string {
  const what = `${ctx.building(entry.buildingId)} nv. ${entry.level}`;
  const who = entry.actor ? `${entry.actor} ` : '';
  const paid = entry.paid ? ` (${paidText(entry.paid, ctx)})` : '';
  const actions: Record<BuildingEntry['kind'], string> = {
    build_started: who ? `${who}iniciou ${what}` : `Iniciada: ${what}`,
    upgrade_started: who ? `${who}começou a melhorar ${what}` : `Melhoria iniciada: ${what}`,
    build_completed: `Concluída: ${what}`,
    building_forced: `Mestre definiu ${what}`,
    building_removed: `Mestre removeu ${what}`,
    building_dropped: `${what} removida: o espaço não existe mais no mapa`,
  };
  return actions[entry.kind] + paid;
}

function paidText(
  paid: { bronze: number; materials: Readonly<Record<string, number>> },
  ctx: TextContext,
): string {
  return [
    ...(paid.bronze > 0 ? [ctx.gold(paid.bronze)] : []),
    ...Object.entries(paid.materials).map(([name, amount]) => `${amount} ${name}`),
  ].join(', ');
}

/** Wallet labels in the log: a character name, or absent for the Acampamento. */
const walletName = (label: string | undefined) => label ?? 'o Acampamento';
const walletOf = (label: string | undefined) => (label ? `de ${label}` : 'do Acampamento');

function signedList(delta: Readonly<Record<string, number>>, ctx: TextContext): string {
  return Object.entries(delta)
    .map(([id, amount]) => `${amount > 0 ? '+' : '−'}${ctx.coins({ [id]: Math.abs(amount) })}`)
    .join(', ');
}

const listFormat = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** "a, b e c". */
export function listText(items: readonly string[]): string {
  return listFormat.format(items);
}

function assertNever(value: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(value)}`);
}
