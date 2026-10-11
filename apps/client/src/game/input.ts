import Phaser from "phaser";
import { PLAYER_SPEED, type Direction } from "@cameroon-life/shared";
import { useGame } from "../store/game";

export interface MoveInput {
  vx: number;
  vy: number;
  dir: Direction | null;
  moving: boolean;
}

/** True while the player is typing in the phone / any HTML input. */
export function uiHasFocus(): boolean {
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return true;
  const g = useGame.getState();
  return g.phoneOpen || !!g.workPrompt;
}

export class PlayerInput {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private interact: Phaser.Input.Keyboard.Key;
  private del: Phaser.Input.Keyboard.Key;
  private backspace: Phaser.Input.Keyboard.Key;
  private esc: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys({ W: "W", A: "A", S: "S", D: "D" }) as PlayerInput["wasd"];
    this.interact = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.del = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DELETE);
    this.backspace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE, false);
    this.esc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false);
  }

  read(): MoveInput {
    if (uiHasFocus()) return { vx: 0, vy: 0, dir: null, moving: false };
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = 1;
    const moving = vx !== 0 || vy !== 0;
    let dir: Direction | null = null;
    if (moving) {
      if (vx !== 0 && vy !== 0) {
        // normalise diagonals, face horizontally
        vx *= Math.SQRT1_2;
        vy *= Math.SQRT1_2;
      }
      dir = Math.abs(vx) >= Math.abs(vy) ? (vx < 0 ? "left" : "right") : vy < 0 ? "up" : "down";
    }
    return { vx: vx * PLAYER_SPEED, vy: vy * PLAYER_SPEED, dir, moving };
  }

  interactPressed() {
    return !uiHasFocus() && Phaser.Input.Keyboard.JustDown(this.interact);
  }

  deletePressed() {
    return !uiHasFocus() && (Phaser.Input.Keyboard.JustDown(this.del) || Phaser.Input.Keyboard.JustDown(this.backspace));
  }

  escapePressed() {
    return Phaser.Input.Keyboard.JustDown(this.esc);
  }
}
