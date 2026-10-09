import Phaser from 'phaser';
import { logEntryText, t } from './i18n/pt-BR';
import { BaseScene } from './scenes/BaseScene';
import { BootScene } from './scenes/BootScene';
import { LiveMap } from './map/liveMap';
import { mapResolution } from './map/textures';
import { parseTheme, ThemeStore } from './map/theme';
import { PreloadScene } from './scenes/PreloadScene';
import { GameStore } from './store';
import { InfoDrawer } from './ui/InfoDrawer';
import { askMasterPassword } from './ui/MasterLogin';
import { parseCredits, showCredits } from './ui/Credits';
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
  const [{ gameData }, theme, credits] = await Promise.all([
    import('./data/gameData'),
    import('./data/theme.json').then((m) => parseTheme(m.default)),
    import('./data/credits.json').then((m) => parseCredits(m.default)),
  ]);
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
  const liveMap = new LiveMap(gameData.layout, new ThemeStore(theme), mapResolution());
  const act: Act = (action) => {
    const error = store.apply(action);
    if (error) notify(t.errors[error], 'error');
    return error === null;
  };
  const memory = new UiMemory(safeLocalStorage());
  const drawer = new InfoDrawer(requireElement('drawer'), store, session, liveMap, act);
  const panel = new SlotPanel(requireElement('panel'), store, session);

  mountTopBar(
    requireElement('topbar'),
    requireElement('popover'),
    { store, session, act, memory },
    {
      notify,
      toggleDrawer: () => drawer.toggle(),
      showCredits: () => showCredits(credits),
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

  await document.fonts.ready;
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#2b2a2c',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [
      new BootScene(),
      new PreloadScene(gameData.assets, liveMap),
      new BaseScene(store, panel, liveMap),
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
