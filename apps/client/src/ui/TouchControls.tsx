import { useEffect, type PointerEvent } from "react";
import type { Direction } from "@cameroon-life/shared";
import { touchInput } from "../game/touch";
import { useGame } from "../store/game";

const KEYS: { dir: Direction; glyph: string; area: string }[] = [
  { dir: "up", glyph: "▲", area: "up" },
  { dir: "left", glyph: "◀", area: "left" },
  { dir: "right", glyph: "▶", area: "right" },
  { dir: "down", glyph: "▼", area: "down" },
];

/**
 * On-screen D-pad for touch devices. Pointer events (not click) so holding a
 * key keeps the player moving; sliding the thumb between keys switches
 * direction without lifting.
 */
export function TouchControls() {
  const phoneOpen = useGame((s) => s.phoneOpen);
  const workPrompt = useGame((s) => s.workPrompt);

  // Never leave a direction stuck when an overlay appears mid-press.
  useEffect(() => {
    touchInput.clear();
    return () => touchInput.clear();
  }, [phoneOpen, workPrompt]);

  if (phoneOpen || workPrompt) return null;

  const onDown = (dir: Direction) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // Touch implicitly captures the pointer, which would stop enter/leave on
    // the neighbouring keys; release it so sliding between keys works.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    touchInput.clear();
    touchInput.press(dir);
  };
  const onUp = (dir: Direction) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    touchInput.release(dir);
  };
  const onEnter = (dir: Direction) => (e: PointerEvent<HTMLButtonElement>) => {
    // thumb slid onto this key while pressed
    if (e.buttons & 1) {
      touchInput.clear();
      touchInput.press(dir);
    }
  };

  return (
    <div className="dpad" aria-label="Movement controls">
      {KEYS.map((k) => (
        <button
          key={k.dir}
          type="button"
          style={{ gridArea: k.area }}
          aria-label={`Move ${k.dir}`}
          onPointerDown={onDown(k.dir)}
          onPointerUp={onUp(k.dir)}
          onPointerCancel={onUp(k.dir)}
          onPointerLeave={onUp(k.dir)}
          onPointerEnter={onEnter(k.dir)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {k.glyph}
        </button>
      ))}
    </div>
  );
}
