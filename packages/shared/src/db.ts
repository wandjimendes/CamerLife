/**
 * Row types mirroring supabase/migrations/*.sql (Phase 1).
 */
import type { BuildingKind, ListingStatus, UnitKind } from "./layout";

export type FamilyRole = "father" | "mother" | "cousin";
export type JobStatus = "open" | "closed";
export type ApplicationStatus = "pending" | "approved" | "rejected";
export type EmploymentStatus = "active" | "fired" | "resigned";
export type ShiftStatus = "active" | "completed" | "failed" | "abandoned";

export interface TownRow {
  id: string;
  name: string;
  map_key: string;
  spawn_x: number;
  spawn_y: number;
}

export interface FamilyRow {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface FamilyMemberRow {
  family_id: string;
  user_id: string;
  role: FamilyRole;
  joined_at: string;
}

export interface UserRow {
  id: string;
  first_name: string;
  family_id: string;
  hair: number;
  skin: number;
  clothes: number;
  balance: number;
  town_id: string;
  is_admin: boolean;
  created_at: string;
}

/** Public projection (view `profiles`). */
export interface ProfileRow {
  id: string;
  first_name: string;
  family_name: string;
  hair: number;
  skin: number;
  clothes: number;
  town_id: string;
}

export interface BuildingRow {
  id: string;
  slug: string;
  town_id: string;
  name: string;
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  door_x: number;
  door_y: number;
  is_facility: boolean;
}

export interface UnitRow {
  id: string;
  slug: string;
  building_id: string;
  kind: UnitKind;
  label: string;
  owner_id: string | null;
  tenant_id: string | null;
  lease_until: string | null;
  listing_status: ListingStatus;
  sale_price: number | null;
  rent_price: number | null;
  interior_w: number;
  interior_h: number;
}

export interface JobRow {
  id: string;
  town_id: string;
  building_id: string;
  title: string;
  description: string | null;
  salary: number;
  slots: number;
  status: JobStatus;
  created_by: string | null;
  created_at: string;
}

export interface JobApplicationRow {
  id: string;
  job_id: string;
  user_id: string;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface EmploymentRow {
  id: string;
  user_id: string;
  job_id: string;
  salary: number;
  status: EmploymentStatus;
  hired_at: string;
  ended_at: string | null;
  last_shift_at: string | null;
}

export interface FurnitureRow {
  id: string;
  unit_id: string;
  item_key: string;
  x: number;
  y: number;
  rotation: number;
  placed_by: string | null;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  amount: number;
  kind: string;
  note: string | null;
  created_at: string;
}

export interface WorkShiftRow {
  id: string;
  employment_id: string;
  user_id: string;
  status: ShiftStatus;
  started_at: string;
  ended_at: string | null;
  payout: number;
}
