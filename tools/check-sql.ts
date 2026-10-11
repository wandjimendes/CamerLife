/**
 * Validates the Supabase migration + seed against an in-process Postgres
 * (PGlite) and runs an end-to-end smoke test of the RPC layer:
 *
 *   signup trigger -> buy a house -> list it for rent -> apply for a job
 *   -> admin approves -> server starts/completes a shift -> salary paid.
 *
 * Supabase-only pieces (auth schema, auth.uid(), roles) are shimmed.
 * Run: npm run check:sql
 */
import { STARTING_BUDGETS } from "../packages/shared/src/index";
import { bootSupabaseLikeDb, jwtClaims } from "./pglite-supabase";

let failures = 0;
function check(cond: unknown, label: string) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
async function expectError(p: Promise<unknown>, needle: string, label: string) {
  try {
    await p;
    check(false, `${label} (expected error "${needle}")`);
  } catch (e) {
    const msg = (e as Error).message;
    check(msg.includes(needle), `${label} -> "${msg}"`);
  }
}

async function main() {
  const db = await bootSupabaseLikeDb({ log: (m) => console.log(m) });

  // Postgres rejects SET LOCAL for custom GUCs unless set at least once; use set_config.
  const asUser = (uid: string | null, role = "authenticated") =>
    db.query(`select set_config('request.jwt.claims', $1, false)`, [jwtClaims(uid, role as "authenticated" | "service_role")]);
  const asServer = () => asUser(null, "service_role");
  const rpc = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> => {
    const r = await db.query<Record<string, T>>(sql, params);
    return Object.values(r.rows[0])[0];
  };

  const towns = await db.query<{ n: number }>("select count(*)::int as n from public.towns");
  const buildings = await db.query<{ n: number }>("select count(*)::int as n from public.buildings");
  const units = await db.query<{ n: number }>("select count(*)::int as n from public.units");
  const jobs = await db.query<{ n: number }>("select count(*)::int as n from public.jobs where status = 'open'");
  console.log(`  towns=${towns.rows[0].n} buildings=${buildings.rows[0].n} units=${units.rows[0].n} jobs=${jobs.rows[0].n}`);
  check(towns.rows[0].n >= 1 && buildings.rows[0].n >= 1 && units.rows[0].n >= 1 && jobs.rows[0].n >= 1, "seed populated world tables");

  console.log("Smoke test: signup trigger");
  const alice = (
    await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      ["alice@example.com", JSON.stringify({ first_name: "Alice", family_name: "Mbappe", hair: 1, skin: 2, clothes: 3, family_role: "mother" })],
    )
  ).rows[0].id;
  const aliceRow = (await db.query<{ first_name: string; balance: number; hair: number; family_name: string; role: string }>(
    `select u.first_name, u.balance::int as balance, u.hair, f.name as family_name, fm.role::text as role
       from public.users u join public.families f on f.id = u.family_id
       join public.family_members fm on fm.user_id = u.id where u.id = $1`,
    [alice],
  )).rows[0];
  check(aliceRow?.first_name === "Alice" && aliceRow.family_name === "Mbappe" && aliceRow.hair === 1 && aliceRow.role === "mother", "user/family/member rows created from metadata");
  check((STARTING_BUDGETS as readonly number[]).includes(aliceRow.balance), `starting budget is one of ${STARTING_BUDGETS.join("/")} (got ${aliceRow.balance})`);
  const dup = (
    await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
      "dup@example.com", JSON.stringify({ first_name: "Dup", family_name: "MBAPPE" }),
    ])
  ).rows[0].id;
  const dupFam = (await db.query<{ same: boolean; n: number }>(
    `select (select family_id from public.users where id = $1) = (select family_id from public.users where id = $2) as same,
            (select count(*)::int from public.families where lower(name) = 'mbappe') as n`,
    [alice, dup],
  )).rows[0];
  check(!dupFam.same && dupFam.n === 2, "family names are not unique: same name founds a separate family");
  const bob = (
    await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
      "bob@example.com", JSON.stringify({ first_name: "Bob", family_name: "Eto'o", family_role: "bogus" }),
    ])
  ).rows[0].id;
  check((await rpc<string>("select role::text from public.family_members where user_id = $1", [bob])) === "father", "invalid family_role falls back to father");

  // Make Alice rich enough to buy the cheapest house regardless of the random budget.
  await db.query("update public.users set balance = 10000000 where id = $1", [alice]);
  await db.query("update public.users set balance = 100000 where id = $1", [bob]);

  console.log("Smoke test: real estate");
  const unit = (await db.query<{ id: string; sale_price: number }>(
    "select id, sale_price::int as sale_price from public.units where listing_status = 'sale' order by sale_price limit 1",
  )).rows[0];
  await asUser(null);
  await expectError(rpc("select public.buy_unit($1)", [unit.id]), "not authenticated", "buy_unit requires auth");
  await asUser(bob);
  await expectError(rpc("select public.buy_unit($1)", [unit.id]), "insufficient funds", "buy_unit checks balance");
  await asUser(alice);
  const bought = await rpc<{ ok: boolean; balance: number }>("select public.buy_unit($1)", [unit.id]);
  check(bought.ok && Number(bought.balance) === 10000000 - unit.sale_price, `buy_unit debits price (balance ${bought.balance})`);
  const owned = (await db.query<{ owner_id: string; listing_status: string }>("select owner_id, listing_status::text from public.units where id = $1", [unit.id])).rows[0];
  check(owned.owner_id === alice && owned.listing_status === "none", "unit owner set and listing cleared");
  await expectError(rpc("select public.buy_unit($1)", [unit.id]), "not for sale", "cannot re-buy an unlisted unit");

  await asUser(bob);
  await expectError(rpc("select public.set_unit_listing($1, 'rent', 1000)", [unit.id]), "not the owner", "only owner can list");
  await asUser(alice);
  await expectError(rpc("select public.set_unit_listing($1, 'rent', 0)", [unit.id]), "price must be positive", "listing price validated");
  await rpc("select public.set_unit_listing($1, 'rent', 20000)", [unit.id]);
  await asUser(bob);
  const rented = await rpc<{ ok: boolean; balance: number }>("select public.rent_unit($1)", [unit.id]);
  check(rented.ok && Number(rented.balance) === 80000, "rent_unit debits tenant");
  const aliceBal = await rpc<number>("select balance::int from public.users where id = $1", [alice]);
  check(Number(aliceBal) === 10000000 - unit.sale_price + 20000, "rent_unit credits owner");
  const tenancy = (await db.query<{ tenant_id: string; has_lease: boolean }>("select tenant_id, lease_until > now() as has_lease from public.units where id = $1", [unit.id])).rows[0];
  check(tenancy.tenant_id === bob && tenancy.has_lease, "tenant and 30-day lease recorded");
  await asUser(alice);
  await expectError(rpc("select public.set_unit_listing($1, 'rent', 20000)", [unit.id]), "currently has a tenant", "cannot relist while tenanted");

  console.log("Smoke test: jobs & shifts");
  const job = (await db.query<{ id: string; salary: number }>("select id, salary::int as salary from public.jobs where status = 'open' and slots >= 1 order by salary limit 1")).rows[0];
  await asUser(bob);
  const applied = await rpc<{ ok: boolean; application_id: string }>("select public.apply_for_job($1, $2)", [job.id, "Please hire me"]);
  check(applied.ok && !!applied.application_id, "apply_for_job creates application");
  await expectError(rpc("select public.apply_for_job($1)", [job.id]), "already applied", "duplicate pending application rejected");
  await expectError(rpc("select public.review_application($1, true)", [applied.application_id]), "admin only", "non-admin cannot review");

  await asServer();
  await expectError(rpc("select public.start_shift($1)", [bob]), "not employed", "start_shift requires employment");
  const reviewed = await rpc<{ ok: boolean; status: string; employment_id: string }>("select public.review_application($1, true)", [applied.application_id]);
  check(reviewed.ok && reviewed.status === "approved" && !!reviewed.employment_id, "service role approves application");
  await asUser(bob);
  await expectError(rpc("select public.apply_for_job($1)", [job.id]), "already have a job", "employed player cannot apply again");
  await expectError(rpc("select public.start_shift($1)", [bob]), "server only", "start_shift is server-only");

  await asServer();
  const shift1 = await rpc<{ shift_id: string; salary: number }>("select public.start_shift($1)", [bob]);
  check(!!shift1.shift_id && Number(shift1.salary) === job.salary, "start_shift opens a shift with job salary");
  const shift2 = await rpc<{ shift_id: string }>("select public.start_shift($1)", [bob]);
  check((await rpc<string>("select status::text from public.work_shifts where id = $1", [shift1.shift_id])) === "abandoned", "starting a new shift abandons the stale one");
  const failed = await rpc<{ payout: number; balance: number }>("select public.complete_shift($1, false)", [shift2.shift_id]);
  check(Number(failed.payout) === 0 && Number(failed.balance) === 80000, "failed shift pays nothing");
  const shift3 = await rpc<{ shift_id: string }>("select public.start_shift($1)", [bob]);
  const done = await rpc<{ payout: number; balance: number }>("select public.complete_shift($1, true)", [shift3.shift_id]);
  check(Number(done.payout) === job.salary && Number(done.balance) === 80000 + job.salary, `completed shift pays salary (${job.salary})`);
  await expectError(rpc("select public.complete_shift($1, true)", [shift3.shift_id]), "shift not active", "shift cannot be completed twice");
  const salaryTx = await rpc<number>("select count(*)::int from public.transactions where user_id = $1 and kind = 'salary'", [bob]);
  check(Number(salaryTx) === 1, "salary transaction recorded");

  const shift4 = await rpc<{ shift_id: string }>("select public.start_shift($1)", [bob]);
  await asUser(bob);
  await rpc("select public.resign_job()");
  const afterResign = (await db.query<{ emp: string; shift: string }>(
    "select (select status::text from public.employment where id = $1) as emp, (select status::text from public.work_shifts where id = $2) as shift",
    [reviewed.employment_id, shift4.shift_id],
  )).rows[0];
  check(afterResign.emp === "resigned" && afterResign.shift === "abandoned", "resign_job ends employment and active shift");

  console.log("Smoke test: RLS");
  await db.exec("set role authenticated");
  await asUser(bob);
  check(Number(await rpc<number>("select count(*)::int from public.users")) === 1, "users: only own row visible");
  check(Number(await rpc<number>("select count(*)::int from public.transactions where user_id <> $1", [bob])) === 0, "transactions: only own rows visible");
  check(Number(await rpc<number>("select count(*)::int from public.units")) >= 1, "units: world data readable");
  check(Number(await rpc<number>("select count(*)::int from public.profiles")) === 3, "profiles view: all players visible");
  await expectError(db.query("update public.users set balance = 999999999 where id = $1", [bob]), "", "direct balance update blocked by RLS/grants");
  await db.exec("reset role");
  check(Number(await rpc<number>("select balance::int from public.users where id = $1", [bob])) === 80000 + job.salary, "balance unchanged after blocked update");

  await db.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll SQL checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("\nSQL check crashed:", e);
  process.exit(1);
});
