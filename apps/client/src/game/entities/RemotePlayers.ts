import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import type { Direction } from "@cameroon-life/shared";
import { Character } from "./Character";
import { useGame } from "../../store/game";

/** Shape of PlayerSchema as seen by the client (plain object proxy). */
export interface NetPlayer {
  id: string;
  name: string;
  familyName: string;
  hair: number;
  skin: number;
  clothes: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  inside: string;
  working: boolean;
}

/**
 * Keeps a Character on screen for every other player in the room and
 * interpolates them toward their networked position.
 */
export class RemotePlayers {
  private chars = new Map<string, Character>();
  private group: Phaser.GameObjects.Group;

  constructor(scene: Phaser.Scene, room: Room, private mySessionId: string) {
    this.group = scene.add.group();
    const $ = getStateCallbacks(room) as unknown as (s: unknown) => any;
    const players = (room.state as { players: unknown }).players;

    $(room.state).players.onAdd((p: NetPlayer, sessionId: string) => {
      this.updateCount(players);
      if (sessionId === this.mySessionId) return;
      const c = new Character(scene, p.x, p.y, p.name, p).setName(p.name);
      c.setDepth(p.y);
      c.setVisible(!p.inside);
      this.chars.set(sessionId, c);
      this.group.add(c);

      $(p).onChange(() => {
        c.targetX = p.x;
        c.targetY = p.y;
        c.setMotion(p.dir, p.moving);
        c.setVisible(!p.inside);
        c.setAppearance(p);
      });
    });

    $(room.state).players.onRemove((_p: NetPlayer, sessionId: string) => {
      this.updateCount(players);
      const c = this.chars.get(sessionId);
      if (c) {
        c.destroy();
        this.chars.delete(sessionId);
      }
    });
  }

  private updateCount(players: unknown) {
    const size = (players as { size?: number }).size ?? 0;
    useGame.getState().setOnlineCount(size);
  }

  update(dt: number) {
    for (const c of this.chars.values()) {
      c.interpolate(dt);
      c.setDepth(c.y);
    }
  }

  destroy() {
    for (const c of this.chars.values()) c.destroy();
    this.chars.clear();
  }
}
