import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import {
  FURNITURE_BY_KEY,
  HouseMsg,
  T,
  TILE,
  type ErrorPayload,
  type MovePayload,
} from "@cameroon-life/shared";
import { net, withAuth } from "../../lib/colyseus";
import { useAuth } from "../../store/auth";
import { useGame } from "../../store/game";
import { bridge } from "../bridge";
import { PlayerInput } from "../input";
import { Character } from "../entities/Character";
import { RemotePlayers } from "../entities/RemotePlayers";
import { buildInterior, type Interior } from "../interior";

interface HouseInit {
  unitId: string;
  label: string;
  townId: string;
  returnX: number;
  returnY: number;
}

interface NetFurniture {
  id: string;
  key: string;
  x: number;
  y: number;
  rotation: number;
}

interface Piece {
  id: string;
  key: string;
  x: number;
  y: number;
  sprites: Phaser.GameObjects.Image[];
  blocker: Phaser.GameObjects.Rectangle;
}

const SEND_INTERVAL_MS = 50;

export class HouseScene extends Phaser.Scene {
  private data2!: HouseInit;
  private room: Room | null = null;
  private interior: Interior | null = null;
  private player: Character | null = null;
  private body: Phaser.Physics.Arcade.Body | null = null;
  private input2!: PlayerInput;
  private remote: RemotePlayers | null = null;
  private pieces = new Map<string, Piece>();
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  private ghost: Phaser.GameObjects.Container | null = null;
  private ghostKey: string | null = null;
  private highlight: Phaser.GameObjects.Rectangle | null = null;
  private lastSent = { dir: "down", moving: false, at: 0 };
  private atDoor = false;
  private disposed = false;
  private unsubscribe: (() => void) | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("house");
  }

  init(data: HouseInit) {
    this.data2 = data;
    this.disposed = false;
    this.room = null;
    this.interior = null;
    this.player = null;
    this.body = null;
    this.remote = null;
    this.pieces = new Map();
    this.ghost = null;
    this.ghostKey = null;
    this.highlight = null;
    this.atDoor = false;
  }

  create() {
    const game = useGame.getState();
    game.setScene("house");
    game.setPrompt(null);
    this.cameras.main.setBackgroundColor("#1b1b24");
    this.cameras.main.setZoom(3);
    this.loadingText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, `Entering ${this.data2.label}…`, { fontFamily: "Nunito", fontSize: "18px", color: "#fff" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.loadingText.setPosition(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);
    this.input2 = new PlayerInput(this);
    this.blockers = this.physics.add.staticGroup();

    bridge.on("interact", this.tryExit, this);
    bridge.on("exit-house", this.exitHouse, this);
    bridge.on("remove-selected", this.removeSelected, this);
    bridge.on("appearance-changed", this.onAppearanceChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    void this.connect();
  }

  // -------------------------------------------------------------------
  private async connect() {
    const game = useGame.getState();
    try {
      const client = await withAuth();
      const room = await client.joinOrCreate("house", { unitId: this.data2.unitId });
      if (this.disposed) {
        await room.leave();
        return;
      }
      this.room = room;
      net.house = room;
      game.setConnected(true);
      await this.waitForState(room);
      this.buildRoom(room);
    } catch (err) {
      console.error(err);
      game.toast(`Could not enter: ${(err as Error).message}`, "error");
      this.returnToTown();
    }
  }

  /** The first state patch arrives right after join; wait until width is known. */
  private waitForState(room: Room): Promise<void> {
    return new Promise((resolve) => {
      const check = () => (room.state as { width?: number }).width ? resolve() : room.onStateChange.once(() => check());
      check();
    });
  }

  private buildRoom(room: Room) {
    const state = room.state as { width: number; height: number; label: string; ownerId: string; tenantId: string; furniture: unknown };
    const me = useAuth.getState().me;
    const isOwner = !!me && state.ownerId === me.id;
    const canEdit = isOwner || (!!me && state.tenantId === me.id);
    useGame.getState().setHouse({ unitId: this.data2.unitId, label: state.label || this.data2.label, canEdit, isOwner });

    this.loadingText?.destroy();
    this.loadingText = null;

    const interior = buildInterior(this, state.width, state.height, "home");
    this.interior = interior;

    const spawn = interior.toWorld(interior.door.x, interior.door.y);
    this.player = new Character(this, spawn.x + TILE / 2, spawn.y + TILE, me?.first_name ?? "You", {
      hair: me?.hair ?? 0,
      skin: me?.skin ?? 0,
      clothes: me?.clothes ?? 0,
    });
    this.player.setMotion("up", false, true);
    this.physics.add.existing(this.player);
    this.body = this.player.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(10, 8).setOffset(-5, -8);
    this.physics.world.setBounds(0, 0, interior.widthPx, interior.heightPx);
    this.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, interior.walls);
    this.physics.add.collider(this.player, this.blockers);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, interior.widthPx, interior.heightPx);
    cam.startFollow(this.player, true, 0.2, 0.2);
    cam.setRoundPixels(true);
    // Small rooms: keep the whole interior centred instead of scrolling.
    if (interior.widthPx * 3 < this.scale.width && interior.heightPx * 3 < this.scale.height) {
      cam.stopFollow();
      cam.centerOn(interior.widthPx / 2, interior.heightPx / 2);
    }

    this.remote = new RemotePlayers(this, room, room.sessionId);

    // furniture sync
    const $ = getStateCallbacks(room) as unknown as (s: unknown) => any;
    $(room.state).furniture.onAdd((f: NetFurniture) => {
      this.addPiece(f);
      $(f).onChange(() => this.movePiece(f));
    });
    $(room.state).furniture.onRemove((f: NetFurniture) => this.removePiece(f.id));

    room.onMessage(HouseMsg.ERROR, (e: ErrorPayload) => useGame.getState().toast(e.message, "error"));
    room.onLeave((code) => {
      net.house = null;
      if (!this.disposed && code !== 1000 && code < 4000) {
        useGame.getState().toast("Disconnected from the house.", "error");
        this.returnToTown();
      }
    });

    // edit mode wiring
    this.highlight = this.add.rectangle(0, 0, TILE, TILE, 0xffffff, 0).setOrigin(0).setStrokeStyle(1, 0xffe066).setVisible(false).setDepth(5000);
    this.unsubscribe = useGame.subscribe((s, prev) => {
      if (s.placingKey !== prev.placingKey) this.setGhost(s.placingKey);
      if (s.selectedFurnitureId !== prev.selectedFurnitureId) this.updateHighlight(s.selectedFurnitureId);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
  }

  // -------------------------------------------------------------------
  // Furniture rendering
  // -------------------------------------------------------------------
  private addPiece(f: NetFurniture) {
    if (!this.interior || this.pieces.has(f.id)) return;
    const def = FURNITURE_BY_KEY[f.key];
    if (!def) return;
    const sprites: Phaser.GameObjects.Image[] = [];
    for (let j = 0; j < def.h; j++) {
      for (let i = 0; i < def.w; i++) {
        const img = this.add.image(0, 0, "tiles-sheet", def.frames[j * def.w + i]).setOrigin(0);
        sprites.push(img);
      }
    }
    const blocker = this.add.rectangle(0, 0, def.w * TILE, def.h * TILE, 0, 0).setOrigin(0);
    this.physics.add.existing(blocker, true);
    this.blockers.add(blocker);
    const piece: Piece = { id: f.id, key: f.key, x: f.x, y: f.y, sprites, blocker };
    this.pieces.set(f.id, piece);
    this.layoutPiece(piece);
  }

  private layoutPiece(p: Piece) {
    if (!this.interior) return;
    const def = FURNITURE_BY_KEY[p.key];
    const { x, y } = this.interior.toWorld(p.x, p.y);
    let i = 0;
    for (let j = 0; j < def.h; j++) {
      for (let k = 0; k < def.w; k++) {
        const img = p.sprites[i++];
        img.setPosition(x + k * TILE, y + j * TILE);
        // sort by the bottom edge so players walk "behind" tall items
        img.setDepth(y + def.h * TILE - 1);
      }
    }
    p.blocker.setPosition(x, y);
    (p.blocker.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
  }

  private movePiece(f: NetFurniture) {
    const p = this.pieces.get(f.id);
    if (!p) return;
    p.x = f.x;
    p.y = f.y;
    this.layoutPiece(p);
    if (useGame.getState().selectedFurnitureId === p.id) this.updateHighlight(p.id);
  }

  private removePiece(id: string) {
    const p = this.pieces.get(id);
    if (!p) return;
    p.sprites.forEach((s) => s.destroy());
    this.blockers.remove(p.blocker, true, true);
    this.pieces.delete(id);
    if (useGame.getState().selectedFurnitureId === id) useGame.getState().setSelectedFurnitureId(null);
  }

  private pieceAtTile(tx: number, ty: number): Piece | null {
    for (const p of this.pieces.values()) {
      const def = FURNITURE_BY_KEY[p.key];
      if (tx >= p.x && tx < p.x + def.w && ty >= p.y && ty < p.y + def.h) return p;
    }
    return null;
  }

  /** Mirrors the server's placement rules so the ghost can show validity. */
  private canPlaceAt(key: string, tx: number, ty: number, ignoreId?: string): boolean {
    const i = this.interior;
    const def = FURNITURE_BY_KEY[key];
    if (!i || !def) return false;
    const w = i.map.width - 2;
    const h = i.map.height - 2;
    if (tx < 0 || ty < 0 || tx + def.w > w || ty + def.h > h) return false;
    for (let j = 0; j < def.h; j++) {
      for (let k = 0; k < def.w; k++) {
        const x = tx + k;
        const y = ty + j;
        if (x === i.door.x && y === i.door.y) return false;
        const hit = this.pieceAtTile(x, y);
        if (hit && hit.id !== ignoreId) return false;
      }
    }
    return true;
  }

  // -------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------
  private setGhost(key: string | null) {
    this.ghost?.destroy();
    this.ghost = null;
    this.ghostKey = key;
    if (!key || !FURNITURE_BY_KEY[key]) return;
    const def = FURNITURE_BY_KEY[key];
    const items: Phaser.GameObjects.GameObject[] = [];
    for (let j = 0; j < def.h; j++) {
      for (let i = 0; i < def.w; i++) {
        items.push(this.add.image(i * TILE, j * TILE, "tiles-sheet", def.frames[j * def.w + i]).setOrigin(0).setAlpha(0.7));
      }
    }
    const bg = this.add.image(0, 0, "tiles-sheet", T.PLACE_OK).setOrigin(0).setDisplaySize(def.w * TILE, def.h * TILE).setName("bg");
    this.ghost = this.add.container(0, 0, [bg, ...items]).setDepth(6000).setVisible(false);
  }

  private updateHighlight(id: string | null) {
    if (!this.highlight || !this.interior) return;
    const p = id ? this.pieces.get(id) : null;
    if (!p) {
      this.highlight.setVisible(false);
      return;
    }
    const def = FURNITURE_BY_KEY[p.key];
    const { x, y } = this.interior.toWorld(p.x, p.y);
    this.highlight.setPosition(x, y).setSize(def.w * TILE, def.h * TILE).setVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.ghost || !this.ghostKey || !this.interior) return;
    const t = this.interior.toTile(pointer.worldX, pointer.worldY);
    const { x, y } = this.interior.toWorld(t.x, t.y);
    this.ghost.setPosition(x, y).setVisible(true);
    const ok = this.canPlaceAt(this.ghostKey, t.x, t.y);
    (this.ghost.getByName("bg") as Phaser.GameObjects.Image).setFrame(ok ? T.PLACE_OK : T.PLACE_BAD);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.interior || !this.room) return;
    const game = useGame.getState();
    if (!game.house?.canEdit) return;
    const t = this.interior.toTile(pointer.worldX, pointer.worldY);

    if (game.placingKey) {
      if (!this.canPlaceAt(game.placingKey, t.x, t.y)) {
        game.toast("Can't place it there.", "error");
        return;
      }
      this.room.send(HouseMsg.PLACE_FURNITURE, { key: game.placingKey, x: t.x, y: t.y });
      return;
    }

    const hit = this.pieceAtTile(t.x, t.y);
    if (hit) {
      game.setSelectedFurnitureId(hit.id === game.selectedFurnitureId ? null : hit.id);
      return;
    }
    if (game.selectedFurnitureId) {
      const sel = this.pieces.get(game.selectedFurnitureId);
      if (sel && this.canPlaceAt(sel.key, t.x, t.y, sel.id)) {
        this.room.send(HouseMsg.MOVE_FURNITURE, { id: sel.id, x: t.x, y: t.y });
      } else {
        game.toast("Can't move it there.", "error");
      }
    }
  }

  private removeSelected() {
    const id = useGame.getState().selectedFurnitureId;
    if (id && this.room) this.room.send(HouseMsg.REMOVE_FURNITURE, { id });
  }

  // -------------------------------------------------------------------
  // Exit
  // -------------------------------------------------------------------
  private tryExit() {
    if (this.atDoor) this.exitHouse();
  }

  private exitHouse() {
    if (this.disposed) return;
    this.returnToTown();
  }

  private returnToTown() {
    const { townId, returnX, returnY } = this.data2;
    this.scene.start("town", { townId, x: returnX, y: returnY });
  }

  private onAppearanceChanged() {
    const me = useAuth.getState().me;
    if (me && this.player) this.player.setAppearance(me);
  }

  private sendMove(force = false) {
    if (!this.room || !this.player || !this.body) return;
    const now = this.time.now;
    const moving = this.body.velocity.lengthSq() > 0;
    const dir = this.player.dir;
    const changed = moving || this.lastSent.moving !== moving || this.lastSent.dir !== dir;
    if (!force && (!changed || now - this.lastSent.at < SEND_INTERVAL_MS)) return;
    const payload: MovePayload = { x: this.player.x, y: this.player.y, dir, moving };
    this.room.send(HouseMsg.MOVE, payload);
    this.lastSent = { dir, moving, at: now };
  }

  update(_time: number, delta: number) {
    if (!this.player || !this.body || !this.interior) return;
    const input = this.input2.read();
    this.body.setVelocity(input.vx, input.vy);
    if (input.dir) this.player.setMotion(input.dir, true);
    else this.player.setMotion(this.player.dir, false);
    this.player.setDepth(this.player.y);
    this.sendMove();
    this.remote?.update(delta);

    const t = this.interior.toTile(this.player.x, this.player.y - 1);
    const atDoor = t.x === this.interior.door.x && t.y === this.interior.door.y;
    if (atDoor !== this.atDoor) {
      this.atDoor = atDoor;
      useGame.getState().setPrompt(atDoor ? { text: "Leave the house", action: () => this.exitHouse() } : null);
    }
    if (this.input2.interactPressed()) this.tryExit();
    if (this.input2.deletePressed()) this.removeSelected();
    if (this.input2.escapePressed()) {
      const g = useGame.getState();
      if (g.placingKey) g.setPlacingKey(null);
      else if (g.selectedFurnitureId) g.setSelectedFurnitureId(null);
    }
  }

  private cleanup() {
    this.disposed = true;
    bridge.off("interact", this.tryExit, this);
    bridge.off("exit-house", this.exitHouse, this);
    bridge.off("remove-selected", this.removeSelected, this);
    bridge.off("appearance-changed", this.onAppearanceChanged, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.remote?.destroy();
    this.remote = null;
    const game = useGame.getState();
    game.setPrompt(null);
    game.setHouse(null);
    if (this.room) {
      const r = this.room;
      this.room = null;
      if (net.house === r) net.house = null;
      void r.leave(true);
    }
  }
}
