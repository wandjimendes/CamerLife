import type { Direction } from "@cameroon-life/shared";

/**
 * Held directions from the on-screen D-pad (TouchControls). Read by
 * PlayerInput alongside the keyboard, so scenes don't care which one is used.
 */
export const touchInput = {
  held: new Set<Direction>(),
  press(d: Direction) {
    this.held.add(d);
  },
  release(d: Direction) {
    this.held.delete(d);
  },
  clear() {
    this.held.clear();
  },
};

/** Viewport width (CSS px) below which the phone layout + wider camera are used. */
export const SMALL_SCREEN = 720;

/** Coarse pointer and no hover = phone / tablet. Evaluated once per load. */
export const isTouchDevice: boolean =
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse) and (hover: none)").matches;
