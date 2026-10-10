/**
 * Generates placeholder "cozy pack" style art:
 *  - apps/client/public/assets/tiles/cozy-tiles.png   (16x16 tileset, 16 cols x 4 rows)
 *  - apps/client/public/assets/sprites/body.png       (white body mask, tinted by skin)
 *  - apps/client/public/assets/sprites/clothes.png    (white clothes mask, tinted by clothes color)
 *  - apps/client/public/assets/sprites/hair_{n}.png   (white hair masks per style, tinted by hair color)
 *
 * Run: npm run gen:assets
 * Replace these PNGs with a licensed itch.io cozy pack when ready (same layout).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, hex, TRANSPARENT, type RGBA } from "./png";
import { T, TILE, TILESET_COLUMNS, TILESET_ROWS, HAIR_STYLES } from "../packages/shared/src/index";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "apps/client/public/assets");

// Cozy palette
const C = {
  grass: hex("#8fcf6a"),
  grassDark: hex("#7bbd58"),
  grassLight: hex("#a3dc7e"),
  road: hex("#6d6d78"),
  roadDark: hex("#5c5c66"),
  roadLine: hex("#f0e3a0"),
  sidewalk: hex("#d9d0b8"),
  sidewalkLine: hex("#c6bc9f"),
  dirt: hex("#c9a46b"),
  sand: hex("#e9d9a5"),
  trunk: hex("#8a5a2b"),
  leaf: hex("#4f9a3e"),
  leafLight: hex("#6cb857"),
  leafDark: hex("#3b7a2e"),
  flowerPink: hex("#ff8fb1"),
  flowerYellow: hex("#ffd766"),
  flowerWhite: hex("#fff6e5"),
  outline: hex("#3a2f2f"),
  roofRed: hex("#d9534f"),
  roofRedDark: hex("#b8413d"),
  roofBlue: hex("#4f8fd9"),
  roofBlueDark: hex("#3d73b3"),
  roofGreen: hex("#5fb36b"),
  roofGreenDark: hex("#4a9456"),
  roofOrange: hex("#f0963c"),
  roofOrangeDark: hex("#cf7a28"),
  roofPurple: hex("#9b6fd1"),
  roofPurpleDark: hex("#7e55b3"),
  roofYellow: hex("#f2c94c"),
  roofYellowDark: hex("#d1aa33"),
  wallCream: hex("#f6e7c8"),
  wallCreamShade: hex("#e4d3b0"),
  wallWhite: hex("#f7f7f2"),
  wallWhiteShade: hex("#e3e3dc"),
  brick: hex("#c7764f"),
  brickDark: hex("#a85e3c"),
  brickMortar: hex("#e0b89a"),
  glass: hex("#9fd8ef"),
  glassLight: hex("#d3f1fb"),
  frame: hex("#7a5230"),
  door: hex("#8a5a2b"),
  doorDark: hex("#6b4321"),
  knob: hex("#f2c94c"),
  cross: hex("#e2393b"),
  busSign: hex("#2d6cdf"),
  eave: hex("#5e4a3a"),
  awning: hex("#e2393b"),
  awningLight: hex("#fff6e5"),
  wood: hex("#c99a62"),
  woodDark: hex("#b2854f"),
  tile: hex("#e9e4d6"),
  tileDark: hex("#d6d0c0"),
  wallInt: hex("#d8c4a5"),
  wallIntDark: hex("#b89c78"),
  wallIntClinic: hex("#cfe6ea"),
  clinicFloor: hex("#eef5f6"),
  clinicFloorDark: hex("#dde9eb"),
  rug: hex("#c75b6b"),
  rugLight: hex("#e58a98"),
  mat: hex("#9a7b55"),
  placeOk: [111, 230, 120, 140] as RGBA,
  placeBad: [230, 90, 90, 140] as RGBA,
  collision: [255, 0, 0, 90] as RGBA,
  bed: hex("#f2f2f2"),
  bedBlanket: hex("#5aa0e6"),
  bedPillow: hex("#fff6e5"),
  bedFrame: hex("#8a5a2b"),
  sofa: hex("#d9534f"),
  sofaLight: hex("#ea7a76"),
  sofaDark: hex("#b8413d"),
  tableWood: hex("#c99a62"),
  chair: hex("#a86f3c"),
  pot: hex("#c7764f"),
  tvDark: hex("#2a2a35"),
  tvScreen: hex("#73c7ff"),
  fridge: hex("#dfe6ec"),
  fridgeDark: hex("#b9c4cc"),
  lampShade: hex("#ffd766"),
  lampPole: hex("#6b4321"),
  shelf: hex("#8a5a2b"),
  book1: hex("#4f8fd9"),
  book2: hex("#d9534f"),
  book3: hex("#5fb36b"),
  stove: hex("#4a4a55"),
  stoveTop: hex("#2a2a35"),
  burner: hex("#ff7b4a"),
  white: hex("#ffffff"),
  shade: hex("#c8c8c8"),
  dark: hex("#8f8f8f"),
};

function drawTileset(): Canvas {
  const cv = new Canvas(TILESET_COLUMNS * TILE, TILESET_ROWS * TILE);
  const at = (idx: number) => {
    const ox = (idx % TILESET_COLUMNS) * TILE;
    const oy = Math.floor(idx / TILESET_COLUMNS) * TILE;
    return {
      p: (x: number, y: number, c: RGBA) => cv.set(ox + x, oy + y, c),
      r: (x: number, y: number, w: number, h: number, c: RGBA) => cv.fillRect(ox + x, oy + y, w, h, c),
    };
  };

  const grassBase = (idx: number) => {
    const { r, p } = at(idx);
    r(0, 0, 16, 16, C.grass);
    // scattered darker blades
    [[2, 3], [9, 2], [13, 7], [5, 10], [11, 12], [1, 14], [7, 6]].forEach(([x, y]) => {
      p(x, y, C.grassDark);
      p(x + 1, y, C.grassDark);
    });
    [[6, 1], [14, 11], [3, 8]].forEach(([x, y]) => p(x, y, C.grassLight));
  };

  grassBase(T.GRASS);
  grassBase(T.GRASS_FLOWERS);
  {
    const { p } = at(T.GRASS_FLOWERS);
    p(4, 5, C.flowerPink);
    p(11, 9, C.flowerYellow);
    p(8, 13, C.flowerWhite);
  }

  {
    const { r, p } = at(T.ROAD);
    r(0, 0, 16, 16, C.road);
    [[3, 4], [10, 2], [13, 11], [6, 13]].forEach(([x, y]) => p(x, y, C.roadDark));
  }
  {
    const { r } = at(T.ROAD_DASH);
    r(0, 0, 16, 16, C.road);
    r(2, 7, 7, 2, C.roadLine);
  }
  {
    const { r } = at(T.SIDEWALK);
    r(0, 0, 16, 16, C.sidewalk);
    r(0, 7, 16, 1, C.sidewalkLine);
    r(7, 0, 1, 16, C.sidewalkLine);
  }
  {
    const { r, p } = at(T.DIRT);
    r(0, 0, 16, 16, C.dirt);
    [[4, 3], [11, 8], [7, 12]].forEach(([x, y]) => p(x, y, C.trunk));
  }
  {
    const { r } = at(T.SAND);
    r(0, 0, 16, 16, C.sand);
  }
  // Tree (2 tiles tall)
  {
    const { r, p } = at(T.TREE_TOP);
    r(0, 0, 16, 16, C.grass);
    r(3, 2, 10, 12, C.leaf);
    r(4, 1, 8, 1, C.leaf);
    r(2, 4, 1, 8, C.leaf);
    r(13, 4, 1, 8, C.leaf);
    r(5, 3, 4, 3, C.leafLight);
    r(9, 9, 3, 3, C.leafDark);
    p(6, 7, C.flowerYellow);
  }
  {
    const { r } = at(T.TREE_BOTTOM);
    r(0, 0, 16, 16, C.grass);
    r(3, 0, 10, 4, C.leaf);
    r(4, 4, 8, 1, C.leafDark);
    r(6, 4, 4, 9, C.trunk);
    r(5, 13, 6, 1, C.grassDark);
  }
  {
    const { r } = at(T.BUSH);
    r(0, 0, 16, 16, C.grass);
    r(3, 6, 10, 7, C.leaf);
    r(4, 5, 8, 1, C.leaf);
    r(5, 7, 3, 2, C.leafLight);
    r(4, 13, 8, 1, C.grassDark);
  }
  {
    const { r, p } = at(T.FLOWER_BED);
    r(0, 0, 16, 16, C.grass);
    r(2, 3, 12, 10, C.dirt);
    [[4, 5, C.flowerPink], [8, 4, C.flowerYellow], [11, 7, C.flowerWhite], [5, 10, C.flowerYellow], [10, 10, C.flowerPink]].forEach(
      ([x, y, c]) => {
        p(x as number, y as number, c as RGBA);
        p((x as number) + 1, y as number, c as RGBA);
      },
    );
  }
  // Palm (2 tiles)
  {
    const { r, p } = at(T.PALM_TOP);
    r(0, 0, 16, 16, C.grass);
    r(2, 6, 12, 2, C.leaf);
    r(4, 4, 8, 2, C.leafLight);
    r(6, 2, 4, 2, C.leaf);
    r(1, 8, 3, 2, C.leafDark);
    r(12, 8, 3, 2, C.leafDark);
    r(7, 8, 2, 8, C.trunk);
    p(7, 7, C.flowerYellow);
  }
  {
    const { r } = at(T.PALM_BOTTOM);
    r(0, 0, 16, 16, C.grass);
    r(7, 0, 2, 13, C.trunk);
    r(6, 13, 4, 1, C.grassDark);
  }
  {
    const { r } = at(T.LAMP_POST);
    r(0, 0, 16, 16, C.sidewalk);
    r(7, 2, 2, 12, C.eave);
    r(5, 0, 6, 3, C.lampShade);
  }
  {
    const { r } = at(T.CROSSWALK);
    r(0, 0, 16, 16, C.road);
    for (let i = 0; i < 16; i += 4) r(i, 0, 2, 16, C.roadLine);
  }
  {
    const { r } = at(T.ROAD_EDGE);
    r(0, 0, 16, 16, C.road);
    r(0, 0, 16, 1, C.roadDark);
  }

  // Roofs
  const roof = (idx: number, base: RGBA, dark: RGBA) => {
    const { r } = at(idx);
    r(0, 0, 16, 16, base);
    for (let y = 0; y < 16; y += 4) {
      r(0, y + 3, 16, 1, dark);
      for (let x = (y / 4) % 2 ? 4 : 0; x < 16; x += 8) r(x, y, 1, 3, dark);
    }
  };
  roof(T.ROOF_RED, C.roofRed, C.roofRedDark);
  roof(T.ROOF_BLUE, C.roofBlue, C.roofBlueDark);
  roof(T.ROOF_GREEN, C.roofGreen, C.roofGreenDark);
  roof(T.ROOF_ORANGE, C.roofOrange, C.roofOrangeDark);
  roof(T.ROOF_PURPLE, C.roofPurple, C.roofPurpleDark);
  roof(T.ROOF_YELLOW, C.roofYellow, C.roofYellowDark);

  const wall = (idx: number, base: RGBA, shade: RGBA) => {
    const { r } = at(idx);
    r(0, 0, 16, 16, base);
    r(0, 15, 16, 1, shade);
    r(0, 7, 16, 1, shade);
  };
  wall(T.WALL_CREAM, C.wallCream, C.wallCreamShade);
  wall(T.WALL_WHITE, C.wallWhite, C.wallWhiteShade);
  {
    const { r } = at(T.WALL_BRICK);
    r(0, 0, 16, 16, C.brick);
    for (let y = 0; y < 16; y += 4) {
      r(0, y + 3, 16, 1, C.brickMortar);
      for (let x = (y / 4) % 2 ? 4 : 0; x < 16; x += 8) r(x, y, 1, 3, C.brickMortar);
    }
  }
  {
    const { r } = at(T.WINDOW);
    r(0, 0, 16, 16, C.wallCream);
    r(0, 15, 16, 1, C.wallCreamShade);
    r(3, 3, 10, 10, C.frame);
    r(4, 4, 8, 8, C.glass);
    r(4, 4, 3, 3, C.glassLight);
    r(7, 4, 1, 8, C.frame);
    r(4, 7, 8, 1, C.frame);
  }
  {
    const { r, p } = at(T.DOOR_WOOD);
    r(0, 0, 16, 16, C.wallCream);
    r(4, 2, 8, 14, C.doorDark);
    r(5, 3, 6, 13, C.door);
    p(9, 9, C.knob);
  }
  {
    const { r, p } = at(T.DOOR_GLASS);
    r(0, 0, 16, 16, C.wallWhite);
    r(3, 2, 10, 14, C.frame);
    r(4, 3, 8, 13, C.glass);
    r(8, 3, 1, 13, C.frame);
    p(6, 9, C.knob);
    p(10, 9, C.knob);
  }
  {
    const { r } = at(T.HOSPITAL_SIGN);
    r(0, 0, 16, 16, C.wallWhite);
    r(2, 2, 12, 12, C.white);
    r(6, 3, 4, 10, C.cross);
    r(3, 6, 10, 4, C.cross);
  }
  {
    const { r } = at(T.BUS_SIGN);
    r(0, 0, 16, 16, C.brick);
    r(1, 2, 14, 12, C.busSign);
    r(3, 5, 10, 5, C.white);
    r(4, 10, 2, 2, C.tvDark);
    r(10, 10, 2, 2, C.tvDark);
  }
  {
    const { r } = at(T.EAVE);
    r(0, 0, 16, 16, C.wallCream);
    r(0, 0, 16, 3, C.eave);
    r(0, 3, 16, 1, C.wallCreamShade);
  }
  {
    const { r } = at(T.AWNING);
    r(0, 0, 16, 16, C.wallWhite);
    for (let x = 0; x < 16; x += 4) {
      r(x, 0, 2, 5, C.awning);
      r(x + 2, 0, 2, 5, C.awningLight);
    }
    r(0, 5, 16, 1, C.eave);
  }

  // Interiors
  {
    const { r } = at(T.FLOOR_WOOD);
    r(0, 0, 16, 16, C.wood);
    r(0, 7, 16, 1, C.woodDark);
    r(0, 15, 16, 1, C.woodDark);
    r(5, 0, 1, 7, C.woodDark);
    r(11, 8, 1, 7, C.woodDark);
  }
  {
    const { r } = at(T.FLOOR_TILE);
    r(0, 0, 16, 16, C.tile);
    r(0, 0, 8, 8, C.tileDark);
    r(8, 8, 8, 8, C.tileDark);
  }
  {
    const { r } = at(T.WALL_INT_TOP);
    r(0, 0, 16, 16, C.wallInt);
    r(0, 0, 16, 2, C.wallIntDark);
    r(0, 12, 16, 4, C.wallIntDark);
  }
  {
    const { r } = at(T.WALL_INT_BASE);
    r(0, 0, 16, 16, C.wallIntDark);
    r(0, 0, 16, 10, C.wallInt);
  }
  {
    const { r } = at(T.RUG);
    r(0, 0, 16, 16, C.wood);
    r(1, 1, 14, 14, C.rug);
    r(3, 3, 10, 10, C.rugLight);
  }
  {
    const { r } = at(T.FLOOR_CLINIC);
    r(0, 0, 16, 16, C.clinicFloor);
    r(0, 0, 8, 8, C.clinicFloorDark);
    r(8, 8, 8, 8, C.clinicFloorDark);
  }
  {
    const { r } = at(T.WALL_INT_CLINIC);
    r(0, 0, 16, 16, C.wallIntClinic);
    r(0, 0, 16, 2, C.wallIntDark);
    r(0, 12, 16, 4, C.wallWhiteShade);
  }
  {
    const { r } = at(T.DOOR_MAT);
    r(0, 0, 16, 16, C.wood);
    r(2, 3, 12, 10, C.mat);
    r(4, 5, 8, 6, C.dirt);
  }
  at(T.PLACE_OK).r(0, 0, 16, 16, C.placeOk);
  at(T.PLACE_BAD).r(0, 0, 16, 16, C.placeBad);

  // Furniture (transparent backgrounds)
  {
    const { r } = at(T.BED_TOP);
    r(2, 1, 12, 15, C.bedFrame);
    r(3, 2, 10, 14, C.bed);
    r(4, 3, 8, 4, C.bedPillow);
    r(3, 9, 10, 7, C.bedBlanket);
  }
  {
    const { r } = at(T.BED_BOTTOM);
    r(2, 0, 12, 14, C.bedFrame);
    r(3, 0, 10, 12, C.bedBlanket);
    r(3, 10, 10, 2, C.bed);
    r(2, 14, 12, 1, C.doorDark);
  }
  {
    const { r } = at(T.SOFA_LEFT);
    r(1, 4, 15, 10, C.sofaDark);
    r(2, 5, 14, 5, C.sofa);
    r(3, 6, 13, 2, C.sofaLight);
    r(2, 10, 14, 3, C.sofa);
  }
  {
    const { r } = at(T.SOFA_RIGHT);
    r(0, 4, 15, 10, C.sofaDark);
    r(0, 5, 14, 5, C.sofa);
    r(0, 6, 13, 2, C.sofaLight);
    r(0, 10, 14, 3, C.sofa);
  }
  {
    const { r } = at(T.TABLE);
    r(2, 4, 12, 7, C.tableWood);
    r(2, 10, 12, 1, C.woodDark);
    r(3, 11, 2, 4, C.woodDark);
    r(11, 11, 2, 4, C.woodDark);
  }
  {
    const { r } = at(T.CHAIR);
    r(4, 2, 8, 6, C.chair);
    r(4, 8, 8, 4, C.tableWood);
    r(4, 12, 2, 3, C.chair);
    r(10, 12, 2, 3, C.chair);
  }
  {
    const { r, p } = at(T.PLANT);
    r(5, 10, 6, 5, C.pot);
    r(4, 9, 8, 1, C.brickDark);
    r(6, 3, 4, 7, C.leaf);
    r(3, 5, 3, 3, C.leafLight);
    r(10, 4, 3, 3, C.leafLight);
    p(7, 2, C.leafDark);
  }
  {
    const { r } = at(T.TV);
    r(2, 3, 12, 9, C.tvDark);
    r(3, 4, 10, 7, C.tvScreen);
    r(6, 12, 4, 2, C.tvDark);
    r(4, 14, 8, 1, C.tvDark);
  }
  {
    const { r } = at(T.FRIDGE);
    r(3, 1, 10, 14, C.fridgeDark);
    r(4, 2, 8, 12, C.fridge);
    r(4, 6, 8, 1, C.fridgeDark);
    r(10, 3, 1, 2, C.tvDark);
    r(10, 8, 1, 3, C.tvDark);
  }
  {
    const { r } = at(T.LAMP);
    r(4, 1, 8, 5, C.lampShade);
    r(5, 6, 6, 1, C.roofYellowDark);
    r(7, 7, 2, 6, C.lampPole);
    r(5, 13, 6, 2, C.lampPole);
  }
  {
    const { r } = at(T.BOOKSHELF);
    r(2, 1, 12, 14, C.shelf);
    r(3, 2, 10, 4, C.doorDark);
    r(3, 8, 10, 4, C.doorDark);
    r(4, 2, 2, 4, C.book1);
    r(6, 2, 2, 4, C.book2);
    r(9, 2, 2, 4, C.book3);
    r(4, 8, 3, 4, C.book3);
    r(8, 8, 2, 4, C.book1);
  }
  {
    const { r } = at(T.STOVE);
    r(2, 3, 12, 12, C.stove);
    r(3, 4, 10, 4, C.stoveTop);
    r(4, 5, 2, 2, C.burner);
    r(9, 5, 2, 2, C.burner);
    r(4, 10, 8, 3, C.fridgeDark);
  }
  {
    const { r } = at(T.DESK);
    r(1, 4, 14, 7, C.woodDark);
    r(2, 5, 12, 5, C.tableWood);
    r(2, 11, 2, 4, C.woodDark);
    r(12, 11, 2, 4, C.woodDark);
    r(9, 2, 4, 3, C.tvDark);
  }
  {
    const { r } = at(T.HOSPITAL_BED);
    r(2, 1, 12, 14, C.fridgeDark);
    r(3, 2, 10, 12, C.bed);
    r(4, 3, 8, 3, C.bedPillow);
    r(3, 8, 10, 6, C.glass);
  }
  {
    const { r } = at(T.RECEPTION);
    r(1, 5, 14, 8, C.woodDark);
    r(2, 6, 12, 6, C.tableWood);
    r(5, 2, 6, 3, C.white);
    r(7, 5, 2, 1, C.tvDark);
  }
  at(T.COLLISION).r(0, 0, 16, 16, C.collision);

  return cv;
}

// ------------------------------------------------------------------------
// Character sheets. Frames: 16x24, 3 columns (idle, walk1, walk2), 4 rows
// (down, up, left, right). White masks are tinted in Phaser.
// ------------------------------------------------------------------------
const FW = 16;
const FH = 24;
const DIRS = ["down", "up", "left", "right"] as const;

type Painter = (p: (x: number, y: number, c: RGBA) => void, r: (x: number, y: number, w: number, h: number, c: RGBA) => void, dir: (typeof DIRS)[number], frame: number) => void;

function drawSheet(painter: Painter): Canvas {
  const cv = new Canvas(FW * 3, FH * DIRS.length);
  DIRS.forEach((dir, row) => {
    for (let frame = 0; frame < 3; frame++) {
      const ox = frame * FW;
      const oy = row * FH;
      painter(
        (x, y, c) => cv.set(ox + x, oy + y, c),
        (x, y, w, h, c) => cv.fillRect(ox + x, oy + y, w, h, c),
        dir,
        frame,
      );
    }
  });
  return cv;
}

const bodyPainter: Painter = (p, r, dir, frame) => {
  // head
  r(4, 2, 8, 8, C.white);
  r(4, 9, 8, 1, C.shade);
  // neck
  r(6, 10, 4, 1, C.white);
  // arms
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  r(2, 11 + (dir === "left" ? 0 : swing), 2, 6, C.white);
  r(12, 11 - (dir === "right" ? 0 : swing), 2, 6, C.white);
  // legs (walk cycle offsets)
  const l = frame === 1 ? 1 : 0;
  const rr = frame === 2 ? 1 : 0;
  r(5, 17 + l, 3, 6 - l, C.white);
  r(8, 17 + rr, 3, 6 - rr, C.white);
  r(5, 22, 3, 1, C.dark);
  r(8, 22, 3, 1, C.dark);
  // face
  if (dir === "down") {
    p(6, 6, C.outline);
    p(9, 6, C.outline);
    p(7, 8, C.dark);
    p(8, 8, C.dark);
  } else if (dir === "left") {
    p(5, 6, C.outline);
    p(5, 8, C.dark);
  } else if (dir === "right") {
    p(10, 6, C.outline);
    p(10, 8, C.dark);
  }
};

const clothesPainter: Painter = (p, r, dir, frame) => {
  // shirt
  r(4, 11, 8, 6, C.white);
  r(4, 16, 8, 1, C.shade);
  // sleeves
  const swing = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  r(2, 11 + (dir === "left" ? 0 : swing), 2, 2, C.white);
  r(12, 11 - (dir === "right" ? 0 : swing), 2, 2, C.white);
  // shorts
  const l = frame === 1 ? 1 : 0;
  const rr = frame === 2 ? 1 : 0;
  r(5, 17 + l, 3, 3, C.dark);
  r(8, 17 + rr, 3, 3, C.dark);
  if (dir === "down") {
    r(7, 12, 2, 3, C.shade); // collar detail
  }
};

const hairPainters: Painter[] = [
  // Short
  (p, r, dir) => {
    r(4, 1, 8, 3, C.white);
    r(3, 2, 1, 3, C.white);
    r(12, 2, 1, 3, C.white);
    if (dir === "up") r(4, 4, 8, 4, C.white);
  },
  // Afro
  (p, r, dir) => {
    r(3, 0, 10, 5, C.white);
    r(2, 1, 1, 5, C.white);
    r(13, 1, 1, 5, C.white);
    r(2, 5, 2, 2, C.shade);
    r(12, 5, 2, 2, C.shade);
    if (dir === "up") r(3, 5, 10, 4, C.white);
  },
  // Braids
  (p, r, dir) => {
    r(4, 1, 8, 3, C.white);
    r(3, 2, 1, 8, C.white);
    r(12, 2, 1, 8, C.white);
    r(2, 8, 2, 5, C.shade);
    r(12, 8, 2, 5, C.shade);
    if (dir === "up") {
      r(4, 4, 8, 5, C.white);
      r(5, 9, 2, 5, C.shade);
      r(9, 9, 2, 5, C.shade);
    }
  },
  // Bald (empty mask)
  () => {},
];

function main() {
  mkdirSync(resolve(OUT, "tiles"), { recursive: true });
  mkdirSync(resolve(OUT, "sprites"), { recursive: true });

  writeFileSync(resolve(OUT, "tiles/cozy-tiles.png"), drawTileset().encode());
  writeFileSync(resolve(OUT, "sprites/body.png"), drawSheet(bodyPainter).encode());
  writeFileSync(resolve(OUT, "sprites/clothes.png"), drawSheet(clothesPainter).encode());
  HAIR_STYLES.forEach((_, i) => {
    writeFileSync(resolve(OUT, `sprites/hair_${i}.png`), drawSheet(hairPainters[i] ?? hairPainters[0]).encode());
  });

  // transparent 1x1 placeholder used by the map for empty tiles
  const empty = new Canvas(1, 1);
  empty.set(0, 0, TRANSPARENT);
  writeFileSync(resolve(OUT, "sprites/empty.png"), empty.encode());

  console.log(`Assets written to ${OUT}`);
}

main();
