/** Tile size in pixels for all maps and interiors. */
export const TILE = 16;

/** Starting budgets (FCFA). One is picked at random on signup (DB trigger). */
export const STARTING_BUDGETS = [50_000, 500_000, 5_000_000] as const;

/** Work shift length. Spec: 5 minutes. */
export const SHIFT_DURATION_MS = 5 * 60 * 1000;
/** How often (approx.) the server pushes an anti-AFK mini-game prompt during a shift. */
export const WORK_PROMPT_MIN_MS = 35_000;
export const WORK_PROMPT_MAX_MS = 70_000;
/** Time the player has to answer a prompt. */
export const WORK_PROMPT_TIMEOUT_MS = 15_000;
/** Shift fails after this many missed / wrong prompts. */
export const WORK_MAX_MISSES = 2;
/** Length of the arrow-key sequence in the mini-game. */
export const WORK_SEQUENCE_LENGTH = 4;

/** Player must be within this many pixels of a door to interact with it (server-validated). */
export const DOOR_INTERACT_RADIUS = 40;

/** Player movement speed (px/s). */
export const PLAYER_SPEED = 90;

/** Server state patch rate. */
export const PATCH_RATE_MS = 50;

export const HAIR_STYLES = ["Short", "Afro", "Braids", "Bald"] as const;
export const SKIN_TONES = ["#8d5524", "#c68642", "#e0ac69", "#5c3a1e"] as const;
export const CLOTHES_COLORS = ["#2e86de", "#e74c3c", "#27ae60", "#f1c40f", "#8e44ad"] as const;
export const HAIR_COLORS = ["#1b1b1b", "#3b2314", "#6b3e1e", "#000000"] as const;

export const APPEARANCE_LIMITS = {
  hair: HAIR_STYLES.length,
  skin: SKIN_TONES.length,
  clothes: CLOTHES_COLORS.length,
};

export const CURRENCY = "FCFA";

export function formatFcfa(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} ${CURRENCY}`;
}
