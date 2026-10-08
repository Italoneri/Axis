import type { SlotsFile } from './model/schema';
import { moveSlot } from './systems/SlotLayout';

type Listener = () => void;

/**
 * Working copy of slots.json for the master's drag-and-drop editor. Edits are
 * not persisted: exporting the file and committing it to src/data is the save.
 */
export class SlotEditor {
  private file: SlotsFile;
  private editing = false;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly original: SlotsFile) {
    this.file = original;
  }

  get layout(): SlotsFile {
    return this.file;
  }

  get isEditing(): boolean {
    return this.editing;
  }

  get isDirty(): boolean {
    return this.file !== this.original;
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  setEditing(editing: boolean): void {
    this.editing = editing;
    this.notify();
  }

  /** Coordinates are normalized (0..1 of the map size). */
  move(slotId: string, x: number, y: number): void {
    this.file = moveSlot(this.file, slotId, x, y);
    this.notify();
  }

  reset(): void {
    this.file = this.original;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
