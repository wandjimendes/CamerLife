import { T } from "./tiles";

export interface FurnitureDef {
  key: string;
  name: string;
  /** Footprint in tiles. */
  w: number;
  h: number;
  /** Tileset frames, row-major, w*h entries. */
  frames: number[];
  /** Price in FCFA (0 = free in Phase 1). */
  price: number;
}

export const FURNITURE_CATALOG: FurnitureDef[] = [
  { key: "bed", name: "Bed", w: 1, h: 2, frames: [T.BED_TOP, T.BED_BOTTOM], price: 0 },
  { key: "sofa", name: "Sofa", w: 2, h: 1, frames: [T.SOFA_LEFT, T.SOFA_RIGHT], price: 0 },
  { key: "table", name: "Table", w: 1, h: 1, frames: [T.TABLE], price: 0 },
  { key: "chair", name: "Chair", w: 1, h: 1, frames: [T.CHAIR], price: 0 },
  { key: "plant", name: "Plant", w: 1, h: 1, frames: [T.PLANT], price: 0 },
  { key: "tv", name: "TV", w: 1, h: 1, frames: [T.TV], price: 0 },
  { key: "fridge", name: "Fridge", w: 1, h: 1, frames: [T.FRIDGE], price: 0 },
  { key: "lamp", name: "Lamp", w: 1, h: 1, frames: [T.LAMP], price: 0 },
  { key: "bookshelf", name: "Bookshelf", w: 1, h: 1, frames: [T.BOOKSHELF], price: 0 },
  { key: "stove", name: "Stove", w: 1, h: 1, frames: [T.STOVE], price: 0 },
  { key: "desk", name: "Desk", w: 1, h: 1, frames: [T.DESK], price: 0 },
];

export const FURNITURE_BY_KEY: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE_CATALOG.map((f) => [f.key, f]),
);

/** Max furniture pieces per unit (anti-spam). */
export const MAX_FURNITURE_PER_UNIT = 60;
