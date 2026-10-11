import Phaser from "phaser";
import { T, TILE } from "@cameroon-life/shared";
import { useAuth } from "../../store/auth";
import { useGame } from "../../store/game";
import { bridge } from "../bridge";
import { PlayerInput } from "../input";
import { Character } from "../entities/Character";
import { buildInterior, type Interior } from "../interior";

interface FacilityInit {
  buildingSlug: string;
  name: string;
}

/**
 * Workplace interior (e.g. the hospital). The town room stays connected in
 * the background; shifts are driven by the WorkPanel overlay.
 */
export class FacilityScene extends Phaser.Scene {
  private data2!: FacilityInit;
  private player!: Character;
  private body!: Phaser.Physics.Arcade.Body;
  private input2!: PlayerInput;
  private interior!: Interior;
  private atDoor = false;

  constructor() {
    super("facility");
  }

  init(data: FacilityInit) {
    this.data2 = data;
    this.atDoor = false;
  }

  create() {
    useGame.getState().setScene("facility");
    this.cameras.main.setBackgroundColor("#1b1b24");
    const W = 14;
    const H = 9;
    this.interior = buildInterior(this, W, H, "clinic");

    // fixed props
    const props = this.physics.add.staticGroup();
    const put = (frame: number, tx: number, ty: number) => {
      const { x, y } = this.interior.toWorld(tx, ty);
      this.add.image(x, y, "tiles-sheet", frame).setOrigin(0).setDepth(y + TILE - 1);
      const r = this.add.rectangle(x, y, TILE, TILE, 0, 0).setOrigin(0);
      this.physics.add.existing(r, true);
      props.add(r);
    };
    for (let i = 0; i < 4; i++) put(T.HOSPITAL_BED, 1 + i * 3, 1);
    put(T.RECEPTION, 6, 6);
    put(T.RECEPTION, 7, 6);
    put(T.PLANT, 0, 7);
    put(T.PLANT, 13, 7);
    put(T.DESK, 11, 3);
    put(T.CHAIR, 12, 3);
    put(T.BOOKSHELF, 13, 1);

    const me = useAuth.getState().me;
    const spawn = this.interior.toWorld(this.interior.door.x, this.interior.door.y);
    this.player = new Character(this, spawn.x + TILE / 2, spawn.y + TILE, me?.first_name ?? "You", {
      hair: me?.hair ?? 0,
      skin: me?.skin ?? 0,
      clothes: me?.clothes ?? 0,
    });
    this.player.setMotion("up", false, true);
    this.physics.add.existing(this.player);
    this.body = this.player.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(10, 8).setOffset(-5, -8);
    this.physics.world.setBounds(0, 0, this.interior.widthPx, this.interior.heightPx);
    this.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.interior.walls);
    this.physics.add.collider(this.player, props);

    const cam = this.cameras.main;
    cam.setZoom(3);
    cam.setBounds(0, 0, this.interior.widthPx, this.interior.heightPx);
    cam.startFollow(this.player, true, 0.2, 0.2);
    cam.setRoundPixels(true);

    this.add
      .text(this.interior.widthPx / 2, 4, this.data2.name, { fontFamily: "Nunito", fontSize: "7px", color: "#fff", stroke: "#000", strokeThickness: 2, resolution: 4 })
      .setOrigin(0.5, 0)
      .setDepth(9000);

    this.input2 = new PlayerInput(this);
    bridge.on("interact", this.tryExit, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bridge.off("interact", this.tryExit, this);
      useGame.getState().setPrompt(null);
    });
  }

  private tryExit() {
    if (this.atDoor && this.scene.isActive()) bridge.emit("exit-facility");
  }

  update() {
    const input = this.input2.read();
    this.body.setVelocity(input.vx, input.vy);
    if (input.dir) this.player.setMotion(input.dir, true);
    else this.player.setMotion(this.player.dir, false);
    this.player.setDepth(this.player.y);

    const t = this.interior.toTile(this.player.x, this.player.y - 1);
    const atDoor = t.x === this.interior.door.x && t.y === this.interior.door.y;
    if (atDoor !== this.atDoor) {
      this.atDoor = atDoor;
      useGame.getState().setPrompt(atDoor ? { text: "Leave the building", action: () => bridge.emit("exit-facility") } : null);
    }
    if (this.input2.interactPressed()) this.tryExit();
  }
}
