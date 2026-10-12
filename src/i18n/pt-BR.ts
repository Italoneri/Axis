import type { SlotType } from '../map/layout';
import type {
  ArchiveChange,
  JobEffect,
  LogEntry,
  Meal,
  NpcReleaseReason,
  NpcStatus,
  ResearchStatus,
} from '../model/schema';
import {
  BODY_LIMIT,
  TITLE_LIMIT,
  type ArchiveError,
  type NoteVisibility,
} from '../systems/Archive';
import type { BlockReason } from '../systems/BuildSystem';
import { MASTER_ACTOR, type CommandError } from '../commands/applyCommand';

const percentFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const decimalFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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
  /** Yield stored in tenths: 34 → "3,4". */
  tenths: (tenths: number) => decimalFormat.format(tenths / 10),

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
    postsTitle: 'Postos de trabalho',
    postsSub: 'Efeitos dos NPCs em serviço',
    penalty: (text: string) => `Penalidade: ${text}`,
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

  online: {
    title: 'Axis — mesa online',
    loginHint: 'Entre com seu e-mail. Você recebe um link para acessar, sem senha.',
    email: 'E-mail',
    sendLink: 'Enviar link',
    linkSent: (email: string) => `Link enviado para ${email}. Abra o e-mail neste aparelho.`,
    loginFailed: 'Não foi possível enviar o link. Tente de novo em instantes.',
    loading: 'Carregando a mesa…',
    noGameHint:
      'Você ainda não participa de nenhuma mesa. Peça um link de convite ao mestre, ou crie uma mesa (você será o mestre).',
    gameName: 'Nome da mesa',
    defaultGameName: 'Axis',
    createFromSeed: 'Criar mesa nova',
    createFromSave: 'Criar a partir de um save…',
    createFailed: 'Não foi possível criar a mesa.',
    inviteAccepted: 'Convite aceito. Bem-vindo à mesa!',
    /** Keyed by the `error` the game function answers when an invite cannot be used. */
    inviteRefused: new Map([
      ['invite_invalid', 'Este convite não existe.'],
      ['invite_expired', 'Este convite expirou. Peça um novo ao mestre.'],
      ['invite_used', 'Este convite já foi usado.'],
      ['invite_revoked', 'Este convite foi cancelado pelo mestre.'],
      ['invite_is_master', 'Você é o mestre desta mesa; o convite é para um jogador.'],
    ]),
    inviteFailed: 'Não foi possível aceitar o convite.',
    signOut: 'Sair da conta',
    loadFailed: 'Não foi possível carregar a mesa. Confira a conexão e recarregue a página.',
    masterOnly: 'Só o mestre da mesa tem as ferramentas de mestre.',
    syncFailed: 'Sem conexão com a mesa. A ação fica pendente e será enviada na próxima tentativa.',
  },

  invites: {
    title: 'Convites',
    hint: 'Cada link liga um jogador a um personagem. Vale uma vez e expira em 7 dias.',
    create: 'Gerar convite',
    copy: 'Copiar link',
    copied: 'Link copiado.',
    copyFailed: 'Não foi possível copiar. Selecione o link e copie à mão.',
    newLink: (name: string) => `Link de convite para ${name}:`,
    pending: 'Pendentes',
    noPending: 'Nenhum convite pendente.',
    expires: (date: string) => `expira em ${date}`,
    revoke: 'Cancelar',
    revoked: 'Convite cancelado.',
    failed: 'Não foi possível concluir. Tente de novo.',
    loadFailed: 'Não foi possível carregar os convites.',
  },

  history: {
    title: 'Histórico completo',
    hint: 'Tudo o que aconteceu na mesa, do mais recente ao mais antigo.',
    empty: 'Nenhuma ação registrada ainda.',
    more: 'Carregar mais',
    loadFailed: 'Não foi possível carregar o histórico.',
    restored: 'Mestre restaurou um backup do jogo',
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

  npcs: {
    title: 'NPCs',
    summary: (total: number, working: number) => `${total} · ${working} trabalhando`,
    compact: (total: number) => String(total),
    empty: 'Nenhum NPC na Axis ainda.',
    noMatch: 'Nenhum NPC com esse filtro.',
    filterSkill: 'Habilidade',
    allSkills: 'Todas as habilidades',
    onlyIdle: 'Só sem trabalho',
    home: 'Moradia',
    noHome: 'Sem moradia',
    homeOption: (building: string, used: number, capacity: number) =>
      `${building} (${used}/${capacity})`,
    job: 'Trabalho',
    noJob: 'Sem trabalho',
    jobAt: (activity: string, building: string) => `${activity} em ${building}`,
    currentPost: (building: string) => `posto atual: ${building}`,
    hinders: '⚠ atrapalha',
    unassign: 'Dispensar',
    newNpc: 'Novo NPC',
    titleField: 'Título (ex.: Maga)',
    portrait: 'Retrato (chave do assets.json ou URL)',
    wage: 'Salário diário',
    wageText: (coins: string) => `Salário: ${coins}/dia`,
    noWage: 'Sem salário',
    status: 'Situação',
    statuses: {
      disponivel: 'Disponível',
      trabalhando: 'Trabalhando',
      ferido: 'Ferido',
      em_missao: 'Em missão',
    } satisfies Record<NpcStatus, string>,
    residents: (used: number, capacity: number) => `Moradores: ${used} de ${capacity}`,
    posts: 'Postos de trabalho',
    slotsUsed: (used: number, slots: number) => `${used}/${slots} vagas`,
    assign: 'Designar NPC',
    chooseNpc: 'Escolha um NPC',
    chooseResearch: 'Pesquisa',
    noResearch: 'Nenhuma pesquisa em andamento.',
    noCandidates: 'Nenhum outro NPC com moradia para designar.',
    preview: (name: string, effect: string) => `${name}: ${effect}`,
    skillHint: (skill: string, level: number) => `${skill} ${level}`,
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
    readyToComplete: 'Pronta para concluir',
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

  menu: {
    title: 'Cardápio da Taverna',
    open: 'Ver cardápio',
    panelHint: 'Café da manhã, almoço e janta servidos na Taverna.',
    close: 'Fechar cardápio',
    meals: { breakfast: 'Café da manhã', lunch: 'Almoço', dinner: 'Janta' } satisfies Record<
      Meal,
      string
    >,
    lockedAt: (level: number) => `Disponível na Taverna nv. ${level}`,
    notBuilt: 'A Taverna ainda não foi construída: por enquanto nada é servido.',
    empty: 'Nenhum prato nesta refeição.',
    enlarge: (name: string) => `Ampliar a foto: ${name}`,
    closePhoto: 'Fechar a foto',
  },

  archive: {
    title: 'Arquivo de registros',
    open: 'Abrir registros',
    panelHint: 'Relatórios, formulários, personagens e cartas da campanha, organizados em tópicos.',
    counts: (topics: number, notes: number) =>
      `${topics} ${topics === 1 ? 'tópico' : 'tópicos'} · ${notes} ${notes === 1 ? 'nota' : 'notas'}`,
    close: 'Fechar',
    search: 'Buscar nas notas',
    searchResults: (count: number) =>
      count === 0
        ? 'Nenhuma nota encontrada.'
        : `${count} ${count === 1 ? 'nota encontrada' : 'notas encontradas'}`,
    character: 'Você é',
    topics: 'Tópicos',
    backToTopics: '← Tópicos',
    noTopics: 'Nenhum tópico ainda. Crie o primeiro (ex.: NPCs, Monstros, Relatórios).',
    newTopic: '+ Tópico',
    topicName: 'Nome do tópico',
    topicIcon: 'Ícone (emoji)',
    createTopic: 'Criar',
    renameTopic: 'Editar tópico',
    saveTopic: 'Salvar',
    removeTopic: 'Remover tópico',
    moveUp: 'Subir',
    moveDown: 'Descer',
    pickTopic: 'Escolha um tópico à esquerda.',
    emptyTopic: 'Nenhuma nota neste tópico.',
    newNote: '+ Nota',
    paste: 'Colar registros',
    noteTitle: 'Título',
    noteDay: 'Dia de jogo',
    notePinned: 'Fixar no topo',
    noteBody: 'Texto (aceita a formatação do Discord)',
    visibility: 'Quem vê',
    visibilityOptions: { todos: 'Todos', mestre: 'Só o mestre' } satisfies Record<
      NoteVisibility,
      string
    >,
    masterOnlyBadge: '🔒 só o mestre',
    pinnedBadge: '📌',
    preview: 'Prévia',
    rawText: 'Texto',
    save: 'Salvar',
    cancel: 'Cancelar',
    edit: 'Editar',
    remove: 'Remover',
    moveTo: 'Mover para',
    move: 'Mover',
    day: (day: number) => `Dia ${day}`,
    byline: (author: string, editor?: string) =>
      editor && editor !== author ? `por ${author} · editado por ${editor}` : `por ${author}`,
    pasteHint:
      'Cole o texto do Discord. Cada linha só de traços (-----) separa um registro; a primeira linha vira o título.',
    pastePreview: 'Pré-visualizar',
    pasteBack: 'Voltar',
    pasteSave: (count: number) => `Salvar ${count} ${count === 1 ? 'registro' : 'registros'}`,
    pasteEmpty: 'Nenhum registro encontrado no texto colado.',
    pasteTooLong: (limit: number) =>
      `Texto acima de ${limit.toLocaleString('pt-BR')} caracteres: divida antes de salvar.`,
    pasteChars: (count: number) => `${count.toLocaleString('pt-BR')} caracteres`,
    trash: (count: number) => `🗑 Lixeira (${count})`,
    trashTitle: 'Lixeira',
    trashHint:
      'O que foi removido fica aqui até o mestre esvaziar a lixeira. Qualquer um pode restaurar.',
    trashEmpty: 'A lixeira está vazia.',
    trashedTopic: (name: string) => `Tópico: ${name}`,
    trashedNote: (title: string, topic: string) => `${title} (em ${topic})`,
    restore: 'Restaurar',
    emptyTrash: 'Esvaziar lixeira',
    errors: {
      empty_name: 'Informe um nome (ou título).',
      duplicate_name: 'Já existe um tópico com esse nome.',
      duplicate_id: 'Esse registro já foi criado.',
      not_found: 'Registro não encontrado (talvez já tenha sido removido).',
      category_not_empty: 'O tópico ainda tem notas. Mova-as ou remova-as antes.',
      forbidden: 'Somente o Mestre pode fazer isso.',
      too_long: `Título até ${TITLE_LIMIT} caracteres e texto até ${BODY_LIMIT.toLocaleString('pt-BR')}.`,
      invalid_command: 'Ação inválida. Confira os valores informados.',
      no_author: 'Escolha seu personagem antes de escrever no Arquivo.',
    } satisfies Record<ArchiveError, string>,
  },
  errors: {
    empty_name: 'Informe um nome.',
    duplicate_name: 'Já existe um item com esse nome.',
    duplicate_id: 'Esse item já foi criado.',
    not_found: 'Item não encontrado (talvez já tenha sido removido).',
    category_not_empty: 'A categoria ainda tem itens. Mova-os ou remova-os antes.',
    insufficient_coins: 'Não há moedas suficientes nessa carteira.',
    nothing_to_move: 'Informe ao menos uma moeda.',
    same_wallet: 'Escolha carteiras diferentes.',
    character_has_coins: 'Este personagem ainda tem moedas. Transfira-as antes de remover.',
    no_home: 'O NPC precisa de moradia antes de trabalhar.',
    home_full: 'Não há vaga de moradia nesta construção.',
    no_housing: 'Este espaço não oferece moradia.',
    post_full: 'Todas as vagas deste posto estão ocupadas.',
    invalid_post: 'Esta construção não oferece esse posto agora.',
    invalid_target: 'Escolha uma pesquisa em andamento para este posto.',
    forbidden: 'Somente o Mestre pode fazer isso.',
    invalid_command: 'Ação inválida. Confira os valores informados.',
    blocked: 'A construção não atende aos requisitos.',
    conflict: 'O jogo mudou em outro lugar; sua última ação foi desfeita.',
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

/** Master-only entries from before actors were logged read as the master's. */
function masterActor(entry: LogEntry): string {
  return entry.actor ?? MASTER_ACTOR;
}

export function logEntryText(entry: LogEntry, ctx: TextContext): string {
  return `Dia ${entry.day} — ${logAction(entry, ctx)}`;
}

function logAction(entry: LogEntry, ctx: TextContext): string {
  switch (entry.kind) {
    case 'days_advanced':
      return `${t.days(entry.days)} ${entry.days === 1 ? 'se passou' : 'se passaram'}`;
    case 'build_started':
    case 'upgrade_started':
    case 'build_completed':
    case 'building_forced':
    case 'building_removed':
    case 'building_dropped':
      return buildingAction(entry, ctx);
    case 'coins_adjusted':
      return `${masterActor(entry)} ajustou as moedas ${walletOf(entry.wallet)}: ${signedList(entry.delta, ctx)}`;
    case 'coins_deposited':
      return `${entry.character} depositou ${ctx.coins(entry.coins)} no Acampamento`;
    case 'coins_transferred':
      return `${masterActor(entry)} transferiu ${ctx.coins(entry.coins)} ${walletOf(entry.from)} para ${walletName(entry.to)}`;
    case 'coins_consolidated':
      return `${masterActor(entry)} consolidou as moedas ${walletOf(entry.wallet)}`;
    case 'material_adjusted':
      return entry.delta > 0
        ? `${masterActor(entry)} adicionou ${entry.delta} ${entry.material}`
        : `${masterActor(entry)} removeu ${-entry.delta} ${entry.material}`;
    case 'material_added':
      return `${masterActor(entry)} cadastrou o material ${entry.material}`;
    case 'material_removed':
      return `${masterActor(entry)} removeu o material ${entry.material}`;
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
    case 'research_ready':
      return `Pesquisa '${entry.title}' chegou a 100% e está pronta para concluir`;
    case 'npc_added':
    case 'npc_updated':
    case 'npc_removed':
    case 'npc_unassigned':
    case 'npc_home_set':
    case 'npc_job_set':
    case 'npc_released':
    case 'npc_worked':
    case 'npc_wages_paid':
    case 'npc_unpaid':
      return npcAction(entry, ctx);
    case 'archive_changed':
      return archiveAction(masterActor(entry), entry.change);
    default:
      return assertNever(entry);
  }
}

/** "Thorin criou o tópico Pets", "Gus removeu 'Mapa do Portão Oito' (está na lixeira)". */
export function archiveAction(actor: string, change: ArchiveChange): string {
  switch (change.target) {
    case 'topic':
    case 'note': {
      if (change.action === 'moved') {
        return `${actor} moveu '${change.title}' de ${change.from} para ${change.to}`;
      }
      const what = change.target === 'topic' ? `o tópico ${change.title}` : `'${change.title}'`;
      const trash = change.action === 'removed' ? ' (está na lixeira)' : '';
      return `${actor} ${ARCHIVE_VERBS[change.action]} ${what}${trash}`;
    }
    case 'notes':
      return `${actor} colou ${change.count} ${change.count === 1 ? 'registro' : 'registros'} em ${change.title}`;
    case 'trash':
      return `${actor} esvaziou a lixeira do Arquivo`;
    default:
      return assertNever(change);
  }
}

const ARCHIVE_VERBS = {
  created: 'criou',
  edited: 'editou',
  reordered: 'reordenou',
  removed: 'removeu',
  restored: 'restaurou',
} as const;

/** "+3,4 Ferro por dia"; a bonus reads as its own text. */
/** "+3,4 Ferro por dia"; a negative yield reads "-2,0 Ferro por dia" or "obra atrasada…". */
export function jobEffectText(effect: JobEffect, tenthsPerDay: number, ctx: TextContext): string {
  const amount = t.tenths(Math.abs(tenthsPerDay));
  const signed = `${tenthsPerDay < 0 ? '-' : '+'}${amount}`;
  switch (effect.type) {
    case 'produce':
      return `${signed} ${ctx.material(effect.material)} por dia`;
    case 'research':
      return `${signed} de progresso por dia`;
    case 'construction':
      return `obra ${tenthsPerDay < 0 ? 'atrasada' : 'adiantada'} em ${amount} dia por dia`;
    case 'bonus':
      return effect.text;
    default:
      return assertNever(effect);
  }
}

type NpcEntry = Extract<LogEntry, { kind: `npc_${string}` }>;

const releaseReasons: Record<NpcReleaseReason, string> = {
  building_removed: 'a construção foi removida',
  capacity: 'a construção perdeu vagas',
  construction_done: 'a obra terminou',
  research_closed: 'a pesquisa foi encerrada',
  no_home: 'ficou sem moradia',
};

function npcAction(entry: NpcEntry, ctx: TextContext): string {
  const who = entry.actor ? `${entry.actor}: ` : '';
  switch (entry.kind) {
    case 'npc_added':
      return `${masterActor(entry)} criou o NPC ${entry.npc}`;
    case 'npc_updated':
      return `${masterActor(entry)} editou o NPC ${entry.npc}`;
    case 'npc_removed':
      return `${masterActor(entry)} removeu o NPC ${entry.npc}`;
    case 'npc_unassigned':
      return `${who}${entry.npc} deixou o posto de trabalho`;
    case 'npc_home_set':
      return entry.place
        ? `${who}${entry.npc} passou a morar em ${ctx.building(entry.place)}`
        : `${who}${entry.npc} deixou a moradia`;
    case 'npc_job_set':
      return `${who}${entry.npc} assumiu o posto ${entry.activity} em ${ctx.building(entry.place)}`;
    case 'npc_released': {
      const what = entry.from === 'home' ? 'perdeu a moradia' : 'perdeu o posto de trabalho';
      return `${entry.npc} ${what}: ${releaseReasons[entry.reason]}`;
    }
    case 'npc_worked':
      return npcWorkText(entry, ctx);
    case 'npc_wages_paid':
      return `Salários de NPCs pagos pelo Acampamento: ${ctx.gold(entry.bronze)}`;
    case 'npc_unpaid':
      return `${entry.npc} ficou sem pagamento e não trabalhou por ${t.days(entry.days)}`;
    default:
      return assertNever(entry);
  }
}

/** A negative amount means the NPC worked against the post. */
function npcWorkText(entry: Extract<LogEntry, { kind: 'npc_worked' }>, ctx: TextContext): string {
  const { npc, target } = entry;
  const amount = Math.abs(entry.amount);
  const hindered = entry.amount < 0;
  switch (entry.effect) {
    case 'produce':
      return `${npc} ${hindered ? 'estragou' : 'produziu'} ${amount} ${target}`;
    case 'research':
      return hindered
        ? `${npc} fez a pesquisa '${target}' regredir ${amount}%`
        : `${npc} avançou a pesquisa '${target}' em ${amount}%`;
    case 'construction':
      return `${npc} ${hindered ? 'atrasou' : 'adiantou'} a obra de ${ctx.building(target)} em ${t.days(amount)}`;
    default:
      return assertNever(entry.effect);
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
    building_forced: `${masterActor(entry)} definiu ${what}`,
    building_removed: `${masterActor(entry)} removeu ${what}`,
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
