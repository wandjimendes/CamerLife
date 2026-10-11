import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  T,
  TILE,
  TownMsg,
  type EnterResultPayload,
  type ErrorPayload,
  type MovePayload,
  type WorkPromptPayload,
  type WorkResultPayload,
  type WorkStatePayload,
} from "@cameroon-life/shared";
import { net, withAuth } from "../../lib/colyseus";
import { useAuth } from "../../store/auth";
import { useGame } from "../../store/game";
import { bridge } from "../bridge";
import { PlayerInput } from "../input";
import { Character } from "../entities/Character";
import { RemotePlayers } from "../entities/RemotePlayers";
import { gameZoom } from "../interior";
import { SMALL_SCREEN } from "../touch";

interface TownInit {
  townId: string;
  x?: number;
  y?: number;
}

interface DoorZone {
  slug: string;
  name: string;
  kind: string;
  isFacility: boolean;
  rect: Phaser.Geom.Rectangle;
}

const SEND_INTERVAL_MS = 50;

export class TownScene extends Phaser.Scene {
  private townId = "douala";
  private spawn = { x: 0, y: 0 };
  private room: Room | null = null;
  private player!: Character;
  private body!: Phaser.Physics.Arcade.Body;
  private input2!: PlayerInput;
  private remote: RemotePlayers | null = null;
  private doors: DoorZone[] = [];
  private activeDoor: DoorZone | null = null;
  private lastSent = { x: 0, y: 0, dir: "down", moving: false, at: 0 };
  private pendingEnter = false;
  private disposed = false;

  constructor() {
    super("town");
  }

  init(data: TownInit) {
    this.townId = data?.townId ?? "douala";
    if (typeof data?.x === "number" && typeof data?.y === "number") this.spawn = { x: data.x, y: data.y };
    else this.spawn = { x: 0, y: 0 };
    this.disposed = false;
    this.room = null;
    this.remote = null;
    this.activeDoor = null;
    this.pendingEnter = false;
  }

  create() {
    const game = useGame.getState();
    game.setScene("town");
    game.setHouse(null);
    game.setFacility(null);

    // --- map ---
    const map = this.make.tilemap({ key: `map-${this.townId}` });
    const tileset = map.addTilesetImage("cozy-tiles", "tiles")!;
    map.createLayer("Ground", tileset, 0, 0);
    map.createLayer("Roads", tileset, 0, 0);
    map.createLayer("Buildings", tileset, 0, 0);
    map.createLayer("Decor", tileset, 0, 0);
    const collision = map.createLayer("Collision", tileset, 0, 0)!;
    collision.setVisible(false);
    collision.setCollision(T.COLLISION + 1);

    // --- doors + spawn ---
    const objects = map.getObjectLayer("Objects")?.objects ?? [];
    this.doors = [];
    for (const o of objects) {
      const props = Object.fromEntries((o.properties ?? []).map((p: { name: string; value: unknown }) => [p.name, p.value]));
      if (o.type === "door") {
        this.doors.push({
          slug: String(props.buildingSlug),
          name: o.name ?? "",
          kind: String(props.kind ?? ""),
          isFacility: Boolean(props.isFacility),
          rect: new Phaser.Geom.Rectangle((o.x ?? 0) - 4, (o.y ?? 0) - 4, (o.width ?? TILE) + 8, (o.height ?? TILE) + 8),
        });
      } else if (o.type === "spawn" && !this.spawn.x) {
        this.spawn = { x: o.x ?? 0, y: o.y ?? 0 };
      }
    }

    // --- local player ---
    const me = useAuth.getState().me;
    this.player = new Character(this, this.spawn.x, this.spawn.y, me?.first_name ?? "You", {
      hair: me?.hair ?? 0,
      skin: me?.skin ?? 0,
      clothes: me?.clothes ?? 0,
    });
    this.physics.add.existing(this.player);
    this.body = this.player.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(10, 8).setOffset(-5, -8);
    this.body.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, collision);

