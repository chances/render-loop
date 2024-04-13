import { assertEquals } from "jsr:@std/assert";
import RenderLoop from "../mod.ts";

Deno.test(async function isRunningTest() {
  const loop = new RenderLoop(60);
  assertEquals(loop.start().isRunning, true);
  await loop.stop();
  assertEquals(loop.isRunning, false);
});
