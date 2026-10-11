/**
 * Local stand-in for Supabase so the whole game can run offline:
 *
 *   - GoTrue subset:   /auth/v1/signup, /auth/v1/token (password, refresh_token),
 *                      /auth/v1/user, /auth/v1/logout
 *   - PostgREST subset: /rest/v1/<table> (select with embedded many-to-one
 *                      resources, eq/neq/gt/gte/lt/lte/is/in filters, order,
 *                      limit, insert/update/delete) and /rest/v1/rpc/<fn>
 *
 * Backed by PGlite with the real migration + seed, running every request as
 * the JWT's role with request.jwt.claims set - so RLS and the SECURITY
 * DEFINER RPCs behave exactly as they do on Supabase.
 *
 *   npm run dev:db                 in-memory database (reset on restart)
 *   npm run dev:db -- --persist    keeps data in .pglite/
 *   npm run dev:db -- --write-env  writes apps/{client,server}/.env if missing
 *
 * Not for production use.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { ROOT, bootSupabaseLikeDb, jwtClaims } from "./pglite-supabase";

const PORT = Number(process.env.DEV_SUPABASE_PORT ?? 54321);
const JWT_SECRET = "cameroon-life-local-dev-secret-not-for-production";
const TOKEN_TTL_S = 60 * 60;

type Role = "anon" | "authenticated" | "service_role";
type Json = Record<string, unknown>;
type Db = PGlite | Transaction;

// ---------------------------------------------------------------------------
// JWT (HS256) - enough for supabase-js and our server's getUser() round trip
// ---------------------------------------------------------------------------
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function signJwt(payload: Json): string {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token: string | undefined): Json | null {
  if (!token) return null;
  const [head, body, sig] = token.split(".");
  if (!head || !body || !sig) return null;
  const expected = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as Json;
    if (typeof claims.exp === "number" && claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}
const ANON_KEY = signJwt({ role: "anon", iss: "dev-supabase" });
const SERVICE_KEY = signJwt({ role: "service_role", iss: "dev-supabase" });

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(public status: number, message: string, public code = "", public details: string | null = null, public hint: string | null = null) {
    super(message);
  }
}
function send(res: http.ServerResponse, status: number, body?: string | object, headers: Record<string, string> = {}) {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Expose-Headers": "*",
    ...headers,
  });
  res.end(text);
}
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => res(Buffer.concat(chunks).toString()));
    req.on("error", rej);
  });
}
const bearer = (req: http.IncomingMessage) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || undefined;

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new HttpError(400, `invalid identifier "${name}"`, "PGRST100");
  return `"${name}"`;
}

// ---------------------------------------------------------------------------
// GoTrue
// ---------------------------------------------------------------------------
interface AuthUserRow { id: string; email: string; raw_user_meta_data: Json; created_at: string }

function userJson(u: AuthUserRow) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.created_at, phone: "", confirmed_at: u.created_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data, identities: [], created_at: u.created_at, updated_at: u.created_at,
  };
}
function sessionJson(u: AuthUserRow) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({
    sub: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    user_metadata: u.raw_user_meta_data, iat: now, exp: now + TOKEN_TTL_S, iss: "dev-supabase",
  });
  return {
    access_token, token_type: "bearer", expires_in: TOKEN_TTL_S, expires_at: now + TOKEN_TTL_S,
    refresh_token: signJwt({ sub: u.id, typ: "refresh", iat: now }), user: userJson(u),
  };
}
const hashPassword = (pw: string) => createHmac("sha256", JWT_SECRET).update(pw).digest("hex");

async function findUser(db: PGlite, where: string, params: unknown[]): Promise<AuthUserRow | null> {
  const r = await db.query<AuthUserRow>(`select id, email, raw_user_meta_data, created_at::text from auth.users where ${where}`, params);
  return r.rows[0] ?? null;
}

async function handleAuth(db: PGlite, req: http.IncomingMessage, url: URL, body: string): Promise<[number, object | undefined]> {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const json = body ? (JSON.parse(body) as Json) : {};

  if (req.method === "POST" && path === "/signup") {
    const email = String(json.email ?? "").trim().toLowerCase();
    const password = String(json.password ?? "");
    if (!email || password.length < 6) throw new HttpError(422, "Password should be at least 6 characters.", "weak_password");
    if (await findUser(db, "email = $1", [email])) throw new HttpError(422, "User already registered", "user_already_exists");
    const meta = (json.data as Json | undefined) ?? {};
    try {
      // The on_auth_user_created trigger runs here (families / users / budget).
      await db.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)", [email, hashPassword(password), JSON.stringify(meta)]);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("families_name_unique_ci")) throw new HttpError(422, "That family name is already taken.", "signup_failed");
      throw new HttpError(500, `Database error saving new user: ${msg}`, "unexpected_failure");
    }
    const u = (await findUser(db, "email = $1", [email]))!;
    return [200, sessionJson(u)];
  }

  if (req.method === "POST" && path === "/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const email = String(json.email ?? "").trim().toLowerCase();
      const u = await findUser(db, "email = $1 and encrypted_password = $2", [email, hashPassword(String(json.password ?? ""))]);
      if (!u) throw new HttpError(400, "Invalid login credentials", "invalid_credentials");
      return [200, sessionJson(u)];
    }
    if (grant === "refresh_token") {
      const claims = verifyJwt(String(json.refresh_token ?? ""));
      const u = claims?.typ === "refresh" ? await findUser(db, "id = $1", [claims.sub]) : null;
      if (!u) throw new HttpError(400, "Invalid Refresh Token", "refresh_token_not_found");
      return [200, sessionJson(u)];
    }
    throw new HttpError(400, `unsupported grant_type ${grant}`, "invalid_grant");
  }

  if (req.method === "GET" && path === "/user") {
    const claims = verifyJwt(bearer(req));
    const u = claims?.role === "authenticated" ? await findUser(db, "id = $1", [claims.sub]) : null;
    if (!u) throw new HttpError(401, "invalid JWT", "bad_jwt");
    return [200, userJson(u)];
  }

  if (req.method === "POST" && path === "/logout") return [204, undefined];
  if (req.method === "GET" && path === "/health") return [200, { name: "dev-supabase", description: "GoTrue stand-in" }];
  throw new HttpError(404, `auth endpoint not implemented: ${req.method} ${path}`, "not_found");
}

// ---------------------------------------------------------------------------
// PostgREST
// ---------------------------------------------------------------------------
interface SelectNode { name: string; alias: string; children?: SelectNode[] }

/** Parses "a, b:c, rel(x, nested(*))" into a tree. */
function parseSelect(src: string): SelectNode[] {
  let i = 0;
  const parseList = (): SelectNode[] => {
    const out: SelectNode[] = [];
    while (i < src.length) {
      let token = "";
      while (i < src.length && !",()".includes(src[i])) token += src[i++];
      token = token.trim();
      if (token) {
        let [alias, name] = token.includes(":") ? token.split(":", 2) : [token, token];
        name = name.trim(); alias = alias.trim();
        const node: SelectNode = { name, alias };
        if (src[i] === "(") { i++; node.children = parseList(); }
        out.push(node);
      }
      if (src[i] === ")") { i++; return out; }
      if (src[i] === ",") i++;
    }
    return out;
  };
  return parseList();
}

