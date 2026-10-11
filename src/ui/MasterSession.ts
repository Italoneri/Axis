import { t } from '../i18n/pt-BR';

const SESSION_KEY = 'axis-base-builder:master';

type Listener = (isActive: boolean) => void;

/**
 * What the interface needs to know about the master tools: offline it is the
 * password session below, online the role from the login (src/online). Either
 * way it only decides what to show; the rules check permissions themselves.
 */
export interface MasterAccess {
  readonly isActive: boolean;
  /** False when the master tools cannot be reached at all (offline without a password). */
  readonly isConfigured: boolean;
  /** Text of the button that leaves the master tools. */
  readonly leaveLabel: string;
  subscribe(listener: Listener): void;
  lock(): void;
}

/**
 * Client-side gate for the master tools. The password ships inside the
 * bundle, so this only keeps players from wandering in; phase 3 moves the
 * real authority to the server.
 */
export class MasterSession implements MasterAccess {
  private active: boolean;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly password: string | undefined,
    private readonly storage: Storage,
  ) {
    this.active = this.isConfigured && storage.getItem(SESSION_KEY) === '1';
  }

  get isConfigured(): boolean {
    return Boolean(this.password);
  }

  readonly leaveLabel = t.master.leave;

  get isActive(): boolean {
    return this.active;
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  unlock(input: string): boolean {
    if (!this.isConfigured || input !== this.password) return false;
    this.storage.setItem(SESSION_KEY, '1');
    this.setActive(true);
    return true;
  }

  lock(): void {
    this.storage.removeItem(SESSION_KEY);
    this.setActive(false);
  }

  private setActive(active: boolean): void {
    this.active = active;
    this.listeners.forEach((listener) => listener(active));
  }
}
