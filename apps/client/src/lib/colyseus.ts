import { Client, type Room } from "colyseus.js";
import { getAccessToken } from "./supabase";

const rawEndpoint = (import.meta.env.VITE_COLYSEUS_URL as string | undefined) ?? "ws://localhost:2567";

/** A relative URL (e.g. "/colyseus") targets the Vite dev proxy on the current origin. */
const endpoint = rawEndpoint.startsWith("/")
  ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${rawEndpoint}`
  : rawEndpoint;

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
