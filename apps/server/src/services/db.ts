import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  BuildingRow,
  EmploymentRow,
  FurnitureRow,
  JobRow,
  ProfileRow,
  UnitRow,
} from "@cameroon-life/shared";
import { env } from "./env.ts";

/**
 * Service-role Supabase client. Bypasses RLS - only ever used server-side.
 */
export const db: SupabaseClient = createClient(
  env.supabaseUrl || "http://localhost:54321",
  env.supabaseServiceKey || "missing-service-key",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export interface AuthedUser {
  id: string;
  firstName: string;
  familyName: string;
  hair: number;
  skin: number;
  clothes: number;
  townId: string;
}

/** Verifies a Supabase access token and loads the public profile. */
export async function verifyToken(token: string | undefined): Promise<AuthedUser | null> {
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle<ProfileRow>();
  if (!profile) return null;
  return {
    id: profile.id,
    firstName: profile.first_name,
    familyName: profile.family_name,
    hair: profile.hair,
    skin: profile.skin,
    clothes: profile.clothes,
    townId: profile.town_id,
  };
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle<ProfileRow>();
  return data;
}

export async function getBuildingBySlug(slug: string): Promise<BuildingRow | null> {
  const { data } = await db.from("buildings").select("*").eq("slug", slug).maybeSingle<BuildingRow>();
  return data;
}

export async function getUnitsForBuilding(buildingId: string): Promise<UnitRow[]> {
  const { data } = await db.from("units").select("*").eq("building_id", buildingId).order("label");
  return (data as UnitRow[]) ?? [];
}

export async function getUnit(unitId: string): Promise<UnitRow | null> {
  const { data } = await db.from("units").select("*").eq("id", unitId).maybeSingle<UnitRow>();
  return data;
}

export async function getFurniture(unitId: string): Promise<FurnitureRow[]> {
  const { data } = await db.from("furniture").select("*").eq("unit_id", unitId);
  return (data as FurnitureRow[]) ?? [];
}

export async function insertFurniture(row: {
  unit_id: string;
  item_key: string;
  x: number;
  y: number;
  placed_by: string;
}): Promise<FurnitureRow | null> {
  const { data, error } = await db.from("furniture").insert(row).select("*").single<FurnitureRow>();
  if (error) {
    console.error("[db] insertFurniture", error.message);
    return null;
  }
  return data;
}

export async function updateFurniturePosition(id: string, x: number, y: number): Promise<boolean> {
  const { error } = await db.from("furniture").update({ x, y }).eq("id", id);
  if (error) console.error("[db] updateFurniturePosition", error.message);
  return !error;
}

export async function deleteFurniture(id: string): Promise<boolean> {
  const { error } = await db.from("furniture").delete().eq("id", id);
  if (error) console.error("[db] deleteFurniture", error.message);
  return !error;
}

export interface ActiveEmployment {
  employment: EmploymentRow;
  job: JobRow;
}

export async function getActiveEmployment(userId: string): Promise<ActiveEmployment | null> {
  const { data } = await db
    .from("employment")
    .select("*, jobs(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle<EmploymentRow & { jobs: JobRow }>();
  if (!data) return null;
  const { jobs, ...employment } = data;
  return { employment, job: jobs };
}

export interface StartedShift {
  shift_id: string;
  employment_id: string;
  salary: number;
  job_title: string;
  building_id: string;
}

export async function startShift(userId: string): Promise<StartedShift> {
  const { data, error } = await db.rpc("start_shift", { p_user: userId });
  if (error) throw new Error(error.message);
  return data as StartedShift;
}

export async function completeShift(shiftId: string, success: boolean): Promise<{ payout: number; balance: number }> {
  const { data, error } = await db.rpc("complete_shift", { p_shift: shiftId, p_success: success });
  if (error) throw new Error(error.message);
  return data as { payout: number; balance: number };
}

export async function abandonShift(shiftId: string): Promise<void> {
  const { error } = await db.rpc("abandon_shift", { p_shift: shiftId });
  if (error) console.error("[db] abandonShift", error.message);
}

export async function getBalance(userId: string): Promise<number | null> {
  const { data } = await db.from("users").select("balance").eq("id", userId).maybeSingle<{ balance: number }>();
  return data?.balance ?? null;
}