interface FkInfo { col: string; refTable: string; refCol: string }
const fkCache = new Map<string, FkInfo | null>();
/** Resolves an embed target that is either a referenced table name or an FK column name (PostgREST's `alias:fk_col(...)` form). */
async function findFk(db: Db, table: string, target: string): Promise<FkInfo | null> {
  const key = `${table}->${target}`;
  if (fkCache.has(key)) return fkCache.get(key)!;
  // pg_catalog rather than information_schema: the latter is filtered by the
  // privileges of the current role, which is "authenticated" at this point.
  const r = await db.query<FkInfo>(
    `select a.attname as col, c2.relname as "refTable", a2.attname as "refCol"
       from pg_constraint co
       join pg_class c  on c.oid = co.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class c2 on c2.oid = co.confrelid
       join pg_attribute a  on a.attrelid = co.conrelid  and a.attnum = co.conkey[1]
       join pg_attribute a2 on a2.attrelid = co.confrelid and a2.attnum = co.confkey[1]
      where co.contype = 'f' and n.nspname = 'public' and c.relname = $1 and (c2.relname = $2 or a.attname = $2)
      order by (a.attname = $2) desc, co.conname limit 1`,
    [table, target],
  );
  const fk = r.rows[0] ?? null;
  fkCache.set(key, fk);
  return fk;
}

