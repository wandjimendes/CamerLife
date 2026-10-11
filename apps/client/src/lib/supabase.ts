import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

export const supabase = createClient(url ?? "http://localhost:54321", anon ?? "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Returns the current access token (for Colyseus auth) or null. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Normalises Supabase / Postgres errors into a readable message. */
export function errorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const e = err as { message?: string };
  return e.message ?? "Unknown error";
}
