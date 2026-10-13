import { describe, expect, it } from 'vitest';
import { UiMemory } from './uiMemory';
import { WalkingNpcsSetting } from './walkingNpcsSetting';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('WalkingNpcsSetting', () => {
  it('starts on and remembers the choice across reloads', () => {
    const storage = memoryStorage();
    const setting = new WalkingNpcsSetting(new UiMemory(storage), () => false);
    expect(setting.isActive).toBe(true);

    setting.choose(false);
    const reloaded = new WalkingNpcsSetting(new UiMemory(storage), () => false);
    expect(reloaded.isChosen).toBe(false);
    expect(reloaded.isActive).toBe(false);
  });

  it('stays off while the system asks for reduced motion, keeping the choice', () => {
    const setting = new WalkingNpcsSetting(new UiMemory(memoryStorage()), () => true);
    expect(setting.isChosen).toBe(true);
    expect(setting.isActive).toBe(false);
  });

  it('tells listeners when it changes', () => {
    const setting = new WalkingNpcsSetting(new UiMemory(memoryStorage()), () => false);
    const seen: boolean[] = [];
    setting.subscribe((isActive) => seen.push(isActive));
    setting.choose(false);
    setting.choose(true);
    expect(seen).toEqual([false, true]);
  });
});
