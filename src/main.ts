import Phaser from 'phaser';
import { logEntryText, t } from './i18n/pt-BR';
import { BaseScene } from './scenes/BaseScene';
import { BootScene } from './scenes/BootScene';
import { BuildingPreview } from './map/buildingPreview';
import { LiveMap } from './map/liveMap';
import { mapResolution } from './map/textures';
import { parseTheme, ThemeStore } from './map/theme';
import { PreloadScene } from './scenes/PreloadScene';
import { ArchiveStore } from './archiveStore';
import { LocalArchiveRepository } from './persistence/LocalArchiveRepository';
import type { ArchiveRepository } from './persistence/ArchiveRepository';
import { LocalRepository } from './persistence/LocalRepository';
import { GameStore } from './store';
import { ArchiveWindow, CHARACTER_MEMORY_KEY } from './ui/archive/ArchiveWindow';
import { InfoDrawer, type DrawerExtras } from './ui/InfoDrawer';
import { commandContext } from './ui/currentActor';
import { askMasterPassword } from './ui/MasterLogin';
import { parseCredits, showCredits } from './ui/Credits';
import { MasterSession, type MasterAccess } from './ui/MasterSession';
import { hideGate } from './online/screens';
import { onlineConfig } from './online/config';
import type { Actor, CommandContext, GameCommand } from './commands/schema';
import type { Catalog } from './model/catalog';
import type { GameRepository } from './persistence/GameRepository';
import { textContext } from './ui/format';
import { SlotPanel } from './ui/SlotPanel';
import { showToast } from './ui/Toasts';
import { mountTopBar } from './ui/TopBar';
import './ui/ui.css';
import { MenuWindow } from './ui/menu/MenuWindow';
import { UiMemory } from './ui/uiMemory';
import type { Act } from './ui/widgets';

type Notify = (message: string, tone?: 'error') => void;

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

interface Mode {
  isOnline: boolean;
  repository: GameRepository;
  archiveRepository: ArchiveRepository;
  /** Online, the login fixes who writes in the archive; offline the window asks. */
  archiveActor?: Actor;
  session: MasterAccess;
  contextFor: (command: GameCommand) => CommandContext;
  drawerExtras: (store: GameStore) => DrawerExtras;
}

/**
 * Offline unless both Supabase variables are set. The online code (and
 * supabase-js) is only downloaded when it is used. Null while a login or
 * "create a game" screen waits for the user.
 */
async function openMode(catalog: Catalog, notify: Notify): Promise<Mode | null> {
  const config = onlineConfig(import.meta.env);
  if (!config) {
    const session = new MasterSession(import.meta.env.VITE_MASTER_PASSWORD, window.sessionStorage);
    return {
      isOnline: false,
      repository: new LocalRepository(window.localStorage, catalog, window),
      archiveRepository: new LocalArchiveRepository(window.localStorage, window),
      session,
      contextFor: (command) => commandContext(session, command),
      drawerExtras: () => ({}),
    };
  }
  const { bootOnline } = await import('./online/onlineBoot');
  const game = await bootOnline(config, catalog, notify);
  if (!game) return null;
  return {
    isOnline: true,
    repository: game.repository,
    archiveRepository: game.archiveRepository,
    archiveActor: game.archiveActor,
    session: game.access,
    contextFor: game.contextFor,
    drawerExtras: (store) => game.drawerExtras(store, notify),
  };
}

async function start(): Promise<void> {
  const toasts = requireElement('toasts');
  const notify: Notify = (message, tone) => showToast(toasts, message, tone);

  // Loaded dynamically so a mistake in src/data/*.json shows up on screen instead of a blank page.
  const [{ gameData }, theme, credits] = await Promise.all([
    import('./data/gameData'),
    import('./data/theme.json').then((m) => parseTheme(m.default)),
    import('./data/credits.json').then((m) => parseCredits(m.default)),
  ]);
  const mode = await openMode(gameData, notify);
  if (!mode) return;
  const { repository, session } = mode;
  const memory = new UiMemory(safeLocalStorage());
  // Offline, the character picked in the archive window writes (and logs) the records.
  const archiveViewer = (): Actor => {
    if (mode.archiveActor) return mode.archiveActor;
    if (session.isActive) return { role: 'master' };
    const ids = store.current.characters.map((c) => c.id);
    return {
      role: 'player',
      characterId: memory.pick(CHARACTER_MEMORY_KEY, ids, ids[0] ?? '') || undefined,
    };
  };
  const store = await GameStore.open(gameData, repository, {
    contextFor: (command) =>
      command.type === 'archive_log' ? { actor: archiveViewer() } : mode.contextFor(command),
    onRefused: (error) => notify(t.errors[error], 'error'),
    onPersistError: (error) => {
      console.error('[save] could not persist state', error);
      notify(mode.isOnline ? t.online.syncFailed : t.save.storageFailed, 'error');
    },
  });
  const archive = await ArchiveStore.open(mode.archiveRepository, {
    viewer: archiveViewer,
    onLogged: (change) => void store.dispatch({ type: 'archive_log', change }),
    onRefused: (error) => notify(t.archive.errors[error], 'error'),
    onPersistError: (error) => {
      console.error('[archive] could not reach the archive', error);
      notify(mode.isOnline ? t.online.syncFailed : t.save.storageFailed, 'error');
    },
  });
  const archiveWindow = new ArchiveWindow({
    archive,
    game: store,
    memory,
    canPickCharacter: () => !mode.isOnline && !session.isActive,
  });
  const openArchive = () => archiveWindow.open();
  const menuWindow = new MenuWindow({ game: store, memory });
  const openMenu = () => menuWindow.open();
  hideGate();

  // Every entry a local command logs becomes a toast.
  store.subscribe((state, _change, logged) => {
    const ctx = textContext(gameData, state);
    logged.forEach((entry) => notify(logEntryText(entry, ctx)));
  });

  const liveMap = new LiveMap(gameData.layout, new ThemeStore(theme), mapResolution());
  const act: Act = (command) => store.dispatch(command) === null;
  const preview = new BuildingPreview();
  const drawer = new InfoDrawer(
    requireElement('drawer'),
    store,
    session,
    { liveMap, preview },
    act,
    { ...mode.drawerExtras(store), openArchive, openMenu },
  );
  const panel = new SlotPanel(
    requireElement('panel'),
    store,
    session,
    { store: archive, open: openArchive },
    openMenu,
  );

  mountTopBar(
    requireElement('topbar'),
    requireElement('popover'),
    { store, session, act, memory, archive },
    {
      notify,
      toggleDrawer: () => drawer.toggle(),
      showCredits: () => showCredits(credits),
      openMaster: async () => {
        if (session.isActive) return drawer.open('master');
        if (mode.isOnline) return notify(t.online.masterOnly, 'error');
        if (!session.isConfigured) return notify(t.master.notConfigured, 'error');
        if (session instanceof MasterSession && (await askMasterPassword(session))) {
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
      new BaseScene(store, panel, liveMap, preview),
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
