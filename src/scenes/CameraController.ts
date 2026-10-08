import Phaser from 'phaser';

const DRAG_THRESHOLD_PX = 6;
const WHEEL_ZOOM_SPEED = 0.0015;
const MAX_ZOOM_FACTOR = 5;
const MAX_ABSOLUTE_ZOOM = 2;

/**
 * Wheel zoom (anchored at the cursor) and drag-to-pan, clamped to the map.
 * Phaser's built-in camera bounds pin a small world to the top-left instead
 * of centering it, so the clamping is done here by hand.
 */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private center: Phaser.Math.Vector2;
  private minZoom = 1;
  private maxZoom = 1;
  private dragged = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {
    this.camera = scene.cameras.main;
    this.center = new Phaser.Math.Vector2(worldWidth / 2, worldHeight / 2);
    this.updateZoomLimits();
    this.applyZoom(this.minZoom);

    scene.input.on('wheel', this.onWheel, this);
    scene.input.on('pointerdown', () => (this.dragged = false));
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.scale.on('resize', this.updateZoomLimits, this);
  }

  /** True when the current pointer gesture was a pan, so slot clicks can be ignored. */
  get wasDragging(): boolean {
    return this.dragged;
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
    // Dragging a slot in the editor must not pan the map as well.
    if (!pointer.isDown || this.scene.input.getDragState(pointer) > 0) return;
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
    this.center.x = clampAxis(this.center.x, this.camera.width / this.camera.zoom, this.worldWidth);
    this.center.y = clampAxis(
      this.center.y,
      this.camera.height / this.camera.zoom,
      this.worldHeight,
    );
    this.camera.centerOn(this.center.x, this.center.y);
  }
}

/** Centers the map on an axis where it is smaller than the view, otherwise keeps the view inside it. */
function clampAxis(center: number, viewSize: number, worldSize: number): number {
  if (viewSize >= worldSize) return worldSize / 2;
  return Phaser.Math.Clamp(center, viewSize / 2, worldSize - viewSize / 2);
}
