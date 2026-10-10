/**
 * Minimal admin CLI (the full Admin Panel UI ships in Phase 2).
 * Uses the service role key from apps/server/.env.
 *
 *   npm run admin -- applications            list pending applications
 *   npm run admin -- approve <appId> [salary] approve + hire (optionally override salary)
 *   npm run admin -- reject <appId>
 *   npm run admin -- employees               list active employees
 *   npm run admin -- fire <employmentId>
 *   npm run admin -- salary <employmentId> <amount>
 *   npm run admin -- jobs                    list jobs
 *   npm run admin -- job <buildingSlug> "<title>" <salary> <slots>
 *   npm run admin -- players                 list players with balances
 *   npm run admin -- make-admin <userId>
 *   npm run admin -- list-unit <unitSlug> sale|rent|none [price]   tag a property for sale/rent
 */
import { db } from "../services/db.ts";

const [cmd, ...args] = process.argv.slice(2);

function table(rows: unknown[]) {
  if (!rows.length) console.log("(none)");
  else console.table(rows);
}

async function main() {
  switch (cmd) {
    case "applications": {
      const { data, error } = await db
        .from("job_applications")
        .select("id, status, created_at, message, users:user_id(first_name), jobs:job_id(title)")
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      table(
        (data ?? []).map((a: any) => ({
          id: a.id,
          player: a.users?.first_name,
          job: a.jobs?.title,
          message: a.message,
          applied: a.created_at,
        })),
      );
      break;
    }
    case "approve": {
      const [id, salary] = args;
      const { data, error } = await db.rpc("review_application", {
        p_application: id,
        p_approve: true,
        p_salary: salary ? Number(salary) : null,
      });
      if (error) throw error;
      console.log(data);
      break;
    }
    case "reject": {
      const { data, error } = await db.rpc("review_application", { p_application: args[0], p_approve: false });
      if (error) throw error;
      console.log(data);
      break;
    }
    case "employees": {
      const { data, error } = await db
        .from("employment")
        .select("id, salary, hired_at, last_shift_at, users:user_id(first_name), jobs:job_id(title)")
        .eq("status", "active");
      if (error) throw error;
      table((data ?? []).map((e: any) => ({ id: e.id, player: e.users?.first_name, job: e.jobs?.title, salary: e.salary, lastShift: e.last_shift_at })));
      break;
    }
    case "fire": {
      const { error } = await db.rpc("fire_employee", { p_employment: args[0] });
      if (error) throw error;
      console.log("fired");
      break;
    }
    case "salary": {
      const { error } = await db.rpc("set_employee_salary", { p_employment: args[0], p_salary: Number(args[1]) });
      if (error) throw error;
      console.log("salary updated");
      break;
    }
    case "jobs": {
      const { data, error } = await db.from("jobs").select("id, title, salary, slots, status, town_id, buildings:building_id(name)");
      if (error) throw error;
      table((data ?? []).map((j: any) => ({ id: j.id, title: j.title, where: j.buildings?.name, salary: j.salary, slots: j.slots, status: j.status })));
      break;
    }
    case "job": {
      const [slug, title, salary, slots] = args;
      const { data: b, error: be } = await db.from("buildings").select("id, town_id").eq("slug", slug).single();
      if (be) throw be;
      const { data, error } = await db
        .from("jobs")
        .insert({ town_id: b.town_id, building_id: b.id, title, salary: Number(salary), slots: Number(slots ?? 1) })
        .select("id")
        .single();
      if (error) throw error;
      console.log("created job", data.id);
      break;
    }
    case "players": {
      const { data, error } = await db.from("users").select("id, first_name, balance, is_admin, town_id, families:family_id(name)").order("created_at");
      if (error) throw error;
      table((data ?? []).map((u: any) => ({ id: u.id, name: `${u.first_name} ${u.families?.name}`, balance: u.balance, admin: u.is_admin, town: u.town_id })));
      break;
    }
    case "make-admin": {
      const { error } = await db.from("users").update({ is_admin: true }).eq("id", args[0]);
      if (error) throw error;
      console.log("ok");
      break;
    }
    case "list-unit": {
      const [slug, status, price] = args;
      const update =
        status === "none"
          ? { listing_status: "none", sale_price: null, rent_price: null }
          : status === "sale"
            ? { listing_status: "sale", sale_price: Number(price), rent_price: null }
            : { listing_status: "rent", rent_price: Number(price), sale_price: null };
      const { error } = await db.from("units").update(update).eq("slug", slug);
      if (error) throw error;
      console.log("ok");
      break;
    }
    default:
      console.log("Usage: see header of apps/server/src/cli/admin.ts");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
