import { describe, expect, it } from 'vitest';
import { logEntryText, t } from '../i18n/pt-BR';
import { serverCatalog } from '../server/catalog';
import { createInitialState } from '../systems/SaveSystem';
import { textContext } from '../ui/format';
import { historyLines } from './HistoryPanel';

const ctx = textContext(serverCatalog, createInitialState(serverCatalog));
const advanced = { day: 2, kind: 'days_advanced', days: 1, actor: 'Mestre' } as const;
const adjusted = { day: 2, kind: 'material_adjusted', material: 'Ferro', delta: 3 } as const;

describe('historyLines', () => {
  it('lists every entry newest first, across rows', () => {
    const rows = [
      { id: 2, command: { type: 'adjust_material' }, entries: [adjusted] },
      { id: 1, command: { type: 'advance_days' }, entries: [advanced] },
    ];
    expect(historyLines(rows, ctx)).toEqual([
      logEntryText(adjusted, ctx),
      logEntryText(advanced, ctx),
    ]);
  });

  it('shows a restored backup, which logs no entries of its own', () => {
    const rows = [{ id: 3, command: { type: 'restore_save' }, entries: [] }];
    expect(historyLines(rows, ctx)).toEqual([t.history.restored]);
  });
});
