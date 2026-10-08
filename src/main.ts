import Phaser from 'phaser';
import { logEntryText, t } from './i18n/pt-BR';
import { catalogNames } from './model/catalog';
import { BaseScene } from './scenes/BaseScene';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameStore } from './store';
import { SlotPanel } from './ui/SlotPanel';
import { showToast } from './ui/Toasts';
import { mountTopBar } from './ui/TopBar';
import './ui/ui.css';

function requireElement(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id} in index.html`);
  return node;
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

  const names = catalogNames(gameData);
  // Every new log entry becomes a toast; a replaced save just resets the cursor.
  let shownLogEntries = store.current.log.length;
  store.subscribe((state, change) => {
    if (change.kind !== 'loaded') {
      state.log.slice(shownLogEntries).forEach((entry) => notify(logEntryText(entry, names)));
    }
    shownLogEntries = state.log.length;
  });

  mountTopBar(requireElement('topbar'), store, notify);
  const panel = new SlotPanel(requireElement('panel'), store);

  await document.fonts.ready;
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0e0c10',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [new BootScene(), new PreloadScene(gameData.assets), new BaseScene(store, panel)],
  });

  if (import.meta.env.DEV) {
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'd' && !(event.target instanceof HTMLInputElement))
        store.advanceDays(1);
    });
    console.info(t.devAdvanceHint);
  }
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
