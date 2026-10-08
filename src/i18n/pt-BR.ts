import type { BlockReason } from '../systems/BuildSystem';
import type { LogEntry, SlotType } from '../model/schema';

/** Every user-facing text lives here. Building and resource names live in src/data/*.json. */
export const t = {
  appTitle: 'Axis — Base',
  loading: 'Despertando a Axis…',
  dataError: 'Erro nos dados do jogo',

  day: (day: number) => `Dia ${day}`,
  days: (n: number) => (n === 1 ? '1 dia' : `${n} dias`),
  level: (level: number) => `Nv. ${level}`,
  instant: 'Imediato',

  slotTypes: {
    core: 'Coração',
    inner: 'Anel interno',
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
    resourcesSection: 'Recursos',
    resourcesHint: 'Informe as quantidades e escolha dar ou remover.',
    give: 'Dar',
    take: 'Remover',
    slotsSection: 'Espaços',
    slotsHint: 'Com a edição ligada, arraste os espaços sobre o mapa e exporte o slots.json.',
    editSlots: 'Editar espaços',
    stopEditing: 'Parar edição',
    exportSlots: 'Exportar slots.json',
    resetSlots: 'Descartar alterações',
    slotsEdited: 'Espaços alterados (ainda não salvos no projeto).',
    buildingsHint: 'Para forçar ou remover estruturas, clique num espaço do mapa.',
    forceSection: 'Mestre',
    forceLevel: 'Nível',
    force: 'Forçar',
    completeNow: 'Concluir agora',
    remove: 'Remover estrutura',
    confirmRemove: 'Clique de novo para confirmar',
  },
} as const;

type Names = { building: (id: string) => string; resource: (id: string) => string };

export function blockReasonText(reason: BlockReason, names: Names): string {
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
      return `Requer ${names.building(reason.requirement.building)} nv. ${reason.requirement.minLevel}.`;
    case 'missing_resources':
      return `Faltam ${Object.entries(reason.missing)
        .map(([id, amount]) => `${amount} de ${names.resource(id)}`)
        .join(', ')}.`;
    default:
      return assertNever(reason);
  }
}

export function logEntryText(entry: LogEntry, names: Names): string {
  return `Dia ${entry.day} — ${logAction(entry, names)}`;
}

function logAction(entry: LogEntry, names: Names): string {
  if (entry.kind === 'days_advanced') return `${t.days(entry.days)} se passaram`;
  if (entry.kind === 'resources_adjusted') {
    const changes = Object.entries(entry.delta).map(
      ([id, amount]) => `${amount > 0 ? '+' : ''}${amount} ${names.resource(id)}`,
    );
    return `O mestre ajustou recursos: ${changes.join(', ')}`;
  }

  const what = `${names.building(entry.buildingId)} nv. ${entry.level}`;
  const who = entry.actor ? `${entry.actor} ` : '';
  const actions: Record<typeof entry.kind, string> = {
    build_started: who ? `${who}iniciou ${what}` : `Iniciada: ${what}`,
    upgrade_started: who ? `${who}começou a melhorar ${what}` : `Melhoria iniciada: ${what}`,
    build_completed: `Concluída: ${what}`,
    building_forced: `O mestre definiu ${what}`,
    building_removed: `O mestre removeu ${what}`,
  };
  return actions[entry.kind];
}

function assertNever(value: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(value)}`);
}
