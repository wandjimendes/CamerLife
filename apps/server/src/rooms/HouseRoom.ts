import { Room, type AuthContext, type Client } from "colyseus";
import {
  FURNITURE_BY_KEY,
  HouseMsg,
  MAX_FURNITURE_PER_UNIT,
  PATCH_RATE_MS,
  TILE,
  houseRoomId,
  type ErrorPayload,
  type HouseJoinOptions,
  type MovePayload,
  type MoveFurniturePayload,
  type PlaceFurniturePayload,
  type RemoveFurniturePayload,
} from "@cameroon-life/shared";
import { PlayerSchema } from "../schema/TownState.ts";
import { FurnitureSchema, HouseState } from "../schema/HouseState.ts";
import {
  deleteFurniture,
  getFurniture,
  getUnit,
  insertFurniture,
  updateFurniturePosition,
  verifyToken,
  type AuthedUser,
} from "../services/db.ts";
import type { UnitRow } from "@cameroon-life/shared";

const DIRECTIONS = new Set(["up", "down", "left", "right"]);

/**
 * Instanced interior for a unit (roomId "house_{unitId}"). Anyone allowed in
 * sees the same furniture; only the owner / active tenant can edit it.
 */
export class HouseRoom extends Room<HouseState> {
  maxClients = 16;
  private unit!: UnitRow;

  static async onAuth(token: string, _options: HouseJoinOptions, _ctx: AuthContext): Promise<AuthedUser> {
    const user = await verifyToken(token);
    if (!user) throw new Error("Invalid or expired session. Please sign in again.");
    return user;
  }

  async onCreate(options: HouseJoinOptions) {
    const unitId = options?.unitId;
    if (!unitId) throw new Error("unitId required");
    const unit = await getUnit(unitId);
    if (!unit) throw new Error("Unit not found");
    this.unit = unit;
    this.roomId = houseRoomId(unitId);
    this.setPatchRate(PATCH_RATE_MS);
    this.setState(new HouseState());
    this.state.unitId = unit.id;
    this.state.label = unit.label;
    this.state.ownerId = unit.owner_id ?? "";
    this.state.tenantId = unit.tenant_id ?? "";
    this.state.width = unit.interior_w;
    this.state.height = unit.interior_h;
    this.setMetadata({ unitId, label: unit.label });

    for (const f of await getFurniture(unitId)) {
      const s = new FurnitureSchema();
      s.id = f.id;
      s.key = f.item_key;
      s.x = f.x;
      s.y = f.y;
      s.rotation = f.rotation;
      this.state.furniture.set(f.id, s);
    }

    this.onMessage(HouseMsg.MOVE, (client, msg: MovePayload) => this.handleMove(client, msg));
    this.onMessage(HouseMsg.PLACE_FURNITURE, (client, msg: PlaceFurniturePayload) => void this.handlePlace(client, msg));
    this.onMessage(HouseMsg.MOVE_FURNITURE, (client, msg: MoveFurniturePayload) => void this.handleMoveFurniture(client, msg));
    this.onMessage(HouseMsg.REMOVE_FURNITURE, (client, msg: RemoveFurniturePayload) => void this.handleRemove(client, msg));

    console.log(`[house] room ${this.roomId} created (${unit.label})`);
  }

  async onJoin(client: Client<unknown, AuthedUser>) {
    const user = client.auth!;
    // Re-read the unit so a fresh purchase / listing change is respected immediately.
    const unit = (await getUnit(this.unit.id)) ?? this.unit;
    this.unit = unit;
    this.state.ownerId = unit.owner_id ?? "";
    this.state.tenantId = unit.tenant_id ?? "";
    if (!this.canEnter(user.id)) {
      throw new Error("This home is private.");
    }
    const p = new PlayerSchema();
    p.id = user.id;
    p.name = user.firstName;
    p.familyName = user.familyName;
    p.hair = user.hair;
    p.skin = user.skin;
    p.clothes = user.clothes;
    // spawn on the door tile (bottom centre)
    p.x = Math.floor(unit.interior_w / 2) * TILE + TILE / 2;
    p.y = (unit.interior_h - 1) * TILE + TILE / 2;
    p.dir = "up";
    this.state.players.set(client.sessionId, p);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log(`[house] room ${this.roomId} disposed`);
  }

