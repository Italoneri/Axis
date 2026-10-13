import Phaser from 'phaser';
import { toPixels } from '../map/geometry';
import {
  blockAt,
  intentFor,
  poseAt,
  scheduleFor,
  type Pose,
  type Schedule,
  type WalkIntent,
} from '../map/npcRoutes';
import {
  FACINGS,
  NPC_FRAME_SIZE,
  sheetKeys,
  spriteFor,
  usedColumns,
  type SpriteOverrides,
} from '../map/npcSprites';
import type { WalkGraph } from '../map/walkGraph';
import type { GameState, Npc } from '../model/schema';
import type { WalkingNpcsSetting } from '../ui/walkingNpcsSetting';
import type { CameraController } from './CameraController';
import { isCanvasGesture, isOverCanvas } from './pointerGesture';

/** A person stands about a third as tall as an outer building is deep. */
const PERSON_HEIGHT_PER_OUTER_DEPTH = 1 / 3;
/** Height of an LPC body inside its 64 px frame, and where its feet rest. */
const LPC_BODY_PX = 52;
const LPC_FEET_Y = 61 / NPC_FRAME_SIZE;
/** Above the floor, slot foundations and gates; below the buildings (30) and their effects. */
const DEPTH = { shadow: 24, body: 25, label: 33 };
/** Zoom, as a multiple of the "whole map" zoom, where NPCs start to show and where they are fully shown. */
const ZOOM_FADE = { from: 1.4, to: 1.8 };
const WALK_FPS = 8;
const IDLE_FPS = 2;
/** Small screens draw fewer NPCs, like the FX budget. */
const MAX_WALKERS = { small: 30, large: 60 };
const SMALL_SCREEN_PX = 640;
/** A pose further than this from the last frame was a jump (a new job, for instance): fade it in. */
const JUMP_SECONDS = 2;
const JUMP_FADE_MS = 500;
const LABEL_FONT_PX = 14;
const LABEL_GAP_PX = 4;

interface Sheet {
  readonly key: string;
  readonly columns: number;
  readonly used: number;
}

interface Look {
  readonly walk: Sheet;
  readonly idle: Sheet | undefined;
}

interface Walker {
  npc: Npc;
  intent: WalkIntent;
  intentKey: string;
  schedule: Schedule | undefined;
  look: Look;
  readonly body: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  last: Phaser.Math.Vector2 | undefined;
  fadeInFrom: number;
}

export interface WalkingNpcsOptions {
  readonly graph: WalkGraph;
  readonly mapSize: number;
  /** Depth of an outer building (normalized), the yardstick for a person's height. */
  readonly outerDepth: number;
  readonly sprites: readonly string[];
  readonly overrides: SpriteOverrides;
  readonly setting: WalkingNpcsSetting;
  readonly camera: CameraController;
  readonly onClick: (npc: Npc) => void;
}

/**
 * NPCs walking the corridors: purely visual and computed from the wall clock
 * (see npcRoutes), so every player sees the same scene without a server.
 */
