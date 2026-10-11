import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import { createGame } from "../game/createGame";
import { useGame } from "../store/game";
import { HUD } from "./HUD";
import { Phone } from "./phone/Phone";
import { WorkPanel } from "./WorkPanel";
import { FurniturePanel } from "./FurniturePanel";

/** Mounts the Phaser canvas and layers the React overlays (HUD, phone, panels) on top. */
export function GameView() {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const scene = useGame((s) => s.scene);

  useEffect(() => {
    if (!host.current || gameRef.current) return;
    gameRef.current = createGame(host.current);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="game-root">
      <div ref={host} className="game-canvas" />
      <HUD />
      {scene === "house" && <FurniturePanel />}
      {scene === "facility" && <WorkPanel />}
      <Phone />
    </div>
  );
}
