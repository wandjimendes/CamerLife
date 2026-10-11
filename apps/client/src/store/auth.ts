import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { ProfileRow, UserRow } from "@cameroon-life/shared";
import { supabase } from "../lib/supabase";

export interface Me extends ProfileRow {
  balance: number;
  is_admin: boolean;
}

interface AuthState {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  init: () => Promise<void>;
  loadProfile: () => Promise<Me | null>;
  setBalance: (balance: number) => void;
  refreshBalance: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  me: null,
  loading: true,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ session: data.session });
    if (data.session) await get().loadProfile();
    set({ loading: false });
    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session });
      if (session) await get().loadProfile();
      else set({ me: null });
    });
  },

  loadProfile: async () => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return null;
    // The signup trigger creates the rows; retry briefly in case we're racing it.
    for (let attempt = 0; attempt < 5; attempt++) {
      const [{ data: profile }, { data: user }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle<ProfileRow>(),
        supabase.from("users").select("balance, is_admin").eq("id", uid).maybeSingle<Pick<UserRow, "balance" | "is_admin">>(),
      ]);
      if (profile && user) {
        const me: Me = { ...profile, balance: Number(user.balance), is_admin: user.is_admin };
        set({ me });
        return me;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return null;
  },

  setBalance: (balance) => {
    const me = get().me;
    if (me) set({ me: { ...me, balance } });
  },

  refreshBalance: async () => {
    const me = get().me;
    if (!me) return;
    const { data } = await supabase.from("users").select("balance").eq("id", me.id).maybeSingle<{ balance: number }>();
    if (data) set({ me: { ...me, balance: Number(data.balance) } });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, me: null });
  },
}));
