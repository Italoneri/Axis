import Phaser from 'phaser';
import { logEntryText, t } from './i18n/pt-BR';
import { BaseScene } from './scenes/BaseScene';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { SlotEditor } from './slotEditor';
import { GameStore } from './store';
import { InfoDrawer } from './ui/InfoDrawer';
import { askMasterPassword } from './ui/MasterLogin';
import { MasterSession } from './ui/MasterSession';
import { textContext } from './ui/format';
import { SlotPanel } from './ui/SlotPanel';
import { showToast } from './ui/Toasts';
import { mountTopBar } from './ui/TopBar';
import './ui/ui.css';
import { UiMemory } from './ui/uiMemory';
import type { Act } from './ui/widgets';

function requireElement(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id} in index.html`);
  return node;
}

/** Private modes can throw on access; form memory then just lasts until reload. */
function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('[ui] localStorage unavailable', error);
    return undefined;
  }
}

async function start(): Promise<void> {
  const toasts = requireElement('toasts');
  const notify = (message: string, tone?: 'error') => showToast(toasts, message, tone);

  // Loaded dynamically so a mistake in src/data/*.json shows up on screen instead of a blank page.
  const { gameData } = await import('./data/gameData');
  const store = new GameStore(gameData, window.localStorage, (error) => {
    console.error('[save] could not persist state', error);
    notify(t.save.storageFailed, 'error');
  });

  // Every new log entry becomes a toast; a replaced save just resets the cursor.
  let shownLogEntries = store.current.log.length;
  store.subscribe((state, change) => {
    if (change.kind !== 'loaded') {
      const ctx = textContext(gameData, state);
      state.log.slice(shownLogEntries).forEach((entry) => notify(logEntryText(entry, ctx)));
    }
    shownLogEntries = state.log.length;
  });

  const session = new MasterSession(import.meta.env.VITE_MASTER_PASSWORD, window.sessionStorage);
  const editor = new SlotEditor(gameData.slots);
  const act: Act = (action) => {
    const error = store.apply(action);
    if (error) notify(t.errors[error], 'error');
    return error === null;
  };
  const memory = new UiMemory(safeLocalStorage());
  const drawer = new InfoDrawer(requireElement('drawer'), store, session, editor, act);
  const panel = new SlotPanel(requireElement('panel'), store, session);

  mountTopBar(
    requireElement('topbar'),
    requireElement('popover'),
    { store, session, act, memory },
    {
      notify,
      toggleDrawer: () => drawer.toggle(),
      openMaster: async () => {
        if (session.isActive) return drawer.open('master');
        if (!session.isConfigured) return notify(t.master.notConfigured, 'error');
        if (await askMasterPassword(session)) {
          notify(t.master.unlocked);
          drawer.open('master');
        }
      },
    },
  );
  // Leaving master mode also ends any slot editing in progress.
  session.subscribe((isActive) => {
    if (!isActive) editor.setEditing(false);
  });

  await document.fonts.ready;
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0e0c10',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [
      new BootScene(),
      new PreloadScene(gameData.assets),
      new BaseScene(store, panel, editor),
    ],
  });
}

start().catch((error: unknown) => {
  console.error(error);
  document.body.replaceChildren(
    Object.assign(document.createElement('pre'), {
      className: 'fatal',
      textContent: `${t.dataError}\n\n${error instanceof Error ? error.message : String(error)}`,
    }),
  );
});
