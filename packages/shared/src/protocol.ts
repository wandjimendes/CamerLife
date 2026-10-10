/**
 * Colyseus message names and payloads shared by client and server.
 */

export type Direction = "down" | "up" | "left" | "right";

// ---------- Town room ----------

export const TownMsg = {
  // client -> server
  MOVE: "move",
  ENTER_BUILDING: "enter_building",
  EXIT_BUILDING: "exit_building",
  START_WORK: "start_work",
  WORK_ANSWER: "work_answer",
  STOP_WORK: "stop_work",
  REFRESH_PROFILE: "refresh_profile",
  // server -> client
  ENTER_RESULT: "enter_result",
  WORK_STATE: "work_state",
  WORK_PROMPT: "work_prompt",
  WORK_RESULT: "work_result",
  ERROR: "error",
  BALANCE: "balance",
} as const;

export interface MovePayload {
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
}

export interface EnterBuildingPayload {
  buildingSlug: string;
}

export interface EnterResultPayload {
  ok: boolean;
  buildingSlug: string;
  kind: "house" | "facility" | "transport" | "none";
  /** For houses: the unit to join (house_{unitId}). */
  unitId?: string;
  unitLabel?: string;
  /** For facilities: whether the player is employed here. */
  employmentId?: string;
  jobTitle?: string;
  salary?: number;
  reason?: string;
}

export interface WorkStatePayload {
  active: boolean;
  shiftId?: string;
  jobTitle?: string;
  buildingSlug?: string;
  salary?: number;
  startedAt?: number;
  endsAt?: number;
  misses?: number;
  maxMisses?: number;
  promptsAnswered?: number;
}

export interface WorkPromptPayload {
  promptId: string;
  /** Arrow sequence the player must reproduce. */
  sequence: Direction[];
  expiresAt: number;
}

export interface WorkAnswerPayload {
  promptId: string;
  sequence: Direction[];
}

export interface WorkResultPayload {
  shiftId: string;
  status: "completed" | "failed" | "abandoned";
  payout: number;
  balance?: number;
  message: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// ---------- House room ----------

export const HouseMsg = {
  // client -> server
  MOVE: "move",
  PLACE_FURNITURE: "place_furniture",
  MOVE_FURNITURE: "move_furniture",
  REMOVE_FURNITURE: "remove_furniture",
  // server -> client
  ERROR: "error",
} as const;

export interface PlaceFurniturePayload {
  key: string;
  /** Tile coordinates inside the interior. */
  x: number;
  y: number;
}

export interface MoveFurniturePayload {
  id: string;
  x: number;
  y: number;
}

export interface RemoveFurniturePayload {
  id: string;
}

export interface HouseJoinOptions {
  unitId: string;
}

export interface TownJoinOptions {
  townId: string;
}

export function houseRoomId(unitId: string): string {
  return `house_${unitId}`;
}

export function townRoomId(townId: string): string {
  return `town_${townId}`;
}