    // --- cameras ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setZoom(gameZoom(this));
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);

    // mini-map showing the facades of the whole street; sits under the HUD bar on phones
    const mini = this.cameras.add(0, 0, 192, 64, false, "minimap");
    mini.setBackgroundColor(0x000000);
    mini.setAlpha(0.9);
    const layoutMini = () => {
      const small = this.scale.width < SMALL_SCREEN;
      const miniW = small ? 144 : 192;
      const miniH = Math.round((miniW * map.heightInPixels) / map.widthInPixels);
      mini.setSize(miniW, miniH).setPosition(this.scale.width - miniW - 12, small ? 72 : 12);
      mini.setZoom(miniW / map.widthInPixels).setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      mini.centerOn(map.widthInPixels / 2, map.heightInPixels / 2);
      cam.setZoom(gameZoom(this));
    };
    layoutMini();
    this.scale.on("resize", layoutMini);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", layoutMini));

    this.input2 = new PlayerInput(this);

    // React -> Phaser
    bridge.on("interact", this.interact, this);
    bridge.on("exit-facility", this.exitFacility, this);
    bridge.on("appearance-changed", this.onAppearanceChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    void this.connect();
  }

  // -------------------------------------------------------------------
  // Networking
  // -------------------------------------------------------------------
  private async connect() {
    const g = useGame.getState();
    try {
      const client = await withAuth();
      const room = await client.joinOrCreate("town", { townId: this.townId, x: this.spawn.x, y: this.spawn.y });
      if (this.disposed) {
        await room.leave();
        return;
      }
      this.room = room;
      net.town = room;
      g.setConnected(true);
      this.remote = new RemotePlayers(this, room, room.sessionId);

      room.onMessage(TownMsg.ENTER_RESULT, (r: EnterResultPayload) => this.onEnterResult(r));
      room.onMessage(TownMsg.WORK_STATE, (s: WorkStatePayload) => useGame.getState().setWork(s.active ? s : null));
      room.onMessage(TownMsg.WORK_PROMPT, (p: WorkPromptPayload) => useGame.getState().setWorkPrompt(p));
      room.onMessage(TownMsg.WORK_RESULT, (r: WorkResultPayload) => {
        const game = useGame.getState();
        game.setWorkPrompt(null);
        game.setWork(null);
        game.toast(r.message, r.status === "completed" ? "success" : "error");
        if (typeof r.balance === "number") useAuth.getState().setBalance(r.balance);
      });
      room.onMessage(TownMsg.BALANCE, (b: { balance: number }) => useAuth.getState().setBalance(b.balance));
      room.onMessage(TownMsg.ERROR, (e: ErrorPayload) => {
        if (e.code === "move_rejected") return; // silent correction
        useGame.getState().toast(e.message, "error");
      });
      room.onError((code, message) => useGame.getState().toast(`Connection error ${code}: ${message ?? ""}`, "error"));
      room.onLeave((code) => {
        net.town = null;
        useGame.getState().setConnected(false);
        if (!this.disposed && code !== 1000 && code < 4000) {
          useGame.getState().toast("Disconnected from Douala - reconnecting…", "error");
          this.time.delayedCall(2000, () => {
            if (!this.disposed) this.scene.restart({ townId: this.townId, x: this.player.x, y: this.player.y });
          });
        }
      });
    } catch (err) {
      console.error(err);
      g.setConnected(false);
      g.toast(`Could not join Douala: ${(err as Error).message}`, "error");
    }
  }

  private sendMove(force = false) {
    if (!this.room) return;
    const now = this.time.now;
    const moving = this.body.velocity.lengthSq() > 0;
    const dir = this.player.dir;
    const changed = moving || this.lastSent.moving !== moving || this.lastSent.dir !== dir;
    if (!force && (!changed || now - this.lastSent.at < SEND_INTERVAL_MS)) return;
    const payload: MovePayload = { x: Math.round(this.player.x * 10) / 10, y: Math.round(this.player.y * 10) / 10, dir, moving };
    this.room.send(TownMsg.MOVE, payload);
    this.lastSent = { x: payload.x, y: payload.y, dir, moving, at: now };
  }

  // -------------------------------------------------------------------
  // Buildings
  // -------------------------------------------------------------------
  private interact() {
    if (!this.activeDoor || !this.room || this.pendingEnter) return;
    if (!this.scene.isActive()) return;
    this.pendingEnter = true;
    this.room.send(TownMsg.ENTER_BUILDING, { buildingSlug: this.activeDoor.slug });
    this.time.delayedCall(4000, () => (this.pendingEnter = false));
  }

  private onEnterResult(r: EnterResultPayload) {
    this.pendingEnter = false;
    const game = useGame.getState();
    if (!r.ok) {
      game.toast(r.reason ?? "You can't enter here.", r.kind === "transport" ? "info" : "error");
      return;
    }
    const door = this.doors.find((d) => d.slug === r.buildingSlug);
    if (r.kind === "house" && r.unitId) {
      void this.goToHouse(r.unitId, r.unitLabel ?? door?.name ?? "Home", door);
    } else if (r.kind === "facility") {
      game.setFacility({
        buildingSlug: r.buildingSlug,
        name: door?.name ?? r.buildingSlug,
        jobTitle: r.jobTitle ?? "Employee",
        salary: r.salary ?? 0,
      });
      game.setPrompt(null);
      this.body.setVelocity(0, 0);
      this.player.setMotion(this.player.dir, false);
      this.sendMove(true);
      this.scene.sleep();
      this.scene.launch("facility", { buildingSlug: r.buildingSlug, name: door?.name ?? "" });
    }
  }

  private exitFacility() {
    if (!this.scene.isSleeping()) return;
    this.room?.send(TownMsg.EXIT_BUILDING);
    const game = useGame.getState();
    game.setFacility(null);
    game.setWork(null);
    game.setWorkPrompt(null);
    this.scene.stop("facility");
    this.scene.wake();
    game.setScene("town");
  }

  private async goToHouse(unitId: string, label: string, door?: DoorZone) {
    const returnX = door ? door.rect.centerX : this.player.x;
    const returnY = door ? door.rect.centerY + 6 : this.player.y;
    useGame.getState().setPrompt(null);
    const room = this.room;
    this.room = null;
    net.town = null;
    try {
      await room?.leave(true);
    } catch {
      /* ignore */
    }
    this.scene.start("house", { unitId, label, townId: this.townId, returnX, returnY });
  }

  private onAppearanceChanged() {
    const me = useAuth.getState().me;
    if (me) this.player.setAppearance(me);
    this.room?.send(TownMsg.REFRESH_PROFILE);
  }

  // -------------------------------------------------------------------
  update(_time: number, delta: number) {
    const input = this.input2.read();
    this.body.setVelocity(input.vx, input.vy);
    if (input.dir) this.player.setMotion(input.dir, true);
    else this.player.setMotion(this.player.dir, false);
    this.player.setDepth(this.player.y);
    this.sendMove();
    this.remote?.update(delta);

    // door proximity -> interaction prompt
    const px = this.player.x;
    const py = this.player.y;
    const door = this.doors.find((d) => d.rect.contains(px, py)) ?? null;
    if (door !== this.activeDoor) {
      this.activeDoor = door;
      const game = useGame.getState();
      if (door) {
        const verb = door.kind === "bus_station" ? "Travel from" : door.isFacility ? "Go to work at" : "Enter";
        game.setPrompt({ text: `${verb} ${door.name}`, action: () => this.interact() });
      } else {
        game.setPrompt(null);
      }
    }
    if (this.input2.interactPressed()) this.interact();
  }

  private cleanup() {
    this.disposed = true;
    bridge.off("interact", this.interact, this);
    bridge.off("exit-facility", this.exitFacility, this);
    bridge.off("appearance-changed", this.onAppearanceChanged, this);
    this.remote?.destroy();
    this.remote = null;
    useGame.getState().setPrompt(null);
    if (this.room) {
      const r = this.room;
      this.room = null;
      if (net.town === r) net.town = null;
      void r.leave(true);
    }
  }
}
