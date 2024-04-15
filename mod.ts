import { assert } from "jsr:@std/assert";
import * as async from "jsr:@std/async";

/// <reference path="./mod.d.ts" />
export interface Number extends globalThis.Number {
  /** @returns The unit of this number, or `Unit.unknown` if unset. */
  get unit(): Unit;
  set unit(value: Unit);

  /** @returns This number with the given `unit` assigned. */
  withUnit(unit: Unit): number;

  /** @section Unit Conversions */

  /** @returns The given `value` converted to milliseconds. */
  get ms(): number;
  /** @returns The given `value` converted to seconds. */
  get seconds(): number;
}
interface Performance extends globalThis.Performance {
  /** Returns a current time from Deno's start in seconds.
   *
   * Use the permission flag `--allow-hrtime` to return a precise value.
   *
   * @tags allow-hrtime
   */
  nowSeconds(): number;
}

// TODO: Abstract this into a Proxy
Object.defineProperty(Performance.prototype, "nowSeconds", {
  get(this: Performance) {
    const now = this.now() as unknown as Number;
    now.unit = Unit.milliseconds;
    return function () {
      return now.seconds;
    };
  },
});

// TODO: Extract these unit helpers into their own library
export const enum Unit {
  unknown,
  nanoseconds = "ns",
  milliseconds = "ms",
  seconds = "s",
}
// TODO: Extract these into Proxies
// TODO: Override `toString` to display units
const units = new Map<number, Unit>();
Object.defineProperty(Number.prototype, "unit", {
  get(this: number) {
    if (!units.has(this)) return Unit.unknown;
    return units.get(this);
  },
  set(this: number, value: Unit) {
    units.set(this, value);
  },
});
Object.defineProperty(Number.prototype, "withUnit", {
  get(this: Number) {
    return (unit: Unit) => {
      this.unit = unit;
      return this;
    };
  },
});
Object.defineProperty(Number.prototype, "ns", {
  get(this: number) {
    const unit = (this as unknown as Number).unit;
    if (unit === Unit.unknown) return (this as unknown as Number).withUnit(Unit.nanoseconds);
    if (unit === Unit.nanoseconds) return this;
    if (unit === Unit.milliseconds) return this * 1e+6;
    if (unit === Unit.seconds) return (this as unknown as Number).ms * 1e+6;
    throw new Error(`Unsupported unit: ${unit}`);
  },
});
Object.defineProperty(Number.prototype, "ms", {
  get(this: number) {
    const unit = (this as unknown as Number).unit;
    if (unit === Unit.unknown) return (this as unknown as Number).withUnit(Unit.milliseconds);
    if (unit === Unit.nanoseconds) return this / 1e+6;
    if (unit === Unit.milliseconds) return this;
    if (unit === Unit.seconds) return this * 1000;
    throw new Error(`Unsupported unit: ${unit}`);
  },
});
Object.defineProperty(Number.prototype, "seconds", {
  get(this: number) {
    const unit = (this as unknown as Number).unit;
    if (unit === Unit.unknown) return (this as unknown as Number).withUnit(Unit.seconds);
    if (unit === Unit.nanoseconds) return this / 1e+6;
    if (unit === Unit.milliseconds) return this / 1000;
    if (unit === Unit.seconds) return this;
    throw new Error(`Unsupported unit: ${unit}`);
  },
});

/** An application that renders scenes in real-time. */
export interface RealTimeApp {
  /** Called at each iteration of the game loop. Used to update real-time application state. */
  tick(tick: Tick): void;
  /** Called at intervals designated by this app's `RenderLoop`. Used to render the application's scene. */
  render?: () => void;
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
    this._frameTime = ((1 / frameRate) as unknown as Number).seconds;

    // Ensure this render loop is stopped when the app stops
    if (Deno.build.os !== "windows") Deno.addSignalListener("SIGTERM", this._stopIfRunning);
    Deno.addSignalListener("SIGINT", this._stopIfRunning);
  }

  /** @returns Whether this render loop is running. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Resolves when this render loop is stopped. */
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

  /** Start this render loop. */
  start(): RenderLoop {
    if (this._isRunning) return this;
    this._isRunning = true;
    this._finished = Promise.withResolvers();

    const startupTime = (performance as Performance).nowSeconds();
    let lastTime = startupTime;
    let unprocessedTime = (0 as unknown as Number).seconds;

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
      const startTime = (performance as Performance).nowSeconds();
      const passedTime = ((startTime - lastTime) as unknown as Number).withUnit(Unit.seconds);
      unprocessedTime += passedTime;
      this._frameCounter += passedTime;
      lastTime = startTime;

      while (unprocessedTime > this._frameTime) {
        shouldRender = this._isRunning;
        unprocessedTime -= this._frameTime;
      }

      // Delay the render loop for 1 millisecond and bail from this iteration
      if (!shouldRender) return async.delay(1).then(enqueueLoop);

      // Otherwise, tick the render loop
      const tick = new Tick(this._frameTime, passedTime, startupTime);
      globalThis.dispatchEvent(new CustomEvent("tick", { cancelable: false, detail: tick }));
      this.app?.tick(tick);
      if (typeof this.app?.render === "function") this.app?.render();

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

  /** Stop this render loop.
   * @returns A `Promise` that resolves when this render loop finishes.
   */
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
  ) {
    (this.desiredFrameTime as unknown as Number).unit = Unit.seconds;
    (this.frameTime as unknown as Number).unit = Unit.seconds;
    (this.startupTime as unknown as Number).unit = Unit.seconds;
  }

  /** @param desiredFrameTime Desired time span to render a single frame, in seconds. */
  static zero(desiredFrameTime: number): Tick {
    return new Tick(desiredFrameTime, 0, Number.NaN);
  }

  /**
   * @returns Desired frame rate, in hertz.
   * @see `RenderLoop.fps` for the *actual* measured frame rate.
   */
  get desiredFrameRate(): number {
    return 1000 / (this.desiredFrameTime * 1000);
  }
}
