import test from "node:test";
import assert from "node:assert/strict";
import { FEATURES, PLOT_LAYOUT, WORLD_HALF_EXTENT, baseTerrainHeight, terrainHeight } from "../src/world-math.js";

test("terrain height is deterministic and rolls beyond the village core", () => {
  assert.equal(terrainHeight(37, -42), terrainHeight(37, -42));
  assert.notEqual(terrainHeight(0, 0), terrainHeight(53, -46));
  assert.ok(Math.abs(terrainHeight(53, -46) - baseTerrainHeight(53, -46)) < 1e-9);
  assert.equal(WORLD_HALF_EXTENT, 70);
});

test("interaction pads flatten smoothly without changing authored feature coordinates", () => {
  const centerHeight = terrainHeight(-19.8, -4.84);
  assert.ok(Math.abs(terrainHeight(-20, -4.9) - centerHeight) < 0.04);
  const plot = PLOT_LAYOUT[2];
  assert.ok(Math.abs(terrainHeight(plot[0], plot[1] + 0.2) - terrainHeight(plot[0], plot[1])) < 0.02);
  assert.deepEqual(FEATURES.slice(0, 3).map(({ id }) => id), ["mira", "asep", "warung"]);
  assert.ok(Math.abs(FEATURES.find(({ id }) => id === "mira").x + 15.84) < 1e-9);
});
