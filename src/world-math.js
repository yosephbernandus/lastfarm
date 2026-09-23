export const WORLD_HALF_EXTENT = 70;
export const PLAYER_SPAWN = Object.freeze({ x: 0, z: 17.6 });
const VILLAGE_SCALE = 2.2;

export const PLOT_LAYOUT = Object.freeze([
  Object.freeze([-5.8 * VILLAGE_SCALE, -4.2 * VILLAGE_SCALE]), Object.freeze([-3.5 * VILLAGE_SCALE, -4.2 * VILLAGE_SCALE]), Object.freeze([-1.2 * VILLAGE_SCALE, -4.2 * VILLAGE_SCALE]),
  Object.freeze([1.1 * VILLAGE_SCALE, -4.2 * VILLAGE_SCALE]), Object.freeze([3.4 * VILLAGE_SCALE, -4.2 * VILLAGE_SCALE]), Object.freeze([5.7 * VILLAGE_SCALE, -4.2 * VILLAGE_SCALE]),
]);

export const FEATURES = Object.freeze([
  Object.freeze({ id: "mira", kind: "npc", x: -7.2 * VILLAGE_SCALE, z: 0.25 * VILLAGE_SCALE, radius: 3.8 }),
  Object.freeze({ id: "asep", kind: "npc", x: 8.05 * VILLAGE_SCALE, z: -0.7 * VILLAGE_SCALE, radius: 3.8 }),
  Object.freeze({ id: "warung", kind: "warung", x: 9.1 * VILLAGE_SCALE, z: 1.7 * VILLAGE_SCALE, radius: 3.5 }),
  ...PLOT_LAYOUT.map(([x, z], index) => Object.freeze({ id: `plot-${index + 1}`, kind: "plot", x, z, radius: 2.8 })),
]);

const FLAT_PADS = [
  { x: -9 * VILLAGE_SCALE, z: -2.2 * VILLAGE_SCALE, radius: 6.2 },
  { x: 9.1 * VILLAGE_SCALE, z: 1.7 * VILLAGE_SCALE, radius: 6.2 },
  { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, radius: 3.2 },
  ...PLOT_LAYOUT.map(([x, z]) => ({ x, z, radius: 1.45 })),
];

const smoothstep = (value) => value * value * (3 - 2 * value);

export function baseTerrainHeight(x, z) {
  const center = 0.12 * Math.sin(x / 7) + 0.1 * Math.cos(z / 8);
  const rolling = 1.35 * Math.sin(x / 17) + 1.05 * Math.cos(z / 21) + 0.42 * Math.sin((x - z) / 9);
  const radius = Math.hypot(x, z);
  const rise = smoothstep(Math.max(0, Math.min(1, (radius - 9) / 22)));
  return center + rolling * rise;
}

export function terrainHeight(x, z) {
  let height = baseTerrainHeight(x, z);
  let strongestBlend = 0;
  let flatHeight = height;
  for (const pad of FLAT_PADS) {
    const distance = Math.hypot(x - pad.x, z - pad.z);
    const blend = 1 - smoothstep(Math.max(0, Math.min(1, (distance - pad.radius) / 4.5)));
    if (blend > strongestBlend) {
      strongestBlend = blend;
      flatHeight = baseTerrainHeight(pad.x, pad.z);
    }
  }
  height = height * (1 - strongestBlend) + flatHeight * strongestBlend;
  return height;
}
