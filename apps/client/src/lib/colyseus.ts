import { Client, type Room } from "colyseus.js";
import { getAccessToken } from "./supabase";

const endpoint = (import.meta.env.VITE_COLYSEUS_URL as string | undefined) ?? "ws://localhost:2567";

export const colyseus = new Client(endpoint);

/** Attaches the current Supabase JWT so the server's static onAuth() can verify it. */
export async function withAuth(): Promise<Client> {
  const token = await getAccessToken();
  colyseus.auth.token = token ?? "";
  return colyseus;
}

/**
 * Module-level handle on the active town room so React (phone, HUD) and
 * Phaser scenes can both talk to it.
 */
export const net: { town: Room | null; house: Room | null } = { town: null, house: null };
