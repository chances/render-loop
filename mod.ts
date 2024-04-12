export abstract class RealTimeApp {
  /** Called at each iteration of the game loop. Used to update real-time application state. */
  abstract tick(tick: Tick): void;
  /** Called at intervals designated by this app's `RenderLoop`. Used to render the application's scene. */
  render(): void {}
}

/**
 * Manages an application's main render loop.
 * @see [Game Loop](http://gameprogrammingpatterns.com/game-loop.html) (Game Programming Patterns)
 * @remarks Adapted from the [`render_loop`](https://www.shardbox.org/shards/render_loop) Crystal library.
 */
export default class RenderLoop {
  private _frameTime: number;
  private _frames = 0;
  private _frameCounter = 0;
  private _isRunning = false;

  /** @param frameRate Deisred frame rate, in hertz. */
  constructor(frameRate: number, readonly app?: RealTimeApp) {
    this._frameTime = 1 / frameRate;
  }

  get isRunning() {
    return this._isRunning;
  }

  /** @returns The current measures frames per second, in hertz. */
  get fps() {
    return this._frames;
  }

  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    const startupTime = performance.now() / 1000;

    let lastTime = performance.now();
    let unprocessedTime = 0;

    const loop = () => {
      let shouldRender = false;
      const startTime = performance.now() / 1000;
      const passedTime = startTime - lastTime;
      lastTime = startTime;

      unprocessedTime += passedTime;
      this._frameCounter += passedTime;

      while (unprocessedTime > this._frameTime) {
        shouldRender = this._isRunning;
        unprocessedTime -= this._frameTime;
      }

      if (!shouldRender) /* Sleep for 1 millisecond. */ setTimeout(loop, 1);
      else {
        const tick = new Tick(this._frameTime, passedTime, startupTime);
        globalThis.dispatchEvent(
          new CustomEvent("tick", {
            cancelable: false,
            detail: tick,
          }),
        );

        this.app?.tick(tick);
        this.app?.render();

        // Calculate frame rate
        if (this._frameCounter >= 1) {
          this._frames = 0;
          this._frameCounter = 0;
        }
        this._frames += 1;
      }

      // Iterate the loop at the end of the current event loop iteration
      if (this._isRunning) queueMicrotask(loop);
    };

    // Start the loop
    queueMicrotask(loop);
  }

  stop() {
    this._isRunning = false;
  }
}

/**
 * Time information about the current tick.
 * @remarks Adapted from the [`render_loop`](https://www.shardbox.org/shards/render_loop) Crystal library.
 */
export class Tick {
  constructor(
    /** Desired time span to render a single frame, in seconds. */
    readonly desiredFrameTime: number,
    /** Measured time span of the last frame, i.e. the total time taken to render the last frame. */
    readonly frameTime: number,
    /** Time the render loop started, measured from Deno's start, in seconds. */
    readonly startupTime: number,
  ) {}

  /**
   * @returns Desired frame rate, in hertz.
   * @see `RenderLoop.fps` for the *actual* measured frame rate.
   */
  get desiredFrameRate() {
    return 1000 / (this.desiredFrameTime * 1000);
  }
}
