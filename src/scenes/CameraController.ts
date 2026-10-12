import Phaser from 'phaser';
import { clampAxis, NO_INSETS, revealShift, usefulOffset, type Insets } from './cameraMath';
import { startedOnCanvas } from './pointerGesture';

const DRAG_THRESHOLD_PX = 6;
const WHEEL_ZOOM_SPEED = 0.0015;
const MAX_ZOOM_FACTOR = 5;
const MAX_ABSOLUTE_ZOOM = 2;
const GLIDE_MS = 300;
/** Share of the useful area kept between a revealed slot and its edge. */
const REVEAL_MARGIN = 0.15;

/**
 * Wheel zoom (anchored at the cursor) and drag-to-pan at any zoom, clamped so
 * the map stays under the part of the canvas no panel covers. Phaser's built-in
 * camera bounds pin a small world to the top-left, so the clamping is done here.
 */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scene: Phaser.Scene;
  private center: Phaser.Math.Vector2;
  private minZoom = 1;
  private maxZoom = 1;
  private dragged = false;
  private glide: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    private readonly coveredInsets: () => Insets = () => NO_INSETS,
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.center = new Phaser.Math.Vector2(worldWidth / 2, worldHeight / 2);
    this.updateZoomLimits();
    this.applyZoom(this.minZoom);

    scene.input.on('wheel', this.onWheel, this);
    scene.input.on('pointerdown', () => {
      this.dragged = false;
      this.stopGlide();
    });
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.scale.on('resize', this.updateZoomLimits, this);
  }

  /** True when the current pointer gesture was a pan, so slot clicks can be ignored. */
  get wasDragging(): boolean {
    return this.dragged;
  }

  /** Glides until the world point is inside the useful area, e.g. a slot opened behind the panel. */
  reveal(x: number, y: number): void {
    const area = this.usefulWorldArea();
    const marginX = (area.right - area.left) * REVEAL_MARGIN;
    const marginY = (area.bottom - area.top) * REVEAL_MARGIN;
    this.glideTo(
      this.center.x + revealShift(x, area.left, area.right, marginX),
      this.center.y + revealShift(y, area.top, area.bottom, marginY),
    );
  }

  /** Glides back inside the limits after what covers the canvas changed (a panel closed). */
  settle(): void {
    this.glideTo(this.center.x, this.center.y);
  }

  /** Fully zoomed out shows the whole map; recomputed when the window resizes. */
  private updateZoomLimits(): void {
    const fit = Math.min(
      this.camera.width / this.worldWidth,
      this.camera.height / this.worldHeight,
    );
    this.minZoom = fit;
    this.maxZoom = Math.max(fit, Math.min(fit * MAX_ZOOM_FACTOR, MAX_ABSOLUTE_ZOOM));
    this.applyZoom(Phaser.Math.Clamp(this.camera.zoom, this.minZoom, this.maxZoom));
  }

  private onWheel(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    this.stopGlide();
    const anchor = this.camera.getWorldPoint(pointer.x, pointer.y);
    const zoom = Phaser.Math.Clamp(
      this.camera.zoom * Math.exp(-dy * WHEEL_ZOOM_SPEED),
      this.minZoom,
      this.maxZoom,
    );
    // Keep the world point under the cursor fixed while zooming.
    this.center.set(
      anchor.x - (pointer.x - this.camera.width / 2) / zoom,
      anchor.y - (pointer.y - this.camera.height / 2) / zoom,
    );
    this.applyZoom(zoom);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown || !startedOnCanvas(pointer, this.scene.game.canvas)) return;
    if (!this.dragged && pointer.getDistance() < DRAG_THRESHOLD_PX) return;
    this.dragged = true;
    const zoom = this.camera.zoom;
    this.center.x -= (pointer.x - pointer.prevPosition.x) / zoom;
    this.center.y -= (pointer.y - pointer.prevPosition.y) / zoom;
    this.clampAndApply();
  }

  private applyZoom(zoom: number): void {
    this.camera.setZoom(zoom);
    this.clampAndApply();
  }

  private clampAndApply(): void {
    const clamped = this.clamped(this.center.x, this.center.y);
    this.center.set(clamped.x, clamped.y);
    this.camera.centerOn(clamped.x, clamped.y);
  }

  private clamped(x: number, y: number): { x: number; y: number } {
    const insets = this.coveredInsets();
    const zoom = this.camera.zoom;
    return {
      x: clampAxis(x, this.worldWidth, usefulOffset(insets.left, insets.right, zoom)),
      y: clampAxis(y, this.worldHeight, usefulOffset(insets.top, insets.bottom, zoom)),
    };
  }

  /** The world rectangle seen through the part of the canvas no panel covers. */
  private usefulWorldArea(): { left: number; right: number; top: number; bottom: number } {
    const insets = this.coveredInsets();
    const zoom = this.camera.zoom;
    const halfWidth = this.camera.width / 2 / zoom;
    const halfHeight = this.camera.height / 2 / zoom;
    return {
      left: this.center.x - halfWidth + insets.left / zoom,
      right: this.center.x + halfWidth - insets.right / zoom,
      top: this.center.y - halfHeight + insets.top / zoom,
      bottom: this.center.y + halfHeight - insets.bottom / zoom,
    };
  }

  private glideTo(x: number, y: number): void {
    this.stopGlide();
    const target = this.clamped(x, y);
    const from = { x: this.center.x, y: this.center.y };
    if (target.x === from.x && target.y === from.y) return;
    if (prefersReducedMotion()) {
      this.center.set(target.x, target.y);
      this.clampAndApply();
      return;
    }
    this.glide = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: GLIDE_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 1;
        this.center.set(
          from.x + (target.x - from.x) * progress,
          from.y + (target.y - from.y) * progress,
        );
        this.clampAndApply();
      },
      onComplete: () => (this.glide = null),
    });
  }

  private stopGlide(): void {
    this.glide?.stop();
    this.glide = null;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
