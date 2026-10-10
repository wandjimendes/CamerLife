import { T } from "./tiles";

/**
 * World layouts. This is the single source of truth for building placement:
 *  - tools/gen-map.ts renders it into the Tiled JSON map
 *  - tools/gen-seed.ts renders it into supabase/seed.sql
 *  - the Colyseus server uses it to validate door interactions
 */

export type BuildingKind =
  | "house"
  | "villa"
  | "apartment_block"
  | "shop_block"
  | "hospital"
  | "police"
  | "fire"
  | "park"
  | "cinema"
  | "bus_station"
  | "train_station"
  | "airport";

export type UnitKind = "room" | "studio" | "apartment" | "shop" | "house" | "villa";
export type ListingStatus = "none" | "sale" | "rent";

export interface UnitDef {
  slug: string;
  kind: UnitKind;
  label: string;
  interiorW: number;
  interiorH: number;
  listing: ListingStatus;
  salePrice: number | null;
  rentPrice: number | null;
}

export interface BuildingDef {
  slug: string;
  name: string;
  kind: BuildingKind;
  /** Top-left tile of the facade. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tile coordinates of the door (inside the facade, bottom row). */
  doorX: number;
  doorY: number;
  /** Roof tile index for houses; wall tile for others. */
  roof: number;
  wall: number;
  units: UnitDef[];
  /** Whether this building is a job facility. */
  isFacility: boolean;
}

export interface TownLayout {
  id: string;
  name: string;
  mapKey: string;
  width: number;
  height: number;
  /** Road rows (inclusive). */
  roadRows: [number, number];
  spawn: { x: number; y: number }; // tile coords
  buildings: BuildingDef[];
}

/** Door interaction zone is the tile directly in front (south) of the door. */
export function doorZone(b: BuildingDef): { x: number; y: number } {
  return { x: b.doorX, y: b.doorY + 1 };
}

const HOUSE_ROOFS = [T.ROOF_RED, T.ROOF_BLUE, T.ROOF_GREEN, T.ROOF_ORANGE, T.ROOF_PURPLE];
const HOUSE_PRICES = [3_500_000, 4_200_000, 2_800_000, 5_000_000, 3_900_000];
const HOUSE_NAMES = ["Villa Akwa", "Maison Bonapriso", "Maison Deido", "Villa Bonanjo", "Maison Bali"];

function house(i: number, x: number): BuildingDef {
  const w = 6;
  const h = 6;
  const y = 9;
  return {
    slug: `douala-house-${i + 1}`,
    name: HOUSE_NAMES[i],
    kind: "house",
    x,
    y,
    w,
    h,
    doorX: x + 2,
    doorY: y + h - 1,
    roof: HOUSE_ROOFS[i],
    wall: T.WALL_CREAM,
    isFacility: false,
    units: [
      {
        slug: `douala-house-${i + 1}-main`,
        kind: "house",
        label: HOUSE_NAMES[i],
        interiorW: 10,
        interiorH: 8,
        listing: "sale",
        salePrice: HOUSE_PRICES[i],
        rentPrice: null,
      },
    ],
  };
}

export const DOUALA: TownLayout = {
  id: "douala",
  name: "Douala",
  mapKey: "douala",
  width: 64,
  height: 30,
  roadRows: [16, 18],
  spawn: { x: 57, y: 17 },
  buildings: [
    house(0, 2),
    house(1, 10),
    house(2, 18),
    house(3, 26),
    house(4, 34),
    {
      slug: "douala-hospital",
      name: "Hôpital Laquintinie",
      kind: "hospital",
      x: 42,
      y: 8,
      w: 10,
      h: 7,
      doorX: 46,
      doorY: 14,
      roof: T.ROOF_BLUE,
      wall: T.WALL_WHITE,
      isFacility: true,
      units: [],
    },
    {
      slug: "douala-bus-station",
      name: "Gare Routière de Bonabéri",
      kind: "bus_station",
      x: 54,
      y: 10,
      w: 8,
      h: 5,
      doorX: 57,
      doorY: 14,
      roof: T.ROOF_YELLOW,
      wall: T.WALL_BRICK,
      isFacility: false,
      units: [],
    },
  ],
};

export const TOWNS: TownLayout[] = [DOUALA];

export function findBuilding(townId: string, slug: string): BuildingDef | undefined {
  return TOWNS.find((t) => t.id === townId)?.buildings.find((b) => b.slug === slug);
}
