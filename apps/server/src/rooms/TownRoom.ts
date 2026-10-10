import { Room, type AuthContext, type Client } from "colyseus";
import {
  DOOR_INTERACT_RADIUS,
  PATCH_RATE_MS,
  TILE,
  TOWNS,
  TownMsg,
  doorZone,
  townRoomId,
  type BuildingDef,
  type EnterBuildingPayload,
  type EnterResultPayload,
  type ErrorPayload,
  type MovePayload,
  type TownJoinOptions,
  type TownLayout,
  type WorkAnswerPayload,
  type WorkResultPayload,
  type WorkStatePayload,
} from "@cameroon-life/shared";
import { PlayerSchema, TownState } from "../schema/TownState.ts";
import {
  getActiveEmployment,
  getBuildingBySlug,
  getProfile,
  getUnitsForBuilding,
  startShift,
  verifyToken,
  type AuthedUser,
} from "../services/db.ts";
import { WorkSession } from "../services/work.ts";

const MAX_STEP_PX = 96; // anti-teleport: max distance between two move messages
const DIRECTIONS = new Set(["up", "down", "left", "right"]);

/**
 * One room per town (roomId "town_douala"). Handles street movement,
 * building entry checks and Go-To-Work shifts at facilities.
 */
export class TownRoom extends Room<TownState> {
  maxClients = 200;
  autoDispose = false;

  private layout!: TownLayout;
  private sessions = new Map<string, WorkSession>(); // sessionId -> work session

  static async onAuth(token: string, _options: TownJoinOptions, _ctx: AuthContext): Promise<AuthedUser> {
    const user = await verifyToken(token);
    if (!user) throw new Error("Invalid or expired session. Please sign in again.");
    return user;
  }

  onCreate(options: TownJoinOptions) {
    const townId = options?.townId ?? "douala";
    const layout = TOWNS.find((t) => t.id === townId);
    if (!layout) throw new Error(`Unknown town: ${townId}`);
    this.layout = layout;
    this.roomId = townRoomId(townId);
    this.setPatchRate(PATCH_RATE_MS);
    this.setState(new TownState());
    this.state.townId = townId;
    this.setMetadata({ townId, name: layout.name });

    this.onMessage(TownMsg.MOVE, (client, msg: MovePayload) => this.handleMove(client, msg));
    this.onMessage(TownMsg.ENTER_BUILDING, (client, msg: EnterBuildingPayload) => void this.handleEnter(client, msg));
    this.onMessage(TownMsg.EXIT_BUILDING, (client) => void this.handleExit(client));
    this.onMessage(TownMsg.START_WORK, (client) => void this.handleStartWork(client));
    this.onMessage(TownMsg.WORK_ANSWER, (client, msg: WorkAnswerPayload) => this.sessions.get(client.sessionId)?.answer(msg));
    this.onMessage(TownMsg.STOP_WORK, (client) => void this.sessions.get(client.sessionId)?.abandon());
    this.onMessage(TownMsg.REFRESH_PROFILE, (client) => void this.refreshProfile(client));

    console.log(`[town] room ${this.roomId} created`);
  }

  onJoin(client: Client<unknown, AuthedUser>, options: TownJoinOptions & { x?: number; y?: number }) {
    const user = client.auth!;
    const p = new PlayerSchema();
    p.id = user.id;
    p.name = user.firstName;
    p.familyName = user.familyName;
    p.hair = user.hair;
    p.skin = user.skin;
    p.clothes = user.clothes;
    // Spawn at the town spawn point, or at the requested door after leaving a house.
    const spawnX = this.layout.spawn.x * TILE + TILE / 2;
    const spawnY = this.layout.spawn.y * TILE + TILE / 2;
    p.x = this.clampX(typeof options?.x === "number" ? options.x : spawnX);
    p.y = this.clampY(typeof options?.y === "number" ? options.y : spawnY);
    this.state.players.set(client.sessionId, p);
    console.log(`[town] ${user.firstName} ${user.familyName} joined ${this.roomId}`);
  }

  async onLeave(client: Client, _consented: boolean) {
    const session = this.sessions.get(client.sessionId);
    if (session) await session.abandon();
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log(`[town] room ${this.roomId} disposed`);
  }

  // ---------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------
  private clampX(x: number) {
    return Math.max(TILE, Math.min(this.layout.width * TILE - TILE, x));
  }
  private clampY(y: number) {
    return Math.max(TILE, Math.min(this.layout.height * TILE - TILE, y));
  }

