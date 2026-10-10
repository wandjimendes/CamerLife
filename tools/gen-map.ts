/**
 * Renders packages/shared/src/layout.ts into a Tiled JSON map (orthogonal,
 * 16x16). Output: apps/client/public/assets/maps/{town}.json
 *
 * The result is a regular Tiled file and can be opened/edited in Tiled; just
 * keep the layer names and door objects intact.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { T, TILE, TILESET_COLUMNS, TILESET_ROWS, TOWNS, doorZone, type BuildingDef, type TownLayout } from "../packages/shared/src/index";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "apps/client/public/assets/maps");

const G = (idx: number) => idx + 1; // Tiled gid (firstgid = 1)

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Layer {
  data: number[];
  constructor(
    public name: string,
    public w: number,
    public h: number,
    public visible = true,
  ) {
    this.data = new Array(w * h).fill(0);
  }
  set(x: number, y: number, gid: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = gid;
  }
  get(x: number, y: number) {
    return this.data[y * this.w + x] ?? 0;
  }
  fill(x: number, y: number, w: number, h: number, gid: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, gid);
  }
  toJSON(id: number) {
    return {
      id,
      name: this.name,
      type: "tilelayer",
      width: this.w,
      height: this.h,
      x: 0,
      y: 0,
      opacity: 1,
      visible: this.visible,
      data: this.data,
    };
  }
}

function drawBuilding(b: BuildingDef, buildings: Layer, collision: Layer) {
  const roofRows = b.kind === "house" ? 2 : b.kind === "bus_station" ? 1 : 2;
  // roof
  buildings.fill(b.x, b.y, b.w, roofRows, G(b.roof));
  // eave row under roof
  for (let i = 0; i < b.w; i++) buildings.set(b.x + i, b.y + roofRows, G(T.EAVE));
  // walls
  buildings.fill(b.x, b.y + roofRows + 1, b.w, b.h - roofRows - 1, G(b.wall));

  // windows on wall rows (skip door column on bottom row)
  const bottom = b.y + b.h - 1;
  for (let y = b.y + roofRows + 1; y <= bottom; y++) {
    for (let x = b.x + 1; x < b.x + b.w - 1; x += 2) {
      if (y === bottom && Math.abs(x - b.doorX) <= 1) continue;
      if (y === bottom && b.kind !== "house") continue;
      if ((y - (b.y + roofRows + 1)) % 2 === 0) buildings.set(x, y, G(T.WINDOW));
    }
  }

  // door + signage
  switch (b.kind) {
    case "hospital":
      buildings.set(b.doorX, b.doorY, G(T.DOOR_GLASS));
      buildings.set(b.doorX - 2, b.doorY, G(T.HOSPITAL_SIGN));
      buildings.set(b.doorX + 2, b.doorY, G(T.HOSPITAL_SIGN));
      buildings.set(b.doorX - 1, b.doorY, G(T.AWNING));
      buildings.set(b.doorX + 1, b.doorY, G(T.AWNING));
      break;
    case "bus_station":
      buildings.set(b.doorX, b.doorY, G(T.DOOR_GLASS));
      buildings.set(b.doorX - 2, b.doorY, G(T.BUS_SIGN));
      buildings.set(b.doorX + 2, b.doorY, G(T.BUS_SIGN));
      break;
    default:
      buildings.set(b.doorX, b.doorY, G(T.DOOR_WOOD));
  }

  // whole facade is solid
  collision.fill(b.x, b.y, b.w, b.h, G(T.COLLISION));
}

function buildTown(town: TownLayout) {
  const { width: W, height: H } = town;
  const rnd = mulberry32(42);
  const ground = new Layer("Ground", W, H);
  const roads = new Layer("Roads", W, H);
  const buildings = new Layer("Buildings", W, H);
  const decor = new Layer("Decor", W, H);
  const collision = new Layer("Collision", W, H, false);

  // grass everywhere with occasional flowers
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) ground.set(x, y, rnd() < 0.08 ? G(T.GRASS_FLOWERS) : G(T.GRASS));

  // the street
  const [r0, r1] = town.roadRows;
  for (let x = 0; x < W; x++) {
    roads.set(x, r0 - 1, G(T.SIDEWALK));
    roads.set(x, r1 + 1, G(T.SIDEWALK));
    for (let y = r0; y <= r1; y++) {
      const mid = Math.floor((r0 + r1) / 2);
      roads.set(x, y, y === mid && x % 2 === 0 ? G(T.ROAD_DASH) : G(T.ROAD));
    }
  }
  // crosswalks in front of the hospital and bus station
  for (const b of town.buildings) {
    if (b.isFacility || b.kind === "bus_station") {
      for (let y = r0; y <= r1; y++) roads.set(b.doorX, y, G(T.CROSSWALK));
    }
  }
  // lamp posts along the north sidewalk
  for (let x = 6; x < W; x += 12) roads.set(x, r0 - 1, G(T.LAMP_POST));

  // buildings
  for (const b of town.buildings) drawBuilding(b, buildings, collision);

  // decor: trees between buildings, a little park south of the road
  const occupied = (x: number, y: number) => collision.get(x, y) !== 0 || roads.get(x, y) !== 0;
  const tree = (x: number, y: number, palm = false) => {
    if (occupied(x, y) || occupied(x, y + 1) || y + 1 >= H) return;
    decor.set(x, y, G(palm ? T.PALM_TOP : T.TREE_TOP));
    decor.set(x, y + 1, G(palm ? T.PALM_BOTTOM : T.TREE_BOTTOM));
    collision.set(x, y + 1, G(T.COLLISION));
  };
  // between houses
  for (const b of town.buildings) {
    tree(b.x + b.w + 0, b.y + b.h - 3, b.kind !== "house");
  }
  tree(0, 10);
  // park south of the road
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * W);
    const y = r1 + 3 + Math.floor(rnd() * (H - r1 - 5));
    if (rnd() < 0.5) tree(x, y, rnd() < 0.3);
    else if (!occupied(x, y) && decor.get(x, y) === 0) {
      decor.set(x, y, G(rnd() < 0.5 ? T.BUSH : T.FLOWER_BED));
      collision.set(x, y, G(T.COLLISION));
    }
  }
  // map borders are solid
  for (let x = 0; x < W; x++) {
    collision.set(x, 0, G(T.COLLISION));
    collision.set(x, H - 1, G(T.COLLISION));
  }
  for (let y = 0; y < H; y++) {
    collision.set(0, y, G(T.COLLISION));
    collision.set(W - 1, y, G(T.COLLISION));
  }

  // objects: doors + spawn
  let objId = 1;
  const objects: unknown[] = [];
  for (const b of town.buildings) {
    const z = doorZone(b);
    objects.push({
      id: objId++,
      name: b.name,
      type: "door",
      x: z.x * TILE,
      y: z.y * TILE,
      width: TILE,
      height: TILE,
      rotation: 0,
      visible: true,
      properties: [
        { name: "buildingSlug", type: "string", value: b.slug },
        { name: "kind", type: "string", value: b.kind },
        { name: "isFacility", type: "bool", value: b.isFacility },
      ],
    });
  }
  objects.push({
    id: objId++,
    name: "spawn",
    type: "spawn",
    x: town.spawn.x * TILE + TILE / 2,
    y: town.spawn.y * TILE + TILE / 2,
    width: 0,
    height: 0,
    point: true,
    rotation: 0,
    visible: true,
  });

  return {
    compressionlevel: -1,
    height: H,
    width: W,
    infinite: false,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.11.0",
    type: "map",
    version: "1.10",
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: 7,
    nextobjectid: objId,
    properties: [
      { name: "townId", type: "string", value: town.id },
      { name: "townName", type: "string", value: town.name },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: "cozy-tiles",
        image: "../tiles/cozy-tiles.png",
        imagewidth: TILESET_COLUMNS * TILE,
        imageheight: TILESET_ROWS * TILE,
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: TILESET_COLUMNS * TILESET_ROWS,
        columns: TILESET_COLUMNS,
        margin: 0,
        spacing: 0,
        tiles: [{ id: T.COLLISION, properties: [{ name: "collides", type: "bool", value: true }] }],
      },
    ],
    layers: [
      ground.toJSON(1),
      roads.toJSON(2),
      buildings.toJSON(3),
      decor.toJSON(4),
      collision.toJSON(5),
      {
        id: 6,
        name: "Objects",
        type: "objectgroup",
        draworder: "topdown",
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        objects,
      },
    ],
  };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  for (const town of TOWNS) {
    const json = buildTown(town);
    const file = resolve(OUT, `${town.mapKey}.json`);
    writeFileSync(file, JSON.stringify(json));
    console.log(`Map written: ${file} (${town.width}x${town.height})`);
  }
}

main();
