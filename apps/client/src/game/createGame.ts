import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { TownScene } from "./scenes/TownScene";
import { HouseScene } from "./scenes/HouseScene";
import { FacilityScene } from "./scenes/FacilityScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#6fbf4f",
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: "100%",
      height: "100%",
    },
    physics: { default: "arcade", arcade: { debug: false } },
    scene: [BootScene, TownScene, HouseScene, FacilityScene],
    input: { keyboard: { target: window } },
  });

  // Don't swallow keystrokes while the player types in the phone UI.
  const onFocusIn = () => {
    const el = document.activeElement;
    const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    game.input.keyboard!.enabled = !typing;
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusIn);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusIn);
  });
  return game;
}
