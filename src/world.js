import {
  ArcRotateCamera,
  Color3,
  Color4,
  Curve3,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Mesh,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { FEATURES, PLOT_LAYOUT, WORLD_HALF_EXTENT, terrainHeight } from "./world-math.js";

const VILLAGE_TREES = [
  [-28, -24, 4.2, 1], [-33, -12, 3.7, 2], [-29, 4, 4.5, 0], [-34, 20, 4, 1],
  [28, -25, 4.4, 0], [34, -12, 3.6, 2], [30, 1, 4.1, 1], [35, 18, 4.6, 0],
  [-45, -45, 4.8, 0], [-53, -30, 4.2, 1], [-48, -8, 4.7, 2], [-54, 13, 4.1, 0], [-40, 49, 4.4, 1],
  [45, -46, 4.3, 2], [53, -29, 4.9, 0], [47, -6, 4.3, 1], [55, 14, 4.7, 2], [40, 49, 4.1, 0],
  [-13, -30, 2.8, 1], [13, -31, 3.2, 2], [-19, 39, 3.4, 0], [17, 40, 3.1, 1],
  [-61, -53, 5.2, 0], [-55, -58, 4.5, 2], [-38, -62, 4.8, 1], [-23, -61, 4.1, 0],
  [61, -53, 4.8, 1], [55, -58, 5.2, 0], [38, -62, 4.1, 2], [23, -61, 4.7, 1],
  [-61, 43, 5.1, 2], [-49, 53, 4.6, 0], [-34, 61, 4.2, 1], [-17, 62, 4.9, 2],
  [61, 43, 4.8, 0], [49, 53, 4.5, 1], [34, 61, 5, 2], [17, 62, 4.3, 0],
];

function c(hex) { return Color3.FromHexString(hex); }

function makeMaterial(scene, name, hex, { emissive = null, unlit = false, vertexColors = false, twoSided = false } = {}) {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = c(hex);
  result.specularColor = new Color3(0.035, 0.035, 0.035);
  result.roughness = 1;
  result.disableLighting = unlit;
  result.vertexColorEnabled = vertexColors;
  result.backFaceCulling = !twoSided;
  if (emissive) result.emissiveColor = c(emissive);
  return result;
}

function setShadow(mesh, shadowGenerator, { receive = true } = {}) {
  mesh.isPickable = false;
  if (receive) mesh.receiveShadows = true;
  shadowGenerator.addShadowCaster(mesh, true);
  return mesh;
}

function box(scene, name, parent, position, size, mat, shadowGenerator = null, rotation = null) {
  const mesh = MeshBuilder.CreateBox(name, size, scene);
  mesh.position.copyFrom(position);
  mesh.material = mat;
  if (rotation) mesh.rotation.copyFrom(rotation);
  if (parent) mesh.parent = parent;
  if (shadowGenerator) setShadow(mesh, shadowGenerator);
  else mesh.isPickable = false;
  return mesh;
}

function cylinder(scene, name, parent, position, height, top, bottom, mat, segments = 8, shadowGenerator = null) {
  const mesh = MeshBuilder.CreateCylinder(name, {
    height, diameterTop: top, diameterBottom: bottom, tessellation: segments,
  }, scene);
  mesh.position.copyFrom(position);
  mesh.material = mat;
  if (parent) mesh.parent = parent;
  if (shadowGenerator) setShadow(mesh, shadowGenerator);
  else mesh.isPickable = false;
  return mesh;
}

function sphere(scene, name, parent, position, diameter, mat, segments = 8, shadowGenerator = null) {
  const mesh = MeshBuilder.CreateSphere(name, { diameter, segments, slice: 1 }, scene);
  mesh.position.copyFrom(position);
  mesh.material = mat;
  if (parent) mesh.parent = parent;
  if (shadowGenerator) setShadow(mesh, shadowGenerator);
  else mesh.isPickable = false;
  return mesh;
}

function createSky(scene) {
  const sky = MeshBuilder.CreateSphere("soft-gradient-sky", { diameter: 360, segments: 48 }, scene);
  const positions = sky.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const lower = c("#d8c9a3");
  const middle = c("#91bed0");
  const upper = c("#5d879f");
  for (let i = 0; i < positions.length; i += 3) {
    const y = Math.max(0, Math.min(1, (positions[i + 1] / 180 + 0.1) / 1.1));
    const blend = y < 0.48 ? Color3.Lerp(lower, middle, y / 0.48) : Color3.Lerp(middle, upper, (y - 0.48) / 0.52);
    const index = (i / 3) * 4;
    colors[index] = blend.r;
    colors[index + 1] = blend.g;
    colors[index + 2] = blend.b;
    colors[index + 3] = 1;
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors, true, 4);
  sky.material = makeMaterial(scene, "sky-gradient", "#ffffff", { unlit: true, vertexColors: true, twoSided: true });
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.material.disableDepthWrite = true;
  return sky;
}

function createTerrain(scene, materials) {
  const ground = MeshBuilder.CreateGround("rolling-foothill-terrain", {
    width: WORLD_HALF_EXTENT * 2,
    height: WORLD_HALF_EXTENT * 2,
    subdivisions: 64,
    updatable: true,
  }, scene);
  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    const y = terrainHeight(x, z);
    positions[i + 1] = y;
    const variation = Math.sin(x * 0.11 + z * 0.07) * 0.045 + Math.cos(z * 0.13 - x * 0.03) * 0.03;
    const edge = Math.min(1, Math.hypot(x, z) / 85);
    const shade = Math.max(-0.08, Math.min(0.1, variation + edge * 0.025));
    const index = (i / 3) * 4;
    colors[index] = Math.max(0, 0.45 + shade);
    colors[index + 1] = Math.max(0, 0.58 + shade);
    colors[index + 2] = Math.max(0, 0.34 + shade * 0.72);
    colors[index + 3] = 1;
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, positions);
  const normals = [];
  VertexData.ComputeNormals(positions, ground.getIndices(), normals);
  ground.updateVerticesData(VertexBuffer.NormalKind, normals);
  ground.setVerticesData(VertexBuffer.ColorKind, colors, true, 4);
  ground.material = materials.grass;
  ground.receiveShadows = true;
  ground.isPickable = false;
  return ground;
}