  // ---------------------------------------------------------------------
  private leaseActive(userId: string) {
    return this.unit.tenant_id === userId && (!this.unit.lease_until || new Date(this.unit.lease_until) > new Date());
  }

  private canEnter(userId: string) {
    return this.unit.owner_id === userId || this.leaseActive(userId) || this.unit.listing_status !== "none";
  }

  private canEdit(userId: string) {
    return this.unit.owner_id === userId || this.leaseActive(userId);
  }

  private handleMove(client: Client, msg: MovePayload) {
    const p = this.state.players.get(client.sessionId);
    if (!p || typeof msg?.x !== "number" || typeof msg?.y !== "number") return;
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    p.x = Math.max(0, Math.min(this.unit.interior_w * TILE, msg.x));
    p.y = Math.max(0, Math.min(this.unit.interior_h * TILE, msg.y));
    if (DIRECTIONS.has(msg.dir)) p.dir = msg.dir;
    p.moving = !!msg.moving;
  }

  /** Door tile must stay free so players can always spawn/exit. */
  private isDoorTile(x: number, y: number) {
    return y === this.unit.interior_h - 1 && x === Math.floor(this.unit.interior_w / 2);
  }

  private footprintFree(key: string, x: number, y: number, ignoreId?: string): string | null {
    const def = FURNITURE_BY_KEY[key];
    if (!def) return "Unknown furniture.";
    if (!Number.isInteger(x) || !Number.isInteger(y)) return "Invalid position.";
    if (x < 0 || y < 0 || x + def.w > this.unit.interior_w || y + def.h > this.unit.interior_h) return "Out of bounds.";
    for (let j = 0; j < def.h; j++) {
      for (let i = 0; i < def.w; i++) {
        if (this.isDoorTile(x + i, y + j)) return "Keep the doorway clear.";
      }
    }
    for (const [id, f] of this.state.furniture) {
      if (id === ignoreId) continue;
      const other = FURNITURE_BY_KEY[f.key];
      if (!other) continue;
      const overlap = x < f.x + other.w && x + def.w > f.x && y < f.y + other.h && y + def.h > f.y;
      if (overlap) return "That spot is taken.";
    }
    return null;
  }

  private error(client: Client, message: string) {
    client.send(HouseMsg.ERROR, { code: "furniture", message } satisfies ErrorPayload);
  }

  private async handlePlace(client: Client<unknown, AuthedUser>, msg: PlaceFurniturePayload) {
    if (!this.canEdit(client.auth!.id)) return this.error(client, "Only the owner or tenant can decorate.");
    if (this.state.furniture.size >= MAX_FURNITURE_PER_UNIT) return this.error(client, "Furniture limit reached.");
    const problem = this.footprintFree(msg?.key, msg?.x, msg?.y);
    if (problem) return this.error(client, problem);

    const row = await insertFurniture({ unit_id: this.unit.id, item_key: msg.key, x: msg.x, y: msg.y, placed_by: client.auth!.id });
    if (!row) return this.error(client, "Could not save furniture.");
    const s = new FurnitureSchema();
    s.id = row.id;
    s.key = row.item_key;
    s.x = row.x;
    s.y = row.y;
    s.rotation = row.rotation;
    this.state.furniture.set(row.id, s);
  }

  private async handleMoveFurniture(client: Client<unknown, AuthedUser>, msg: MoveFurniturePayload) {
    if (!this.canEdit(client.auth!.id)) return this.error(client, "Only the owner or tenant can decorate.");
    const f = this.state.furniture.get(msg?.id);
    if (!f) return;
    const problem = this.footprintFree(f.key, msg.x, msg.y, f.id);
    if (problem) return this.error(client, problem);
    const prevX = f.x;
    const prevY = f.y;
    f.x = msg.x;
    f.y = msg.y;
    if (!(await updateFurniturePosition(f.id, msg.x, msg.y))) {
      f.x = prevX;
      f.y = prevY;
    }
  }

  private async handleRemove(client: Client<unknown, AuthedUser>, msg: RemoveFurniturePayload) {
    if (!this.canEdit(client.auth!.id)) return this.error(client, "Only the owner or tenant can decorate.");
    const f = this.state.furniture.get(msg?.id);
    if (!f) return;
    if (await deleteFurniture(f.id)) this.state.furniture.delete(f.id);
  }
}