export class WalkingNpcs {
  private readonly walkers = new Map<string, Walker>();
  private readonly sheets = new Map<string, Sheet>();
  private readonly label: Phaser.GameObjects.Text;
  private readonly scale: number;
  private readonly maxWalkers: number;
  private hovered: Walker | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: WalkingNpcsOptions,
  ) {
    const personPx = options.outerDepth * options.mapSize * PERSON_HEIGHT_PER_OUTER_DEPTH;
    this.scale = personPx / LPC_BODY_PX;
    this.maxWalkers = scene.scale.width < SMALL_SCREEN_PX ? MAX_WALKERS.small : MAX_WALKERS.large;
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: 'Cinzel, serif',
        fontSize: `${LABEL_FONT_PX}px`,
        color: '#f3e3a6',
        backgroundColor: 'rgba(20, 18, 22, 0.8)',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.label)
      .setVisible(false);
    scene.input.on(Phaser.Input.Events.GAME_OUT, () => this.hover(null));
  }

  /** Adds, updates and removes walkers to match the game state. */
  sync(state: GameState): void {
    const slotBuildings = new Map(
      Object.entries(state.slots).map(([slotId, placed]) => [slotId, placed.buildingId]),
    );
    const shown = state.npcs
      .map((npc) => ({ npc, intent: intentFor(npc, this.options.graph, slotBuildings) }))
      .filter(({ intent }) => intent.kind !== 'hidden')
      .slice(0, this.maxWalkers);
    const ids = new Set(shown.map(({ npc }) => npc.id));
    this.walkers.forEach((walker, id) => {
      if (!ids.has(id)) this.remove(walker, id);
    });
    shown.forEach(({ npc, intent }) => this.place(npc, intent));
  }

  /** Called every frame by the scene. */
  update(): void {
    const zoomAlpha = this.zoomAlpha();
    const isShown = this.options.setting.isActive && !document.hidden && zoomAlpha > 0;
    if (!isShown) return this.hideAll();
    const seconds = Date.now() / 1000;
    this.walkers.forEach((walker) => this.draw(walker, seconds, zoomAlpha));
    this.drawLabel();
  }

  destroy(): void {
    this.walkers.forEach((walker, id) => this.remove(walker, id));
    this.label.destroy();
  }

  private place(npc: Npc, intent: WalkIntent): void {
    const intentKey = JSON.stringify(intent);
    const existing = this.walkers.get(npc.id);
    if (existing) {
      existing.npc = npc;
      if (existing.intentKey === intentKey) return;
      existing.intent = intent;
      existing.intentKey = intentKey;
      existing.schedule = undefined;
      return;
    }
    const look = this.lookFor(npc.id);
    if (!look) return;
    const shadow = this.scene.add
      .ellipse(
        0,
        0,
        NPC_FRAME_SIZE * 0.5 * this.scale,
        NPC_FRAME_SIZE * 0.16 * this.scale,
        0x000000,
        0.28,
      )
      .setDepth(DEPTH.shadow)
      .setVisible(false);
    const body = this.scene.add
      .sprite(0, 0, look.walk.key, 0)
      .setOrigin(0.5, LPC_FEET_Y)
      .setScale(this.scale)
      .setDepth(DEPTH.body)
      .setVisible(false);
    const walker: Walker = {
      npc,
      intent,
      intentKey,
      schedule: undefined,
      look,
      body,
      shadow,
      last: undefined,
      fadeInFrom: 0,
    };
    this.listen(walker);
    this.walkers.set(npc.id, walker);
  }

  private listen(walker: Walker): void {
    const { body } = walker;
    const canvas = this.scene.game.canvas;
    // The body only, not the transparent margin of the frame.
    const inset = NPC_FRAME_SIZE / 4;
    body.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        inset,
        inset / 2,
        NPC_FRAME_SIZE - inset * 2,
        NPC_FRAME_SIZE - inset / 2,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    body.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      if (isOverCanvas(pointer, canvas)) this.hover(walker);
    });
    body.on('pointerout', () => {
      if (this.hovered === walker) this.hover(null);
    });
    body.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (isCanvasGesture(pointer, canvas) && !this.options.camera.wasDragging) {
        this.options.onClick(walker.npc);
      }
    });
  }

  private remove(walker: Walker, id: string): void {
    if (this.hovered === walker) this.hover(null);
    walker.body.destroy();
    walker.shadow.destroy();
    this.walkers.delete(id);
  }

  private draw(walker: Walker, seconds: number, zoomAlpha: number): void {
    const pose = this.poseOf(walker, seconds);
    if (!pose) return this.hide(walker);
    const { x, y } = toPixels(pose.point, this.options.mapSize);
    const alpha = pose.alpha * zoomAlpha * this.jumpFade(walker, x, y, seconds);
    if (alpha <= 0.02) return this.hide(walker);

    walker.body.setPosition(x, y).setAlpha(alpha).setVisible(true);
    walker.shadow.setPosition(x, y).setAlpha(alpha).setVisible(true);
    const { key, frame } = this.frameOf(walker.look, pose, seconds);
    walker.body.setTexture(key, frame);
  }

  private poseOf(walker: Walker, seconds: number): Pose | undefined {
    const block = blockAt(seconds);
    if (walker.schedule?.block !== block) {
      walker.schedule = scheduleFor(walker.npc.id, walker.intent, this.options.graph, block);
    }
    return poseAt(walker.schedule, this.options.graph, seconds);
  }

  /** Fades in a walker that just appeared or jumped to a new route. */
  private jumpFade(walker: Walker, x: number, y: number, seconds: number): number {
    const now = seconds * 1000;
    const maxStep = this.options.graph.speed * this.options.mapSize * JUMP_SECONDS;
    const jumped =
      !walker.last || Phaser.Math.Distance.Between(walker.last.x, walker.last.y, x, y) > maxStep;
    if (jumped) walker.fadeInFrom = now;
    walker.last = (walker.last ?? new Phaser.Math.Vector2()).set(x, y);
    return Phaser.Math.Clamp((now - walker.fadeInFrom) / JUMP_FADE_MS, 0, 1);
  }

  /** Walk cycle while moving; the idle sheet (or the walk's neutral step) while standing. */
  private frameOf(look: Look, pose: Pose, seconds: number): { key: string; frame: number } {
    const row = FACINGS.indexOf(pose.facing);
    const { walk, idle } = look;
    if (pose.moving && walk.used > 1) {
      const step = Math.floor(seconds * WALK_FPS) % (walk.used - 1);
      return { key: walk.key, frame: row * walk.columns + 1 + step };
    }
    if (idle && idle.used > 0) {
      const breath = Math.floor(seconds * IDLE_FPS) % idle.used;
      return { key: idle.key, frame: row * idle.columns + breath };
    }
    return { key: walk.key, frame: row * walk.columns };
  }

  private lookFor(npcId: string): Look | undefined {
    const name = spriteFor(npcId, this.options.sprites, this.options.overrides);
    if (!name) return undefined;
    const keys = sheetKeys(name);
    const walk = this.sheet(keys.walk);
    if (!walk || walk.used === 0) return undefined;
    return { walk, idle: this.sheet(keys.idle) };
  }

  /** Reads the sheet once: how many columns it has and how many hold drawn frames. */
  private sheet(key: string): Sheet | undefined {
    const known = this.sheets.get(key);
    if (known) return known;
    if (!this.scene.textures.exists(key)) return undefined;
    const texture = this.scene.textures.get(key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const image = texture.getSourceImage();
    const columns = Math.floor(image.width / NPC_FRAME_SIZE);
    const rows = Math.min(FACINGS.length, Math.floor(image.height / NPC_FRAME_SIZE));
    const sheet = { key, columns, used: drawnColumns(image, columns, rows) };
    this.sheets.set(key, sheet);
    return sheet;
  }

  private zoomAlpha(): number {
    const factor = this.options.camera.zoomFactor;
    return Phaser.Math.Clamp((factor - ZOOM_FADE.from) / (ZOOM_FADE.to - ZOOM_FADE.from), 0, 1);
  }

  private hover(walker: Walker | null): void {
    this.hovered = walker;
    if (!walker) this.label.setVisible(false);
  }

  /** The hovered NPC's name, kept the same size on screen at any zoom. */
  private drawLabel(): void {
    const walker = this.hovered;
    if (!walker || !walker.body.visible) return void this.label.setVisible(false);
    const zoom = this.scene.cameras.main.zoom;
    const headY = walker.body.y - LPC_BODY_PX * this.scale;
    this.label
      .setText(walker.npc.name)
      .setScale(1 / zoom)
      .setPosition(walker.body.x, headY - LABEL_GAP_PX / zoom)
      .setVisible(true);
  }

  private hideAll(): void {
    this.walkers.forEach((walker) => this.hide(walker));
    this.label.setVisible(false);
  }

  private hide(walker: Walker): void {
    walker.body.setVisible(false);
    walker.shadow.setVisible(false);
  }
}

function drawnColumns(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | Phaser.GameObjects.RenderTexture,
  columns: number,
  rows: number,
): number {
  const canvas = document.createElement('canvas');
  canvas.width = columns * NPC_FRAME_SIZE;
  canvas.height = rows * NPC_FRAME_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || image instanceof Phaser.GameObjects.RenderTexture) return columns;
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return usedColumns(columns, rows, (column, row) => {
    for (let y = row * NPC_FRAME_SIZE; y < (row + 1) * NPC_FRAME_SIZE; y++) {
      const offset = (y * canvas.width + column * NPC_FRAME_SIZE) * 4;
      for (let x = 0; x < NPC_FRAME_SIZE; x++) {
        if ((data[offset + x * 4 + 3] ?? 0) > 0) return true;
      }
    }
    return false;
  });
}
