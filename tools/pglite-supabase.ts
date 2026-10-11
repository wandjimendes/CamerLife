/**
 * Boots an in-process Postgres (PGlite) that looks enough like a Supabase
 * project to run our migration + seed: the auth schema, auth.uid(), the
 * anon / authenticated / service_role roles. Shared by check-sql.ts (tests)
 * and dev-supabase.ts (local API mock).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const SEED = resolve(ROOT, "supabase/seed.sql");

// Minimal stand-in for what Supabase provisions on every project.
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text unique,
    encrypted_password text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
  $$;
`;

// Supabase grants the service role full access to public by default.
const SERVICE_ROLE_GRANTS = `
  grant usage on schema public to service_role;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
  grant execute on all functions in schema public to service_role;
`;

export interface BootOptions {
  /** Directory for a persistent database (omit for in-memory). */
  dataDir?: string;
  seed?: boolean;
  log?: (msg: string) => void;
}

export async function bootSupabaseLikeDb(opts: BootOptions = {}): Promise<PGlite> {
  const log = opts.log ?? (() => {});
  const db = opts.dataDir ? new PGlite(opts.dataDir, { extensions: { pgcrypto } }) : new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;

  const already = await db.query<{ n: number }>(
    "select count(*)::int as n from information_schema.schemata where schema_name = 'auth'",
  );
  if (already.rows[0].n > 0) {
    log("Existing database found - skipping schema setup.");
    return db;
  }

  log("Shimming Supabase auth schema and roles...");
  await db.exec(SUPABASE_SHIM);

  log("Applying migrations...");
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    log(`  ${f}`);
    await db.exec(readFileSync(resolve(MIGRATIONS, f), "utf8"));
  }
  await db.exec(SERVICE_ROLE_GRANTS);

  if (opts.seed !== false) {
    log("Applying seed...");
    await db.exec(readFileSync(SEED, "utf8"));
  }
  return db;
}

/** JSON-encoded request.jwt.claims for a given user / role. */
export function jwtClaims(uid: string | null, role: "anon" | "authenticated" | "service_role"): string {
  return JSON.stringify({ sub: uid ?? "", role });
}
