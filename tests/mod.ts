import { assertEquals, assertGreater, assertInstanceOf } from "jsr:@std/assert";
import * as async from "jsr:@std/async";
import { spy } from "https://deno.land/x/mock@0.15.2/mod.ts";

import RenderLoop, { type Tick } from "../mod.ts";

Deno.test(async function isRunningTest() {
  const startedAt = performance.now() / 1000;
  const loop = new RenderLoop(60);

  assertEquals(loop.start().isRunning, true);
  await async.delay(100);
  assertGreater(loop.startupTime, startedAt, "The render loop's startup time is not advancing.");
  await loop.stop();
  assertEquals(loop.isRunning, false);
});

Deno.test(async function appTickHandler() {
  const tick = spy((tick: Tick) => {
    assertGreater(tick.frameTime, 0);
  });
  const loop = new RenderLoop(60, { tick });
  assertEquals(tick.calls.length, 0, "Tick handler has been called more than expected.");

  loop.start();
  await async.delay(100);
  await loop.stop();
  assertGreater(tick.calls.length, 2, "Tick handler has been called less than expected.");
});

Deno.test(async function tickEventListener() {
  const loop = new RenderLoop(60);
  const tick = spy((ev: Event) => {
    assertInstanceOf(ev, CustomEvent<Tick>);
    assertGreater(ev.detail.frameTime, 0);
  });
  globalThis.addEventListener("tick", tick);
  assertEquals(tick.calls.length, 0, "Tick handler has been called more than expected.");

  loop.start();
  await async.delay(100);
  await loop.stop();
  assertGreater(tick.calls.length, 2, "Tick handler has been called less than expected.");
});
