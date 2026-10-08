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

  devAdvanceHint: 'Dev: tecla D avança 1 dia',
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
  const who = entry.actor ? `${entry.actor} ` : '';
  const what = `${names.building(entry.buildingId)} nv. ${entry.level}`;
  const action = {
    build_started: who ? `${who}iniciou ${what}` : `Iniciada: ${what}`,
    upgrade_started: who ? `${who}começou a melhorar ${what}` : `Melhoria iniciada: ${what}`,
    build_completed: `Concluída: ${what}`,
  }[entry.kind];
  return `Dia ${entry.day} — ${action}`;
}

function assertNever(value: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(value)}`);
}
