const SESSION_KEY = 'axis-base-builder:master';

type Listener = (isActive: boolean) => void;

/**
 * Client-side gate for the master tools. The password ships inside the
 * bundle, so this only keeps players from wandering in; phase 3 moves the
 * real authority to the server.
 */
export class MasterSession {
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
