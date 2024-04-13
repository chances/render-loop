import { assert } from "jsr:@std/assert";
import * as async from "jsr:@std/async";

export abstract class RealTimeApp {
  /** Called at each iteration of the game loop. Used to update real-time application state. */
  abstract tick(tick: Tick): void;
  /** Called at intervals designated by this app's `RenderLoop`. Used to render the application's scene. */
  render(): void {}
}

/**
 * Manages an application's main render loop.
 * 
 * A render loop is automatically stopped when the Deno process receives the
 * `SIGTERM` or `SIGINT` signal (@see `Deno.Signal`).
 * 
 * _Note_: On Windows only `"SIGINT"` (CTRL+C) is listened to.
 *
 * @see [Game Loop](http://gameprogrammingpatterns.com/game-loop.html) (Game Programming Patterns)
 * @remarks Adapted from the [`render_loop`](https://www.shardbox.org/shards/render_loop) Crystal library.
 */
export default class RenderLoop {
  private _frameTime: number;
  private _frames = 0;
  private _frameCounter = 0;
  private _isRunning = false;
  private _stopIfRunning = () => this._isRunning ? this.stop() : null;
  private _finished: PromiseWithResolvers<void> | null = null;

  /** @param frameRate Deisred frame rate, in hertz. */
  constructor(frameRate: number, readonly app?: RealTimeApp) {
    this._frameTime = 1 / frameRate;

    // Ensure this render loop is stopped when the app stops
    if (Deno.build.os !== "windows") Deno.addSignalListener("SIGTERM", this._stopIfRunning);
    Deno.addSignalListener("SIGINT", this._stopIfRunning);
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Resolves when this reder loop is stopped. */
  get finished(): Promise<void> {
    if (this._finished === null) {
      assert(this._isRunning === false);
      return Promise.resolve();
    }
    return this._finished.promise;
  }

  /** @returns The current measures frames per second, in hertz. */
  get fps(): number {
    return this._frames;
  }

  start(): RenderLoop {
    if (this._isRunning) return this;
    this._isRunning = true;
    this._finished = Promise.withResolvers();
    const startupTime = performance.now() / 1000;

    let lastTime = performance.now();
    let unprocessedTime = 0;

    /**
     * Iterate this render loop at the end of the current event loop iteration.
     * @returns A `Promise` that resolves when this render loop finishes.
     */
    const enqueueLoop = (): Promise<void> => {
      if (this._isRunning) queueMicrotask(loop);
      else this._finished?.resolve();

      return this.finished;
    };

    const loop = async (): Promise<void> => {
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

      // Delay the render loop for 1 millisecond
      if (!shouldRender) return async.delay(1).then(enqueueLoop);

      // Otherwise, tick the render loop
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

      await enqueueLoop();
    };

    // Start the loop
    enqueueLoop();

    return this;
  }

  /** @returns A `Promise` that resolves when this render loop finishes. */
  stop(): Promise<void> {
    if (Deno.build.os !== "windows") Deno.removeSignalListener("SIGTERM", this._stopIfRunning);
    Deno.removeSignalListener("SIGINT", this._stopIfRunning);

    this._isRunning = false;
    return this.finished;
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
  get desiredFrameRate(): number {
    return 1000 / (this.desiredFrameTime * 1000);
  }
}
