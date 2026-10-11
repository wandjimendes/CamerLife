import Phaser from "phaser";
import { TILE } from "@cameroon-life/shared";
import { CHAR_SHEETS, registerCharacterAnimations } from "../entities/Character";
import { useGame } from "../../store/game";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 200, 10, 0x333333).setOrigin(0.5);
    const fill = this.add.rectangle(width / 2 - 100, height / 2, 0, 10, 0x8fcf6a).setOrigin(0, 0.5);
    this.load.on("progress", (v: number) => fill.setSize(200 * v, 10));
    this.load.on("complete", () => {
      bar.destroy();
      fill.destroy();
    });

    this.load.image("tiles", "/assets/tiles/cozy-tiles.png");
    this.load.spritesheet("tiles-sheet", "/assets/tiles/cozy-tiles.png", { frameWidth: TILE, frameHeight: TILE });
    this.load.tilemapTiledJSON("map-douala", "/assets/maps/douala.json");
    for (const sheet of CHAR_SHEETS) {
      this.load.spritesheet(sheet, `/assets/sprites/${sheet}.png`, { frameWidth: 16, frameHeight: 24 });
    }
  }

  create() {
    registerCharacterAnimations(this.anims);
    useGame.getState().setScene("town");
    this.scene.start("town", { townId: "douala" });
  }
}
