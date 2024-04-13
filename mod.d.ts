import type { Tick, Unit } from "./mod.ts";

declare global {
  interface WindowEventMap {
    "tick": CustomEvent<Tick>;
  }
}

declare global {
  interface Number {
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

  interface Performance {
    /** Returns a current time from Deno's start in seconds.
     *
     * Use the permission flag `--allow-hrtime` to return a precise value.
     *
     * @tags allow-hrtime
     */
    nowSeconds(): number;
  }
}