/** Builds the select-list for a table alias, embedding many-to-one relations as JSON. */
async function selectList(db: Db, table: string, alias: string, nodes: SelectNode[]): Promise<string> {
  const parts: string[] = [];
  for (const n of nodes) {
    if (n.children) {
      const fk = await findFk(db, table, n.name);
      if (!fk) throw new HttpError(400, `Could not find a relationship between '${table}' and '${n.name}'`, "PGRST200");
      const sub = `${alias}_${n.alias}`;
      const subCols = await selectList(db, fk.refTable, sub, n.children);
      parts.push(`(select to_jsonb(${sub}) from (select ${subCols} from public.${ident(fk.refTable)} ${sub} where ${sub}.${ident(fk.refCol)} = ${alias}.${ident(fk.col)}) ${sub}) as ${ident(n.alias)}`);
    } else if (n.name === "*") {
      parts.push(`${alias}.*`);
    } else {
      parts.push(`${alias}.${ident(n.name)}${n.alias !== n.name ? ` as ${ident(n.alias)}` : ""}`);
    }
  }
  return parts.join(", ");
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
function buildWhere(url: URL, alias: string, params: unknown[]): string {
  const clauses: string[] = [];
  for (const [col, raw] of url.searchParams) {
    if (RESERVED.has(col)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot), val = raw.slice(dot + 1);
    const c = `${alias}.${ident(col)}`;
    const simple: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
    if (simple[op]) { params.push(val); clauses.push(`${c} ${simple[op]} $${params.length}`); }
    else if (op === "is") clauses.push(`${c} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`);
    else if (op === "in") {
      const items = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      clauses.push(`${c} in (${items.map((v) => { params.push(v); return `$${params.length}`; }).join(", ")})`);
    } else throw new HttpError(400, `unsupported filter operator "${op}"`, "PGRST100");
  }
  return clauses.length ? ` where ${clauses.join(" and ")}` : "";
}
function buildOrder(url: URL, alias: string): string {
  const order = url.searchParams.get("order");
  if (!order) return "";
  return " order by " + order.split(",").map((part) => {
    const [col, ...mods] = part.split(".");
    return `${alias}.${ident(col)} ${mods.includes("desc") ? "desc" : "asc"}${mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : ""}`;
  }).join(", ");
}

const AGG = (inner: string) => `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)::text as j from (${inner}) r`;

async function handleRest(tx: Transaction, req: http.IncomingMessage, url: URL, body: string): Promise<[number, string | undefined]> {
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const prefer = String(req.headers.prefer ?? "");
  const params: unknown[] = [];

  const finish = async (sql: string, returning: boolean): Promise<[number, string | undefined]> => {
    if (!returning) { await tx.query(sql, params); return [204, undefined]; }
    const r = await tx.query<{ j: string }>(sql, params);
    const rows = JSON.parse(r.rows[0].j) as unknown[];
    if (wantsObject) {
      if (rows.length !== 1) throw new HttpError(406, "JSON object requested, multiple (or no) rows returned", "PGRST116", `Results contain ${rows.length} rows, application/vnd.pgrst.object+json requires 1 row`);
      return [200, JSON.stringify(rows[0])];
    }
    return [200, JSON.stringify(rows)];
  };

  // RPC
  if (path.startsWith("rpc/")) {
    const fn = path.slice(4);
    const args = body ? (JSON.parse(body) as Json) : {};
    const named = Object.entries(args).map(([k, v]) => { params.push(v === undefined ? null : v); return `${ident(k)} := $${params.length}`; });
    const r = await tx.query<{ j: string | null }>(`select to_jsonb(public.${ident(fn)}(${named.join(", ")}))::text as j`, params);
    const j = r.rows[0]?.j;
    return [200, j === null || j === undefined ? "null" : j];
  }

  const table = path;
  ident(table);
  const nodes = parseSelect(url.searchParams.get("select") ?? "*");
  const cols = await selectList(tx, table, "t", nodes);

  if (req.method === "GET") {
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const sql = `select ${cols} from public.${ident(table)} t${buildWhere(url, "t", params)}${buildOrder(url, "t")}${limit ? ` limit ${Number(limit)}` : ""}${offset ? ` offset ${Number(offset)}` : ""}`;
    return finish(AGG(sql), true);
  }
  if (req.method === "POST") {
    const rows = (JSON.parse(body) as Json | Json[]);
    const list = Array.isArray(rows) ? rows : [rows];
    const columns = [...new Set(list.flatMap((r) => Object.keys(r)))];
    const values = list.map((r) => `(${columns.map((c) => { params.push(r[c] === undefined ? null : r[c]); return `$${params.length}`; }).join(", ")})`);
    const conflict = url.searchParams.get("on_conflict");
    const upsert = prefer.includes("resolution=merge-duplicates") && conflict
      ? ` on conflict (${conflict.split(",").map(ident).join(", ")}) do update set ${columns.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`
      : "";
    const insert = `insert into public.${ident(table)} (${columns.map(ident).join(", ")}) values ${values.join(", ")}${upsert} returning *`;
    if (!prefer.includes("return=representation")) return finish(insert, false);
    return finish(`with t as (${insert}) ${AGG(`select ${cols} from t`)}`, true);
  }
  if (req.method === "PATCH") {
    const patch = JSON.parse(body) as Json;
    const sets = Object.entries(patch).map(([k, v]) => { params.push(v); return `${ident(k)} = $${params.length}`; });
    const update = `update public.${ident(table)} t set ${sets.join(", ")}${buildWhere(url, "t", params)} returning *`;
    if (!prefer.includes("return=representation")) return finish(update, false);
    return finish(`with t as (${update}) ${AGG(`select ${cols} from t`)}`, true);
  }
  if (req.method === "DELETE") {
    const del = `delete from public.${ident(table)} t${buildWhere(url, "t", params)} returning *`;
    if (!prefer.includes("return=representation")) return finish(del, false);
    return finish(`with t as (${del}) ${AGG(`select ${cols} from t`)}`, true);
  }
  throw new HttpError(405, `method ${req.method} not supported`, "PGRST100");
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
function writeEnvFiles() {
  const client = resolve(ROOT, "apps/client/.env");
  const server = resolve(ROOT, "apps/server/.env");
  if (!existsSync(client)) {
    writeFileSync(client, `VITE_SUPABASE_URL=http://localhost:${PORT}\nVITE_SUPABASE_ANON_KEY=${ANON_KEY}\nVITE_COLYSEUS_URL=ws://localhost:2567\n`);
    console.log(`wrote ${client}`);
  }
  if (!existsSync(server)) {
    writeFileSync(server, `PORT=2567\nSUPABASE_URL=http://localhost:${PORT}\nSUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}\nCORS_ORIGINS=http://localhost:5173\nMONITOR_PASSWORD=\n`);
    console.log(`wrote ${server}`);
  }
}

async function main() {
  const persist = process.argv.includes("--persist");
  if (process.argv.includes("--write-env")) writeEnvFiles();
  const db = await bootSupabaseLikeDb({ dataDir: persist ? resolve(ROOT, ".pglite") : undefined, log: (m) => console.log(m) });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") return send(res, 204);
    try {
      const body = await readBody(req);
      if (url.pathname.startsWith("/auth/v1")) {
        const [status, json] = await handleAuth(db, req, url, body);
        return send(res, status, json);
      }
      if (url.pathname.startsWith("/rest/v1")) {
        const claims = verifyJwt(bearer(req)) ?? verifyJwt(String(req.headers.apikey ?? ""));
        if (!claims) throw new HttpError(401, "No API key found in request", "PGRST301");
        const role = (claims.role as Role) ?? "anon";
        const uid = role === "authenticated" ? String(claims.sub) : null;
        let out: [number, string | undefined] = [500, undefined];
        await db.transaction(async (tx) => {
          await tx.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims(uid, role)]);
          await tx.exec(`set local role ${role}`);
          out = await handleRest(tx, req, url, body);
        });
        return send(res, out[0], out[1]);
      }
      if (url.pathname === "/") return send(res, 200, { name: "dev-supabase", ok: true });
      throw new HttpError(404, `not found: ${url.pathname}`, "not_found");
    } catch (e) {
      if (e instanceof HttpError) {
        return send(res, e.status, { code: e.code, message: e.message, details: e.details, hint: e.hint, error_code: e.code, msg: e.message });
      }
      const pg = e as Error & { code?: string; detail?: string; hint?: string };
      // Postgres errors -> PostgREST shape; RAISE EXCEPTION in RPCs is P0001 -> 400
      const status = pg.code === "42501" ? 403 : 400;
      console.log(`  ! ${req.method} ${url.pathname} -> ${pg.message}`);
      return send(res, status, { code: pg.code ?? "PGRST000", message: pg.message, details: pg.detail ?? null, hint: pg.hint ?? null });
    }
  });

  server.listen(PORT, () => {
    console.log(`\ndev-supabase listening on http://localhost:${PORT}  (${persist ? "persistent: .pglite/" : "in-memory"})`);
    console.log(`\n  VITE_SUPABASE_URL=http://localhost:${PORT}\n  VITE_SUPABASE_ANON_KEY=${ANON_KEY}\n\n  SUPABASE_URL=http://localhost:${PORT}\n  SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}\n`);
    console.log("Run with --write-env to write these into apps/client/.env and apps/server/.env.\n");
  });

  const shutdown = async () => { server.close(); await db.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
