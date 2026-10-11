import { create } from "zustand";
import type { WorkPromptPayload, WorkStatePayload } from "@cameroon-life/shared";

export type SceneKey = "boot" | "town" | "house" | "facility";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "success" | "error";
}

export interface InteractionPrompt {
  text: string;
  /** Called when the player presses E / taps the prompt. */
  action: () => void;
}

export interface HouseContext {
  unitId: string;
  label: string;
  canEdit: boolean;
  isOwner: boolean;
}

export interface FacilityContext {
  buildingSlug: string;
  name: string;
  jobTitle: string;
  salary: number;
}

interface GameState {
  scene: SceneKey;
  connected: boolean;
  onlineCount: number;
  phoneOpen: boolean;
  prompt: InteractionPrompt | null;
  toasts: Toast[];
  house: HouseContext | null;
  facility: FacilityContext | null;
  work: WorkStatePayload | null;
  workPrompt: WorkPromptPayload | null;
  /** Catalog key currently being placed (house edit mode). */
  placingKey: string | null;
  /** Id of the placed furniture currently selected. */
  selectedFurnitureId: string | null;

  setScene: (scene: SceneKey) => void;
  setConnected: (connected: boolean) => void;
  setOnlineCount: (n: number) => void;
  setPhoneOpen: (open: boolean) => void;
  togglePhone: () => void;
  setPrompt: (prompt: InteractionPrompt | null) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  setHouse: (house: HouseContext | null) => void;
  setFacility: (facility: FacilityContext | null) => void;
  setWork: (work: WorkStatePayload | null) => void;
  setWorkPrompt: (prompt: WorkPromptPayload | null) => void;
  setPlacingKey: (key: string | null) => void;
  setSelectedFurnitureId: (id: string | null) => void;
}

let toastSeq = 1;

export const useGame = create<GameState>((set, get) => ({
  scene: "boot",
  connected: false,
  onlineCount: 0,
  phoneOpen: false,
  prompt: null,
  toasts: [],
  house: null,
  facility: null,
  work: null,
  workPrompt: null,
  placingKey: null,
  selectedFurnitureId: null,

  setScene: (scene) => set({ scene }),
  setConnected: (connected) => set({ connected }),
  setOnlineCount: (onlineCount) => set({ onlineCount }),
  setPhoneOpen: (phoneOpen) => set({ phoneOpen }),
  togglePhone: () => set({ phoneOpen: !get().phoneOpen }),
  setPrompt: (prompt) => set({ prompt }),
  toast: (text, kind = "info") => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), kind === "error" ? 6000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setHouse: (house) => set({ house, placingKey: null, selectedFurnitureId: null }),
  setFacility: (facility) => set({ facility }),
  setWork: (work) => set({ work }),
  setWorkPrompt: (workPrompt) => set({ workPrompt }),
  setPlacingKey: (placingKey) => set({ placingKey, selectedFurnitureId: null }),
  setSelectedFurnitureId: (selectedFurnitureId) => set({ selectedFurnitureId, placingKey: null }),
}));
