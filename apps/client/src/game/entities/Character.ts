import Phaser from "phaser";
import { CLOTHES_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type Direction } from "@cameroon-life/shared";

export const CHAR_SHEETS = ["body", "clothes", ...HAIR_STYLES.map((_, i) => `hair_${i}`)] as const;
const DIR_ROW: Record<Direction, number> = { down: 0, up: 1, left: 2, right: 3 };

export interface Appearance {
  hair: number;
  skin: number;
  clothes: number;
}

/** Registers walk/idle animations for every character layer sheet. Call once. */
export function registerCharacterAnimations(anims: Phaser.Animations.AnimationManager) {
  for (const sheet of CHAR_SHEETS) {
    for (const dir of Object.keys(DIR_ROW) as Direction[]) {
      const row = DIR_ROW[dir] * 3;
      const walkKey = `${sheet}-walk-${dir}`;
      if (!anims.exists(walkKey)) {
        anims.create({
          key: walkKey,
          frames: [row + 1, row, row + 2, row].map((frame) => ({ key: sheet, frame })),
          frameRate: 8,
          repeat: -1,
        });
      }
    }
  }
}

function hexToInt(hex: string) {
  return parseInt(hex.replace("#", ""), 16);
}

/**
 * A player: three tinted sprite layers (skin / clothes / hair) + a name label.
 * Layers are white masks so Phaser's tint gives the chosen colors.
 */
export class Character extends Phaser.GameObjects.Container {
  private bodySprite: Phaser.GameObjects.Sprite;
  private clothes: Phaser.GameObjects.Sprite;
  private hair: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private hairSheet = "hair_0";
  dir: Direction = "down";
  private walking = false;

  /** For remote players: position we interpolate toward. */
  targetX = 0;
  targetY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, name: string, appearance: Appearance) {
    super(scene, x, y);
    this.bodySprite = scene.add.sprite(0, 0, "body", 0).setOrigin(0.5, 1);
    this.clothes = scene.add.sprite(0, 0, "clothes", 0).setOrigin(0.5, 1);
    this.hair = scene.add.sprite(0, 0, "hair_0", 0).setOrigin(0.5, 1);
    this.label = scene.add
      .text(0, -27, name, {
        fontFamily: "Nunito, sans-serif",
        fontSize: "8px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0.5, 1);
    this.add([this.bodySprite, this.clothes, this.hair, this.label]);
    this.setAppearance(appearance);
    this.targetX = x;
    this.targetY = y;
    scene.add.existing(this);
  }

  setAppearance(a: Appearance) {
    this.bodySprite.setTint(hexToInt(SKIN_TONES[a.skin % SKIN_TONES.length]));
    this.clothes.setTint(hexToInt(CLOTHES_COLORS[a.clothes % CLOTHES_COLORS.length]));
    this.hairSheet = `hair_${a.hair % HAIR_STYLES.length}`;
    this.hair.setTexture(this.hairSheet, DIR_ROW[this.dir] * 3);
    this.hair.setTint(hexToInt(HAIR_COLORS[a.hair % HAIR_COLORS.length]));
    this.setMotion(this.dir, this.walking, true);
  }

  setName(name: string) {
    this.label.setText(name);
    return this;
  }

  setMotion(dir: Direction, walking: boolean, force = false) {
    if (!force && dir === this.dir && walking === this.walking) return;
    this.dir = dir;
    this.walking = walking;
    const layers: [Phaser.GameObjects.Sprite, string][] = [
      [this.bodySprite, "body"],
      [this.clothes, "clothes"],
      [this.hair, this.hairSheet],
    ];
    for (const [sprite, sheet] of layers) {
      if (walking) sprite.play(`${sheet}-walk-${dir}`, true);
      else {
        sprite.stop();
        sprite.setFrame(DIR_ROW[dir] * 3);
      }
    }
  }

  /** Smoothly move toward the last known network position (remote players). */
  interpolate(dt: number) {
    const t = Math.min(1, dt / 90);
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      this.x = this.targetX;
      this.y = this.targetY;
      return;
    }
    this.x += dx * t;
    this.y += dy * t;
  }
}