function createPath(scene, name, waypoints, width, mat) {
  const points = waypoints.map(([x, z]) => new Vector3(x, terrainHeight(x, z) + 0.04, z));
  const curve = Curve3.CreateCatmullRomSpline(points, 24, false).getPoints();
  const left = [];
  const right = [];
  curve.forEach((point, index) => {
    const previous = curve[Math.max(0, index - 1)];
    const next = curve[Math.min(curve.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const ox = (dz / length) * width * 0.5;
    const oz = (-dx / length) * width * 0.5;
    const lx = point.x + ox;
    const lz = point.z + oz;
    const rx = point.x - ox;
    const rz = point.z - oz;
    left.push(new Vector3(lx, terrainHeight(lx, lz) + 0.035, lz));
    right.push(new Vector3(rx, terrainHeight(rx, rz) + 0.035, rz));
  });
  const ribbon = MeshBuilder.CreateRibbon(name, { pathArray: [left, right], sideOrientation: Mesh.DOUBLESIDE }, scene);
  ribbon.material = mat;
  ribbon.isPickable = false;
  ribbon.receiveShadows = true;
  return ribbon;
}

function createBuilding(scene, id, x, z, kind, scale, materials, shadowGenerator) {
  const root = new TransformNode(`${id}-building-root`, scene);
  root.position.set(x, terrainHeight(x, z), z);
  root.rotation.y = ((Math.abs(x) + Math.abs(z)) % 5) * 0.035;
  const h = (name, position, size, mat = materials.wall, rotation = null) => box(scene, `${id}-${name}`, root, position, size, mat, shadowGenerator, rotation);
  const p = (name, position, height, top, bottom, mat = materials.wood, segments = 8) => cylinder(scene, `${id}-${name}`, root, position, height, top, bottom, mat, segments, shadowGenerator);
  const s = (name, position, diameter, mat = materials.warm) => sphere(scene, `${id}-${name}`, root, position, diameter, mat, 7, shadowGenerator);

  const width = (kind === "warung" ? 5.5 : 4.6) * scale;
  const depth = (kind === "warung" ? 4.3 : 4.0) * scale;
  h("plaster", new Vector3(0, 1.3 * scale, 0), { width: width * 0.82, height: 2.6 * scale, depth: depth * 0.82 });
  h("front-door-recess", new Vector3(width * 0.15, 0.95 * scale, depth * 0.42), { width: 0.95 * scale, height: 1.9 * scale, depth: 0.12 }, materials.darkWood);
  h("door-inset", new Vector3(width * 0.15, 0.94 * scale, depth * 0.445), { width: 0.72 * scale, height: 1.64 * scale, depth: 0.035 }, materials.wood);
  h("window-left-frame", new Vector3(-width * 0.24, 1.48 * scale, depth * 0.42), { width: 0.92 * scale, height: 0.82 * scale, depth: 0.12 }, materials.wood);
  h("window-left-glow", new Vector3(-width * 0.24, 1.48 * scale, depth * 0.45), { width: 0.68 * scale, height: 0.58 * scale, depth: 0.06 }, materials.lantern);
  h("window-right-frame", new Vector3(width * 0.37, 1.48 * scale, depth * 0.42), { width: 0.82 * scale, height: 0.74 * scale, depth: 0.12 }, materials.wood);
  h("window-right-glow", new Vector3(width * 0.37, 1.48 * scale, depth * 0.45), { width: 0.58 * scale, height: 0.5 * scale, depth: 0.06 }, materials.lantern);
  h("gable-front", new Vector3(0, 2.78 * scale, depth * 0.16), { width: width * 0.8, height: 1.25 * scale, depth: 0.23 * scale }, materials.plaster);
  const roofLeft = h("roof-left", new Vector3(-width * 0.25, 3.05 * scale, 0), { width: width * 0.58, height: 0.23 * scale, depth: depth * 1.15 }, materials.roof);
  roofLeft.rotation.z = -0.55;
  const roofRight = h("roof-right", new Vector3(width * 0.25, 3.05 * scale, 0), { width: width * 0.58, height: 0.23 * scale, depth: depth * 1.15 }, materials.roof);
  roofRight.rotation.z = 0.55;
  h("ridge-cap", new Vector3(0, 3.76 * scale, 0), { width: 0.25 * scale, height: 0.22 * scale, depth: depth * 1.19 }, materials.roof);
  h("porch-floor", new Vector3(0, 0.16 * scale, depth * 0.65), { width: width * 1.18, height: 0.24 * scale, depth: 1.42 * scale }, materials.wood);
  [-0.46, 0.46].forEach((offset, index) => {
    p(`porch-post-${index}`, new Vector3(offset * width, 1.08 * scale, depth * 0.91), 2.0 * scale, 0.16 * scale, 0.18 * scale, materials.wood, 6);
  });
  h("porch-beam", new Vector3(0, 2.02 * scale, depth * 0.91), { width: width * 1.08, height: 0.15 * scale, depth: 0.17 * scale }, materials.wood);
  if (kind === "warung") {
    h("counter", new Vector3(0, 0.86 * scale, depth * 0.67), { width: width * 0.8, height: 0.82 * scale, depth: 0.56 * scale }, materials.darkWood);
    h("counter-top", new Vector3(0, 1.3 * scale, depth * 0.67), { width: width * 0.92, height: 0.13 * scale, depth: 0.73 * scale }, materials.roof);
    h("awning", new Vector3(0, 2.18 * scale, depth * 0.98), { width: width * 1.12, height: 0.23 * scale, depth: 1.05 * scale }, materials.rust);
    h("signboard", new Vector3(0, 2.55 * scale, depth * 0.57), { width: 2.65 * scale, height: 0.55 * scale, depth: 0.14 * scale }, materials.darkWood);
    s("kettle-light", new Vector3(0, 1.8 * scale, depth * 0.71), 0.25 * scale, materials.lanternGlow);
  } else if (kind === "greenhouse") {
    // Deliberately incomplete roof: gameplay, not a fake repaired visual, advances this landmark.
    const brokenBeam = h("broken-greenhouse-beam", new Vector3(0.95 * scale, 2.85 * scale, 0), { width: 2.15 * scale, height: 0.14 * scale, depth: 0.14 * scale }, materials.wood);
    brokenBeam.rotation.z = -0.28;
    h("missing-roof-gap", new Vector3(-0.6 * scale, 3 * scale, 0), { width: 1.8 * scale, height: 0.04 * scale, depth: depth * 0.78 }, materials.skyTint);
  }
  root.getChildMeshes().forEach((mesh) => { mesh.isPickable = false; });
  root.getChildMeshes().forEach((mesh) => { mesh.receiveShadows = false; });
  return { root, radius: Math.max(width, depth) * 0.52 };
}

function makeLimb(scene, name, parent, x, y, length, radius, mat, shadowGenerator) {
  const pivot = new TransformNode(`${name}-pivot`, scene);
  pivot.parent = parent;
  pivot.position.set(x, y, 0);
  cylinder(scene, `${name}-shape`, pivot, new Vector3(0, -length / 2, 0), length, radius * 0.78, radius, mat, 8, shadowGenerator);
  return pivot;
}

function createPerson(scene, id, position, palette, materials, shadowGenerator, scale = 1) {
  const root = new TransformNode(`${id}-person`, scene);
  root.position.set(position.x, terrainHeight(position.x, position.z), position.z);
  root.rotation.y = Math.PI;
  const partScale = scale;
  const torso = cylinder(scene, `${id}-tapered-torso`, root, new Vector3(0, 1.08 * partScale, 0), 0.72 * partScale, 0.38 * partScale, 0.58 * partScale, palette.shirt, 9, shadowGenerator);
  torso.scaling.z = 0.68;
  cylinder(scene, `${id}-neck`, root, new Vector3(0, 1.52 * partScale, 0), 0.18 * partScale, 0.17 * partScale, 0.2 * partScale, palette.skin, 7, shadowGenerator);
  sphere(scene, `${id}-head`, root, new Vector3(0, 1.72 * partScale, 0), 0.44 * partScale, palette.skin, 10, shadowGenerator).scaling.y = 1.1;
  sphere(scene, `${id}-hair-cap`, root, new Vector3(0, 1.86 * partScale, -0.035 * partScale), 0.45 * partScale, palette.hair, 9, shadowGenerator).scaling.y = 0.72;
  sphere(scene, `${id}-hair-back`, root, new Vector3(0, 1.63 * partScale, -0.16 * partScale), 0.35 * partScale, palette.hair, 8, shadowGenerator).scaling.z = 0.72;
  sphere(scene, `${id}-eye-left`, root, new Vector3(-0.085 * partScale, 1.73 * partScale, 0.205 * partScale), 0.045 * partScale, materials.eye, 6);
  sphere(scene, `${id}-eye-right`, root, new Vector3(0.085 * partScale, 1.73 * partScale, 0.205 * partScale), 0.045 * partScale, materials.eye, 6);
  sphere(scene, `${id}-nose`, root, new Vector3(0, 1.67 * partScale, 0.215 * partScale), 0.055 * partScale, palette.skin, 6);
  const armLeft = makeLimb(scene, `${id}-arm-left`, root, -0.36 * partScale, 1.36 * partScale, 0.68 * partScale, 0.18 * partScale, palette.shirt, shadowGenerator);
  const armRight = makeLimb(scene, `${id}-arm-right`, root, 0.36 * partScale, 1.36 * partScale, 0.68 * partScale, 0.18 * partScale, palette.shirt, shadowGenerator);
  sphere(scene, `${id}-hand-left`, armLeft, new Vector3(0, -0.38 * partScale, 0), 0.16 * partScale, palette.skin, 7, shadowGenerator);
  sphere(scene, `${id}-hand-right`, armRight, new Vector3(0, -0.38 * partScale, 0), 0.16 * partScale, palette.skin, 7, shadowGenerator);
  const legLeft = makeLimb(scene, `${id}-leg-left`, root, -0.15 * partScale, 0.75 * partScale, 0.48 * partScale, 0.17 * partScale, palette.trousers, shadowGenerator);
  const legRight = makeLimb(scene, `${id}-leg-right`, root, 0.15 * partScale, 0.75 * partScale, 0.48 * partScale, 0.17 * partScale, palette.trousers, shadowGenerator);
  box(scene, `${id}-shoe-left`, legLeft, new Vector3(0, -0.46 * partScale, 0.08 * partScale), { width: 0.27 * partScale, height: 0.14 * partScale, depth: 0.38 * partScale }, palette.shoes, shadowGenerator);
  box(scene, `${id}-shoe-right`, legRight, new Vector3(0, -0.46 * partScale, 0.08 * partScale), { width: 0.27 * partScale, height: 0.14 * partScale, depth: 0.38 * partScale }, palette.shoes, shadowGenerator);
  root.getChildMeshes().forEach((mesh) => { mesh.isPickable = false; });
  let phase = 0;
  return {
    root,
    update(delta, moving) {
      if (moving) phase += delta * (Math.PI * 2 / 0.6);
      const swing = moving ? Math.sin(phase) * 0.4 : Math.sin(performance.now() / 750) * 0.025;
      legLeft.rotation.x = swing;
      legRight.rotation.x = -swing;
      armLeft.rotation.x = -swing * 0.8;
      armRight.rotation.x = swing * 0.8;
      const baseY = terrainHeight(root.position.x, root.position.z);
      root.position.y = baseY + (moving ? Math.max(0, Math.sin(phase * 2)) * 0.045 : Math.sin(performance.now() / 520) * 0.008);
      torso.scaling.y = 1 + (moving ? 0 : Math.sin(performance.now() / 950) * 0.012);
    },
  };
}

function createTrees(scene, materials, shadowGenerator) {
  const prototypes = [
    [
      { name: "broad-trunk", centerY: 1.45, height: 2.9, top: 0.34, bottom: 0.52, mat: materials.bark },
      { name: "broad-crown-low", shape: "sphere", centerY: 3.35, height: 3.1, diameter: 3.5, mat: materials.leaf },
      { name: "broad-crown-high", shape: "sphere", centerY: 4.9, height: 2.5, diameter: 2.65, mat: materials.leafLight },
    ],
    [
      { name: "bamboo-trunk", centerY: 1.65, height: 3.3, top: 0.22, bottom: 0.31, mat: materials.barkLight },
      { name: "bamboo-canopy-low", shape: "sphere", centerY: 3.25, height: 2.2, diameter: 2.5, mat: materials.bamboo },
      { name: "bamboo-canopy-high", shape: "sphere", centerY: 4.7, height: 1.7, diameter: 1.8, mat: materials.leafLight },
    ],
    [
      { name: "fruit-trunk", centerY: 1.3, height: 2.6, top: 0.28, bottom: 0.4, mat: materials.bark },
      { name: "fruit-crown-low", shape: "sphere", centerY: 2.9, height: 2.6, diameter: 3.25, mat: materials.leafLight },
      { name: "fruit-crown-high", shape: "sphere", centerY: 4.15, height: 2.1, diameter: 2.55, mat: materials.leaf },
    ],
  ];
  const sources = prototypes.map((prototype, kind) => prototype.map((part) => {
    const source = part.shape === "sphere"
      ? MeshBuilder.CreateSphere(`tree-source-${kind}-${part.name}`, { diameter: part.diameter, segments: 9 }, scene)
      : MeshBuilder.CreateCylinder(`tree-source-${kind}-${part.name}`, {
        height: part.height, diameterTop: part.top, diameterBottom: part.bottom, tessellation: 7,
      }, scene);
    source.position.set(200, -120, 200);
    source.rotation.y = kind * 0.4;
    source.material = part.mat;
    source.isPickable = false;
    return { source, part };
  }));
  const obstacles = [];
  VILLAGE_TREES.forEach(([x, z, size, kind], index) => {
    const baseY = terrainHeight(x, z);
    const spread = (index % 4) * 0.12;
    for (const { source, part } of sources[kind]) {
      const instance = source.createInstance(`village-tree-${index}-${part.name}`);
      const scale = size / 3.7 + spread;
      instance.position.set(x, baseY + part.centerY * scale, z);
      instance.scaling.setAll(scale);
      if (part.shape === "sphere" && kind === 1) instance.scaling.y *= 0.46;
      instance.isPickable = false;
      instance.receiveShadows = true;
      shadowGenerator.addShadowCaster(instance, true);
    }
    obstacles.push({ x, z, r: Math.min(1.5, size * 0.27) });
  });
  return obstacles;
}

function createPlots(scene, materials, shadowGenerator) {
  const visuals = new Map();
  PLOT_LAYOUT.forEach(([x, z], index) => {
    const id = `plot-${index + 1}`;
    const root = new TransformNode(`${id}-root`, scene);
    root.position.set(x, terrainHeight(x, z), z);
    const bed = box(scene, `${id}-bed`, root, new Vector3(0, 0.13, 0), { width: 2.15, height: 0.24, depth: 1.75 }, materials.soil, shadowGenerator);
    const rimNorth = box(scene, `${id}-rim-north`, root, new Vector3(0, 0.24, -0.9), { width: 2.25, height: 0.16, depth: 0.12 }, materials.wood, shadowGenerator);
    const rimSouth = box(scene, `${id}-rim-south`, root, new Vector3(0, 0.24, 0.9), { width: 2.25, height: 0.16, depth: 0.12 }, materials.wood, shadowGenerator);
    box(scene, `${id}-rim-west`, root, new Vector3(-1.06, 0.24, 0), { width: 0.12, height: 0.16, depth: 1.7 }, materials.wood, shadowGenerator);
    box(scene, `${id}-rim-east`, root, new Vector3(1.06, 0.24, 0), { width: 0.12, height: 0.16, depth: 1.7 }, materials.wood, shadowGenerator);
    const cropMeshes = [];
    for (let plant = 0; plant < 3; plant += 1) {
      const offset = (plant - 1) * 0.55;
      cropMeshes.push(cylinder(scene, `${id}-crop-stem-${plant}`, root, new Vector3(offset, 0.49, 0), 0.52, 0.1, 0.13, materials.leaf, 6, shadowGenerator));
      cropMeshes.push(sphere(scene, `${id}-crop-leaf-${plant}`, root, new Vector3(offset - 0.14, 0.56, 0), 0.27, materials.leafLight, 6, shadowGenerator));
      cropMeshes.push(sphere(scene, `${id}-crop-fruit-${plant}`, root, new Vector3(offset, 0.71, 0.06), 0.19, materials.crop, 6, shadowGenerator));
    }
    cropMeshes.forEach((mesh) => mesh.setEnabled(false));
    visuals.set(id, { bed, cropMeshes, rims: [rimNorth, rimSouth] });
  });
  return visuals;
}

function createHorizon(scene, materials, shadowGenerator) {
  const ridgeSpecs = [
    { x: -41, z: -87, height: 35, diameter: 65, mat: materials.hill },
    { x: -20, z: -101, height: 42, diameter: 78, mat: materials.hillShade },
    { x: 4, z: -99, height: 50, diameter: 84, mat: materials.volcano },
    { x: 30, z: -93, height: 39, diameter: 74, mat: materials.hill },
    { x: 51, z: -79, height: 30, diameter: 60, mat: materials.hillShade },
  ];
  ridgeSpecs.forEach((ridge, index) => {
    const y = terrainHeight(ridge.x, ridge.z) + ridge.height / 2 - 4;
    const cone = MeshBuilder.CreateCylinder(`distant-foothill-${index}`, {
      height: ridge.height,
      diameterTop: ridge.diameter * 0.06,
      diameterBottom: ridge.diameter,
      tessellation: 9,
    }, scene);
    cone.position.set(ridge.x, y, ridge.z);
    cone.material = ridge.mat;
    cone.isPickable = false;
    cone.receiveShadows = true;
    shadowGenerator.addShadowCaster(cone, true);
    if (index === 2) {
      const crater = MeshBuilder.CreateCylinder("volcano-crater-rim", { height: 1.8, diameterTop: 11.5, diameterBottom: 13, tessellation: 9 }, scene);
      crater.position.set(ridge.x, y + ridge.height * 0.47, ridge.z);
      crater.material = materials.crater;
      crater.isPickable = false;
    }
  });
}

export function createWorld(canvas, initialState) {
  let engine;
  try {
    const mobile = window.matchMedia?.("(max-width: 700px)").matches ?? false;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, premultipliedAlpha: false }, false);
    engine.setHardwareScalingLevel(1 / dpr);
  } catch (cause) {
    if (/webgl|context|support/i.test(cause?.message || "")) {
      const error = new Error("WebGL is unavailable in this browser. Try a recent browser with hardware acceleration enabled.");
      error.code = "WEBGL_UNSUPPORTED";
      throw error;
    }
    throw cause;
  }

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.73, 0.8, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 65;
  scene.fogEnd = 150;
  scene.fogColor = c("#b5c9c4");
  scene.collisionsEnabled = false;
  const camera = new ArcRotateCamera("low-follow-camera", Math.PI / 2, 1.22, 7.5, new Vector3(0, 1.35, 5.5), scene);
  camera.fov = (55 * Math.PI) / 180;
  camera.minZ = 0.15;
  camera.maxZ = 180;
  camera.lowerRadiusLimit = 6.5;
  camera.upperRadiusLimit = 10;
  camera.lowerBetaLimit = 0.96;
  camera.upperBetaLimit = 1.43;
  camera.wheelPrecision = 55;
  camera.panningSensibility = 0;
  camera.inertia = 0.82;
  camera.attachControl(canvas, true);

  const sky = createSky(scene);
  const ambient = new HemisphericLight("cool-sky-fill", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.55;
  ambient.diffuse = c("#c0d3d9");
  ambient.groundColor = c("#516248");
  const sun = new DirectionalLight("warm-late-sun", new Vector3(-0.42, -1, 0.34), scene);
  sun.position.set(-34, 46, 28);
  sun.intensity = 1.08;
  const shadowGenerator = new ShadowGenerator(window.matchMedia?.("(max-width: 700px)").matches ? 1024 : 2048, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGenerator.bias = 0.0005;
  shadowGenerator.normalBias = 0.025;

  const materials = {
    grass: makeMaterial(scene, "grass-vertex-matte", "#729553", { vertexColors: true }),
    soil: makeMaterial(scene, "garden-earth", "#8f6847"),
    wood: makeMaterial(scene, "weathered-timber", "#72533d"),
    darkWood: makeMaterial(scene, "deep-timber", "#493c31"),
    plaster: makeMaterial(scene, "warm-plaster", "#e2d4b5"),
    wall: makeMaterial(scene, "washed-plaster", "#e2d4b5"),
    roof: makeMaterial(scene, "terracotta", "#b86f50"),
    rust: makeMaterial(scene, "awning-rust", "#bf7453"),
    lantern: makeMaterial(scene, "window-glass", "#d89a52", { emissive: "#7d4e22" }),
    lanternGlow: makeMaterial(scene, "lantern-glow", "#f4c978", { emissive: "#e59d38" }),
    skyTint: makeMaterial(scene, "open-roof-sky", "#92b9c5"),
    leaf: makeMaterial(scene, "leaf-deep", "#477247"),
    leafLight: makeMaterial(scene, "leaf-light", "#66854a"),
    bamboo: makeMaterial(scene, "bamboo-green", "#7c9253"),
    bark: makeMaterial(scene, "bark-warm", "#71513a"),
    barkLight: makeMaterial(scene, "bark-bamboo", "#8e8154"),
    path: makeMaterial(scene, "curved-packed-earth", "#ad8b62"),
    crop: makeMaterial(scene, "harvest-gold", "#dca457"),
    hill: makeMaterial(scene, "ridge-green", "#77886a"),
    hillShade: makeMaterial(scene, "ridge-shadow", "#5d7162"),
    volcano: makeMaterial(scene, "volcanic-slope", "#586c66"),
    crater: makeMaterial(scene, "volcano-crater", "#414d4a"),
    skin: makeMaterial(scene, "skin", "#c99576"),
    shirt: makeMaterial(scene, "shirt", "#567475"),
    trousers: makeMaterial(scene, "trousers", "#47544e"),
    hair: makeMaterial(scene, "hair", "#39322d"),
    shoes: makeMaterial(scene, "shoes", "#4b3c32"),
    eye: makeMaterial(scene, "eyes", "#302824"),
  };

  createTerrain(scene, materials);
  createPath(scene, "main-curving-footpath", [[0, 67], [1, 48], [-2, 32], [1, 23], [0, 17], [-2, 10], [-5, 5], [-11, 1], [-18, -1]], 3.1, materials.path);
  createPath(scene, "garden-path", [[0, 17], [-1, 5], [0, -7], [0, -18]], 2.1, materials.path);
  createPath(scene, "garden-row-path", [[-19, -14], [-10, -14], [0, -14], [11, -14], [19, -14]], 2.2, materials.path);
  createPath(scene, "warung-branch", [[-1, 15], [5, 11], [12, 8], [19, 5]], 2.2, materials.path);
  createPath(scene, "west-house-branch", [[-3, 15], [-9, 10], [-15, 4], [-20, -3]], 2.0, materials.path);
  createPath(scene, "east-house-branch", [[3, 14], [11, 19], [19, 23], [25, 30]], 2.0, materials.path);
  createPath(scene, "greenhouse-path", [[0, -17], [1, -27], [-2, -37], [0, -47]], 2.6, materials.path);

  createHorizon(scene, materials, shadowGenerator);
  const buildingSpecs = [
    ["farmhouse", -19.8, -4.84, "house", 1.02],
    ["warung", 20.02, 3.74, "warung", 0.98],
    ["village-home-west", -40, -31, "house", 0.78],
    ["village-home-east", 40, -31, "house", 0.82],
    ["village-home-northwest", -48, 30, "house", 0.75],
    ["village-home-northeast", 48, 30, "house", 0.8],
    ["old-greenhouse", 0, -48, "greenhouse", 0.94],
  ];
  const buildings = buildingSpecs.map(([id, x, z, kind, scale]) => createBuilding(scene, id, x, z, kind, scale, materials, shadowGenerator));

  // Short bamboo fences give yards edges while leaving the through-path open.
  const fenceRuns = [
    { x: -27, z: -12, count: 10, dx: 0.68, dz: 0 },
    { x: -30, z: -9, count: 4, dx: 0, dz: 0.72 },
    { x: 24, z: 12, count: 10, dx: 0.68, dz: 0 },
    { x: 23, z: 9, count: 4, dx: 0, dz: 0.72 },
    { x: -46, z: -35, count: 12, dx: 0.72, dz: 0 },
    { x: 43, z: -35, count: 12, dx: 0.72, dz: 0 },
  ];
  fenceRuns.forEach((run, lineIndex) => {
    for (let index = 0; index < run.count; index += 1) {
      const x = run.x + run.dx * index;
      const z = run.z + run.dz * index;
      const y = terrainHeight(x, z);
      cylinder(scene, `bamboo-fence-${lineIndex}-${index}`, null, new Vector3(x, y + 0.48, z), 0.96, 0.07, 0.09, materials.bamboo, 5, shadowGenerator);
    }
  });

  const plots = createPlots(scene, materials, shadowGenerator);
  const people = {
    mira: createPerson(scene, "mira", FEATURES.find((feature) => feature.id === "mira"), { skin: makeMaterial(scene, "mira-skin", "#c58c70"), shirt: makeMaterial(scene, "mira-indigo", "#7c8870"), trousers: materials.trousers, hair: materials.hair, shoes: materials.shoes }, materials, shadowGenerator, 0.96),
    asep: createPerson(scene, "asep", FEATURES.find((feature) => feature.id === "asep"), { skin: makeMaterial(scene, "asep-skin", "#bc896d"), shirt: makeMaterial(scene, "asep-umber-shirt", "#aa7653"), trousers: materials.trousers, hair: materials.hair, shoes: materials.shoes }, materials, shadowGenerator, 0.96),
    player: createPerson(scene, "player", { x: initialState.player.x, z: initialState.player.z }, materials, materials, shadowGenerator, 1),
  };
  const treeObstacles = createTrees(scene, materials, shadowGenerator);

  const buildingObstacles = buildings.map((building) => ({ x: building.root.position.x, z: building.root.position.z, r: Math.max(1.7, building.radius * 0.7) }));
  const obstacles = [
    ...buildingObstacles,
    ...treeObstacles,
  ];
  function collisionFree(x, z) {
    if (x < -WORLD_HALF_EXTENT + 2 || x > WORLD_HALF_EXTENT - 2 || z < -WORLD_HALF_EXTENT + 2 || z > WORLD_HALF_EXTENT - 2) return false;
    return !obstacles.some((obstacle) => {
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      return dx * dx + dz * dz < obstacle.r * obstacle.r;
    });
  }

  function applyPlotState(gameState) {
    gameState.plots.forEach((plot) => {
      const visual = plots.get(plot.id);
      if (!visual) return;
      const visible = plot.stage !== "empty";
      visual.cropMeshes.forEach((mesh) => mesh.setEnabled(visible));
      visual.bed.material = plot.stage === "ready" ? materials.leafLight : materials.soil;
      visual.rims.forEach((mesh) => { mesh.material = plot.stage === "ready" ? materials.wood : materials.wood; });
    });
  }
  applyPlotState(initialState);

  const featurePositions = new Map(FEATURES.map((feature) => [feature.id, new Vector3(feature.x, terrainHeight(feature.x, feature.z), feature.z)]));
  const moodColors = [
    { sky: "#90bac7", fog: "#a7c1c3", light: 1.04 },
    { sky: "#9cc4cb", fog: "#b7c9bc", light: 1.12 },
    { sky: "#d5b78c", fog: "#bda989", light: 0.98 },
    { sky: "#718d9b", fog: "#697d7f", light: 0.72 },
  ];
  function setTimeMood(timeSlot) {
    const mood = moodColors[timeSlot] || moodColors[0];
    sun.intensity = mood.light;
    scene.clearColor = Color4.FromHexString(`${mood.sky}ff`);
    scene.fogColor = c(mood.fog);
  }
  setTimeMood(initialState.timeSlot);

  let elapsed = 0;
  return {
    engine,
    scene,
    camera,
    player: people.player.root,
    features: FEATURES,
    featurePositions,
    applyPlotState,
    setTimeMood,
    update(deltaSeconds, movement) {
      const delta = Math.min(deltaSeconds, 0.05);
      elapsed += delta;
      let dx = movement.x;
      let dz = movement.z;
      const length = Math.hypot(dx, dz);
      const moving = length > 0.01;
      if (moving) {
        dx /= length;
        dz /= length;
      // At the default camera angle this resolves to ordinary WASD movement; orbiting rotates input with the view.
      const moveX = dx * Math.sin(camera.alpha) + dz * Math.cos(camera.alpha);
      const moveZ = -dx * Math.cos(camera.alpha) + dz * Math.sin(camera.alpha);
        const step = 2.7 * delta;
        const nextX = people.player.root.position.x + moveX * step;
        const nextZ = people.player.root.position.z + moveZ * step;
        if (collisionFree(nextX, people.player.root.position.z)) people.player.root.position.x = nextX;
        if (collisionFree(people.player.root.position.x, nextZ)) people.player.root.position.z = nextZ;
        people.player.root.rotation.y = Math.atan2(moveX, moveZ);
      }
      people.player.update(delta, moving);
      people.mira.update(delta, false);
      people.asep.update(delta, false);
      const player = people.player.root;
      const forwardX = Math.sin(player.rotation.y);
      const forwardZ = Math.cos(player.rotation.y);
      const destination = new Vector3(player.position.x + forwardX * 2.5, 1.35 + terrainHeight(player.position.x, player.position.z), player.position.z + forwardZ * 2.5);
      const follow = 1 - Math.exp(-delta / 0.18);
      camera.setTarget(Vector3.Lerp(camera.getTarget(), destination, follow));
      sky.position.copyFrom(camera.position);
    },
    render() { scene.render(); },
    canOccupy(x, z) { return collisionFree(x, z); },
    setPlayerPosition(x, z) {
      if (!collisionFree(x, z)) return false;
      people.player.root.position.set(x, terrainHeight(x, z), z);
      const forwardX = Math.sin(people.player.root.rotation.y);
      const forwardZ = Math.cos(people.player.root.rotation.y);
      camera.setTarget(new Vector3(x + forwardX * 2.5, 1.35 + terrainHeight(x, z), z + forwardZ * 2.5));
      return true;
    },
    dispose() {
      camera.detachControl();
      scene.dispose();
      engine.dispose();
    },
  };
}

export { FEATURES };
