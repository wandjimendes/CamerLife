import Phaser from "phaser";
import { T, TILE } from "@cameroon-life/shared";
import { SMALL_SCREEN } from "./touch";

export interface Interior {
  map: Phaser.Tilemaps.Tilemap;
  floor: Phaser.Tilemaps.TilemapLayer;
  walls: Phaser.Tilemaps.TilemapLayer;
  /** Interior tile (0..w-1, 0..h-1) -> world pixel position of the tile's top-left. */
  toWorld: (tx: number, ty: number) => { x: number; y: number };
  /** World pixel -> interior tile coordinates (may be out of range). */
  toTile: (x: number, y: number) => { x: number; y: number };
  /** Door tile in interior coordinates (bottom centre). */
  door: { x: number; y: number };
  widthPx: number;
  heightPx: number;
}

/**
 * Builds a walled room of w x h interior tiles (plus a 1-tile wall border)
 * from the tileset. Shared by house and facility interiors.
 */
export function buildInterior(
  scene: Phaser.Scene,
  w: number,
  h: number,
  style: "home" | "clinic" = "home",
): Interior {
  const W = w + 2;
  const H = h + 2;
  const map = scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: W, height: H });
  const tileset = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
  const floor = map.createBlankLayer("floor", tileset)!;
  const walls = map.createBlankLayer("walls", tileset)!;

  const floorTile = style === "clinic" ? T.FLOOR_CLINIC : T.FLOOR_WOOD;
  const wallTop = style === "clinic" ? T.WALL_INT_CLINIC : T.WALL_INT_TOP;
  const wallSide = T.WALL_INT_BASE;
  const G = (i: number) => i + 1; // blank layers index from the tileset's firstgid (1)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (border) {
        walls.putTileAt(G(y === 0 ? wallTop : wallSide), x, y);
      } else {
        floor.putTileAt(G(floorTile), x, y);
      }
    }
  }
  // a rug in the middle of homes
  if (style === "home" && w >= 6 && h >= 5) {
    const cx = Math.floor(W / 2);
    const cy = Math.floor(H / 2);
    for (let y = cy - 1; y <= cy; y++) for (let x = cx - 1; x <= cx + 1; x++) floor.putTileAt(G(T.RUG), x, y);
  }
  // door mat on the bottom wall
  const door = { x: Math.floor(w / 2), y: h - 1 };
  walls.putTileAt(G(T.DOOR_MAT), door.x + 1, H - 1);
  walls.setCollisionByExclusion([-1]);

  return {
    map,
    floor,
    walls,
    door,
    widthPx: W * TILE,
    heightPx: H * TILE,
    toWorld: (tx, ty) => ({ x: (tx + 1) * TILE, y: (ty + 1) * TILE }),
    toTile: (x, y) => ({ x: Math.floor(x / TILE) - 1, y: Math.floor(y / TILE) - 1 }),
  };
}

/** Small screens (phones) get a wider view; tiles are 16px so 3x is a lot on 390px. */
export function gameZoom(scene: Phaser.Scene): number {
  return scene.scale.width < SMALL_SCREEN ? 2 : 3;
}

/**
 * Points the main camera at an interior. Rooms that fit on screen are shown
 * whole and centred (camera bounds must be removed for that - with bounds
 * set, Phaser clamps the scroll to 0 and pins small rooms to the top-left).
 * Larger rooms scroll with the player. Re-evaluated on viewport resize.
 */
export function fitInteriorCamera(scene: Phaser.Scene, interior: Interior, follow: Phaser.GameObjects.GameObject): void {
  const cam = scene.cameras.main;
  cam.setRoundPixels(true);

  const apply = () => {
    const zoom = gameZoom(scene);
    cam.setZoom(zoom);
    const fits = interior.widthPx * zoom <= scene.scale.width && interior.heightPx * zoom <= scene.scale.height;
    if (fits) {
      cam.stopFollow();
      cam.removeBounds();
      cam.centerOn(interior.widthPx / 2, interior.heightPx / 2);
    } else {
      cam.setBounds(0, 0, interior.widthPx, interior.heightPx);
      cam.startFollow(follow, true, 0.2, 0.2);
    }
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, apply));
}