  private handleMove(client: Client, msg: MovePayload) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.inside) return;
    if (typeof msg?.x !== "number" || typeof msg?.y !== "number" || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const x = this.clampX(msg.x);
    const y = this.clampY(msg.y);
    const dist = Math.hypot(x - p.x, y - p.y);
    if (dist > MAX_STEP_PX) {
      // suspicious jump: keep the server position and tell the client
      client.send(TownMsg.ERROR, { code: "move_rejected", message: "Movement rejected" } satisfies ErrorPayload);
      return;
    }
    p.x = x;
    p.y = y;
    if (DIRECTIONS.has(msg.dir)) p.dir = msg.dir;
    p.moving = !!msg.moving;
  }

  private nearDoor(p: PlayerSchema, b: BuildingDef): boolean {
    const z = doorZone(b);
    const cx = z.x * TILE + TILE / 2;
    const cy = z.y * TILE + TILE / 2;
    return Math.hypot(p.x - cx, p.y - cy) <= DOOR_INTERACT_RADIUS;
  }

  // ---------------------------------------------------------------------
  // Buildings
  // ---------------------------------------------------------------------
  private async handleEnter(client: Client<unknown, AuthedUser>, msg: EnterBuildingPayload) {
    const p = this.state.players.get(client.sessionId);
    const slug = msg?.buildingSlug;
    const def = this.layout.buildings.find((b) => b.slug === slug);
    const reply = (r: EnterResultPayload) => client.send(TownMsg.ENTER_RESULT, r);
    if (!p || !def) return reply({ ok: false, buildingSlug: slug, kind: "none", reason: "Unknown building." });
    if (!this.nearDoor(p, def)) return reply({ ok: false, buildingSlug: slug, kind: "none", reason: "Walk up to the door first." });

    if (def.kind === "bus_station" || def.kind === "train_station" || def.kind === "airport") {
      return reply({ ok: false, buildingSlug: slug, kind: "transport", reason: `${def.name}: inter-town travel arrives in Phase 2.` });
    }

    const building = await getBuildingBySlug(slug);
    if (!building) return reply({ ok: false, buildingSlug: slug, kind: "none", reason: "Building not found in database (run the seed)." });

    if (def.isFacility) {
      const emp = await getActiveEmployment(client.auth!.id);
      if (!emp || emp.job.building_id !== building.id) {
        return reply({
          ok: false,
          buildingSlug: slug,
          kind: "facility",
          reason: `You don't work at ${def.name}. Apply via Phone > Jobs.`,
        });
      }
      p.inside = slug;
      p.moving = false;
      return reply({
        ok: true,
        buildingSlug: slug,
        kind: "facility",
        employmentId: emp.employment.id,
        jobTitle: emp.job.title,
        salary: emp.employment.salary,
      });
    }

    // Residential: find the unit and check access
    const units = await getUnitsForBuilding(building.id);
    const unit = units[0];
    if (!unit) return reply({ ok: false, buildingSlug: slug, kind: "house", reason: "No unit here yet." });
    const uid = client.auth!.id;
    const leaseActive = unit.tenant_id === uid && (!unit.lease_until || new Date(unit.lease_until) > new Date());
    const canEnter = unit.owner_id === uid || leaseActive || unit.listing_status !== "none";
    if (!canEnter) {
      return reply({ ok: false, buildingSlug: slug, kind: "house", unitLabel: unit.label, reason: `${unit.label} is private property.` });
    }
    return reply({ ok: true, buildingSlug: slug, kind: "house", unitId: unit.id, unitLabel: unit.label });
  }

  private async handleExit(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const session = this.sessions.get(client.sessionId);
    if (session) await session.abandon();
    p.inside = "";
    p.working = false;
  }

  // ---------------------------------------------------------------------
  // Work
  // ---------------------------------------------------------------------
  private async handleStartWork(client: Client<unknown, AuthedUser>) {
    const p = this.state.players.get(client.sessionId);
    const fail = (message: string) => client.send(TownMsg.ERROR, { code: "work", message } satisfies ErrorPayload);
    if (!p) return;
    if (!p.inside) return fail("Go to your workplace first.");
    if (this.sessions.has(client.sessionId)) return fail("You are already working.");

    const def = this.layout.buildings.find((b) => b.slug === p.inside);
    const building = def ? await getBuildingBySlug(def.slug) : null;
    if (!def || !building || !def.isFacility) return fail("This is not a workplace.");

    const emp = await getActiveEmployment(client.auth!.id);
    if (!emp || emp.job.building_id !== building.id) return fail("You don't work here.");

    let shift;
    try {
      shift = await startShift(client.auth!.id);
    } catch (err) {
      return fail((err as Error).message);
    }

    const session = new WorkSession(client, this.clock, shift, def.slug, (s, result) => this.onShiftFinished(client, s, result));
    this.sessions.set(client.sessionId, session);
    p.working = true;
  }

  private onShiftFinished(client: Client, session: WorkSession, result: WorkResultPayload) {
    if (this.sessions.get(client.sessionId) === session) this.sessions.delete(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (p) p.working = false;
    // the client may have disconnected (onLeave -> abandon)
    if (this.clients.includes(client)) {
      client.send(TownMsg.WORK_RESULT, result);
      client.send(TownMsg.WORK_STATE, { active: false } satisfies WorkStatePayload);
      if (typeof result.balance === "number") client.send(TownMsg.BALANCE, { balance: result.balance });
    }
  }

  private async refreshProfile(client: Client<unknown, AuthedUser>) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const profile = await getProfile(client.auth!.id);
    if (!profile) return;
    p.hair = profile.hair;
    p.skin = profile.skin;
    p.clothes = profile.clothes;
    p.name = profile.first_name;
    p.familyName = profile.family_name;
  }
}
