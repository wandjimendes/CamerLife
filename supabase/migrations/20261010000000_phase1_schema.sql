-- =============================================================================
-- Cameroon Life - Phase 1 schema
-- Apply with: supabase db push   (or paste into the SQL editor)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.family_role as enum ('father', 'mother', 'cousin');
create type public.building_kind as enum (
  'house', 'villa', 'apartment_block', 'shop_block',
  'hospital', 'police', 'fire', 'park', 'cinema',
  'bus_station', 'train_station', 'airport'
);
create type public.unit_kind as enum ('room', 'studio', 'apartment', 'shop', 'house', 'villa');
create type public.listing_status as enum ('none', 'sale', 'rent');
create type public.job_status as enum ('open', 'closed');
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.employment_status as enum ('active', 'fired', 'resigned');
create type public.shift_status as enum ('active', 'completed', 'failed', 'abandoned');

-- ---------------------------------------------------------------------------
-- Towns
-- ---------------------------------------------------------------------------
create table public.towns (
  id       text primary key,
  name     text not null,
  map_key  text not null,
  spawn_x  integer not null default 0,
  spawn_y  integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Families & users
-- ---------------------------------------------------------------------------
create table public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 24),
  created_by uuid,
  created_at timestamptz not null default now()
);
-- Family Name is UNIQUE (case-insensitive).
create unique index families_name_unique_ci on public.families (lower(name));

create table public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 24),
  family_id  uuid not null references public.families (id),
  hair       smallint not null default 0 check (hair between 0 and 7),
  skin       smallint not null default 0 check (skin between 0 and 7),
  clothes    smallint not null default 0 check (clothes between 0 and 7),
  balance    bigint not null default 0 check (balance >= 0),
  town_id    text not null default 'douala' references public.towns (id),
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.families
  add constraint families_created_by_fkey
  foreign key (created_by) references public.users (id) on delete set null;

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  role      public.family_role not null default 'cousin',
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  unique (user_id) -- one family per player
);

-- Public profile projection (never exposes balance / admin flag).
create view public.profiles as
  select u.id, u.first_name, f.name as family_name, u.hair, u.skin, u.clothes, u.town_id
  from public.users u
  join public.families f on f.id = u.family_id;

-- ---------------------------------------------------------------------------
-- Real estate
-- ---------------------------------------------------------------------------
create table public.buildings (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  town_id     text not null references public.towns (id),
  name        text not null,
  kind        public.building_kind not null,
  x           integer not null,
  y           integer not null,
  w           integer not null,
  h           integer not null,
  door_x      integer not null,
  door_y      integer not null,
  is_facility boolean not null default false
);
create index buildings_town_idx on public.buildings (town_id);

create table public.units (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  building_id    uuid not null references public.buildings (id) on delete cascade,
  kind           public.unit_kind not null,
  label          text not null,
  owner_id       uuid references public.users (id) on delete set null,
  tenant_id      uuid references public.users (id) on delete set null,
  lease_until    timestamptz,
  listing_status public.listing_status not null default 'none',
  sale_price     bigint check (sale_price is null or sale_price > 0),
  rent_price     bigint check (rent_price is null or rent_price > 0),
  interior_w     integer not null default 10,
  interior_h     integer not null default 8
);
create index units_building_idx on public.units (building_id);
create index units_owner_idx on public.units (owner_id);
create index units_listing_idx on public.units (listing_status) where listing_status <> 'none';

create table public.furniture (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units (id) on delete cascade,
  item_key   text not null,
  x          integer not null,
  y          integer not null,
  rotation   smallint not null default 0,
  placed_by  uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index furniture_unit_idx on public.furniture (unit_id);

-- ---------------------------------------------------------------------------
-- Jobs (admin managed)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id          uuid primary key default gen_random_uuid(),
  town_id     text not null references public.towns (id),
  building_id uuid not null references public.buildings (id) on delete cascade,
  title       text not null,
  description text,
  salary      bigint not null check (salary >= 0), -- paid per completed shift
  slots       integer not null default 1 check (slots >= 0),
  status      public.job_status not null default 'open',
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index jobs_town_idx on public.jobs (town_id, status);

create table public.job_applications (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  status      public.application_status not null default 'pending',
  message     text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users (id) on delete set null
);
-- one pending application per job per player
create unique index job_applications_pending_unique
  on public.job_applications (job_id, user_id) where status = 'pending';

create table public.employment (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  salary        bigint not null check (salary >= 0),
  status        public.employment_status not null default 'active',
  hired_at      timestamptz not null default now(),
  ended_at      timestamptz,
  last_shift_at timestamptz
);
-- one active job per player
create unique index employment_active_unique on public.employment (user_id) where status = 'active';
create index employment_job_idx on public.employment (job_id, status);

create table public.work_shifts (
  id            uuid primary key default gen_random_uuid(),
  employment_id uuid not null references public.employment (id) on delete cascade,
  user_id       uuid not null references public.users (id) on delete cascade,
  status        public.shift_status not null default 'active',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  payout        bigint not null default 0
);
create unique index work_shifts_active_unique on public.work_shifts (user_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
create table public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  amount     bigint not null, -- positive = credit, negative = debit
  kind       text not null,   -- signup_budget | buy_unit | sell_unit | rent_paid | rent_received | salary
  note       text,
  created_at timestamptz not null default now()
);
create index transactions_user_idx on public.transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.users where id = auth.uid()), false);
$$;

-- True only for calls made with the service role key (game server, admin CLI).
-- Deliberately checks the JWT claim ONLY: inside a SECURITY DEFINER function
-- current_user is the function owner (postgres), so a role-name fallback would
-- let any signed-in player pass the "server only" checks below.
-- To call server-only RPCs from the SQL editor, first run:
--   select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create or replace function public.is_service_role()
returns boolean
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
$$;

-- Family-name availability check used by the signup form (anon callable).
create or replace function public.is_family_name_available(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.families where lower(name) = lower(trim(p_name)));
$$;
grant execute on function public.is_family_name_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signup trigger: creates family + user row with a random starting budget.
-- Signup metadata: { first_name, family_name, hair, skin, clothes, family_role }
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_first    text;
  v_family   text;
  v_fam_id   uuid;
  v_budget   bigint;
  v_role     public.family_role;
  v_hair     smallint;
  v_skin     smallint;
  v_clothes  smallint;
begin
  v_first  := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Player'), 24);
  v_family := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'family_name'), ''), 'Family' || left(replace(new.id::text, '-', ''), 6)), 24);
  v_hair    := least(greatest(coalesce((new.raw_user_meta_data ->> 'hair')::int, 0), 0), 7);
  v_skin    := least(greatest(coalesce((new.raw_user_meta_data ->> 'skin')::int, 0), 0), 7);
  v_clothes := least(greatest(coalesce((new.raw_user_meta_data ->> 'clothes')::int, 0), 0), 7);
  begin
    v_role := coalesce((new.raw_user_meta_data ->> 'family_role')::public.family_role, 'father');
  exception when others then
    v_role := 'father';
  end;

  -- Random starting budget: 50k / 500k / 5M FCFA
  v_budget := (array[50000, 500000, 5000000])[1 + floor(random() * 3)::int];

  -- Family Name must be unique: the unique index raises if taken, which fails signup.
  insert into public.families (name, created_by) values (v_family, null) returning id into v_fam_id;

  insert into public.users (id, first_name, family_id, hair, skin, clothes, balance)
  values (new.id, v_first, v_fam_id, v_hair, v_skin, v_clothes, v_budget);

  update public.families set created_by = new.id where id = v_fam_id;

  insert into public.family_members (family_id, user_id, role) values (v_fam_id, new.id, v_role);

  insert into public.transactions (user_id, amount, kind, note)
  values (new.id, v_budget, 'signup_budget', 'Welcome to Cameroon Life!');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPC: appearance
-- ---------------------------------------------------------------------------
create or replace function public.update_appearance(p_hair int, p_skin int, p_clothes int)
returns void
language sql security definer set search_path = public as $$
  update public.users
     set hair = least(greatest(p_hair, 0), 7),
         skin = least(greatest(p_skin, 0), 7),
         clothes = least(greatest(p_clothes, 0), 7)
   where id = auth.uid();
$$;
grant execute on function public.update_appearance(int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: real estate
-- ---------------------------------------------------------------------------
create or replace function public.buy_unit(p_unit uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_unit   public.units%rowtype;
  v_bal    bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_unit from public.units where id = p_unit for update;
  if not found then raise exception 'unit not found'; end if;
  if v_unit.listing_status <> 'sale' or v_unit.sale_price is null then
    raise exception 'unit is not for sale';
  end if;
  if v_unit.owner_id = v_user then raise exception 'you already own this unit'; end if;

  select balance into v_bal from public.users where id = v_user for update;
  if v_bal < v_unit.sale_price then raise exception 'insufficient funds'; end if;

  update public.users set balance = balance - v_unit.sale_price where id = v_user;
  insert into public.transactions (user_id, amount, kind, note)
  values (v_user, -v_unit.sale_price, 'buy_unit', 'Bought ' || v_unit.label);

  if v_unit.owner_id is not null then
    update public.users set balance = balance + v_unit.sale_price where id = v_unit.owner_id;
    insert into public.transactions (user_id, amount, kind, note)
    values (v_unit.owner_id, v_unit.sale_price, 'sell_unit', 'Sold ' || v_unit.label);
  end if;

  update public.units
     set owner_id = v_user, tenant_id = null, lease_until = null,
         listing_status = 'none', sale_price = null, rent_price = null
   where id = p_unit;

  select balance into v_bal from public.users where id = v_user;
  return jsonb_build_object('ok', true, 'balance', v_bal, 'unit_id', p_unit);
end;
$$;
grant execute on function public.buy_unit(uuid) to authenticated;

create or replace function public.rent_unit(p_unit uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_unit public.units%rowtype;
  v_bal  bigint;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_unit from public.units where id = p_unit for update;
  if not found then raise exception 'unit not found'; end if;
  if v_unit.listing_status <> 'rent' or v_unit.rent_price is null then
    raise exception 'unit is not for rent';
  end if;
  if v_unit.owner_id = v_user then raise exception 'you own this unit'; end if;
  if v_unit.tenant_id is not null and coalesce(v_unit.lease_until, now()) > now() then
    raise exception 'unit already rented';
  end if;

  select balance into v_bal from public.users where id = v_user for update;
  if v_bal < v_unit.rent_price then raise exception 'insufficient funds'; end if;

  update public.users set balance = balance - v_unit.rent_price where id = v_user;
  insert into public.transactions (user_id, amount, kind, note)
  values (v_user, -v_unit.rent_price, 'rent_paid', 'Rent: ' || v_unit.label || ' (30 days)');

  if v_unit.owner_id is not null then
    update public.users set balance = balance + v_unit.rent_price where id = v_unit.owner_id;
    insert into public.transactions (user_id, amount, kind, note)
    values (v_unit.owner_id, v_unit.rent_price, 'rent_received', 'Rent from tenant: ' || v_unit.label);
  end if;

  update public.units
     set tenant_id = v_user, lease_until = now() + interval '30 days', listing_status = 'none'
   where id = p_unit;

  select balance into v_bal from public.users where id = v_user;
  return jsonb_build_object('ok', true, 'balance', v_bal, 'unit_id', p_unit);
end;
$$;
grant execute on function public.rent_unit(uuid) to authenticated;

-- Owner lists / unlists a unit. Admins can list any unit (Admin Panel, Phase 2).
create or replace function public.set_unit_listing(p_unit uuid, p_status public.listing_status, p_price bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_unit public.units%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_unit from public.units where id = p_unit for update;
  if not found then raise exception 'unit not found'; end if;
  if v_unit.owner_id is distinct from v_user and not public.is_admin() then
    raise exception 'not the owner';
  end if;
  if p_status <> 'none' and (p_price is null or p_price <= 0) then
    raise exception 'price must be positive';
  end if;
  if p_status = 'rent' and v_unit.tenant_id is not null and coalesce(v_unit.lease_until, now()) > now() then
    raise exception 'unit currently has a tenant';
  end if;

  update public.units
     set listing_status = p_status,
         sale_price = case when p_status = 'sale' then p_price else null end,
         rent_price = case when p_status = 'rent' then p_price else null end
   where id = p_unit;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.set_unit_listing(uuid, public.listing_status, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: jobs
-- ---------------------------------------------------------------------------
create or replace function public.apply_for_job(p_job uuid, p_message text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_job  public.jobs%rowtype;
  v_id   uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_job from public.jobs where id = p_job;
  if not found or v_job.status <> 'open' then raise exception 'job is not open'; end if;
  if exists (select 1 from public.employment where user_id = v_user and status = 'active') then
    raise exception 'you already have a job - resign first';
  end if;
  insert into public.job_applications (job_id, user_id, message)
  values (p_job, v_user, left(p_message, 280)) returning id into v_id;
  return jsonb_build_object('ok', true, 'application_id', v_id);
exception when unique_violation then
  raise exception 'you already applied for this job';
end;
$$;
grant execute on function public.apply_for_job(uuid, text) to authenticated;

create or replace function public.resign_job()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.employment set status = 'resigned', ended_at = now()
   where user_id = v_user and status = 'active';
  update public.work_shifts set status = 'abandoned', ended_at = now()
   where user_id = v_user and status = 'active';
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.resign_job() to authenticated;

-- Admin: approve / reject an application (sets salary on approval).
create or replace function public.review_application(p_application uuid, p_approve boolean, p_salary bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app  public.job_applications%rowtype;
  v_job  public.jobs%rowtype;
  v_emp  uuid;
  v_hired int;
begin
  if not (public.is_admin() or public.is_service_role()) then raise exception 'admin only'; end if;
  select * into v_app from public.job_applications where id = p_application for update;
  if not found then raise exception 'application not found'; end if;
  if v_app.status <> 'pending' then raise exception 'application already reviewed'; end if;

  if not p_approve then
    update public.job_applications
       set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
     where id = p_application;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  select * into v_job from public.jobs where id = v_app.job_id for update;
  select count(*) into v_hired from public.employment where job_id = v_job.id and status = 'active';
  if v_hired >= v_job.slots then raise exception 'no slots left for this job'; end if;
  if exists (select 1 from public.employment where user_id = v_app.user_id and status = 'active') then
    raise exception 'player already employed';
  end if;

  insert into public.employment (user_id, job_id, salary)
  values (v_app.user_id, v_job.id, coalesce(p_salary, v_job.salary)) returning id into v_emp;

  update public.job_applications
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_application;

  return jsonb_build_object('ok', true, 'status', 'approved', 'employment_id', v_emp);
end;
$$;
grant execute on function public.review_application(uuid, boolean, bigint) to authenticated;

create or replace function public.set_employee_salary(p_employment uuid, p_salary bigint)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_service_role()) then raise exception 'admin only'; end if;
  if p_salary < 0 then raise exception 'salary must be >= 0'; end if;
  update public.employment set salary = p_salary where id = p_employment and status = 'active';
end;
$$;
grant execute on function public.set_employee_salary(uuid, bigint) to authenticated;

create or replace function public.fire_employee(p_employment uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_service_role()) then raise exception 'admin only'; end if;
  update public.employment set status = 'fired', ended_at = now()
   where id = p_employment and status = 'active';
  update public.work_shifts s set status = 'abandoned', ended_at = now()
   where s.employment_id = p_employment and s.status = 'active';
end;
$$;
grant execute on function public.fire_employee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: work shifts (server-only, called with the service role key)
-- ---------------------------------------------------------------------------
create or replace function public.start_shift(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp   public.employment%rowtype;
  v_job   public.jobs%rowtype;
  v_shift uuid;
begin
  if not public.is_service_role() then raise exception 'server only'; end if;
  select * into v_emp from public.employment where user_id = p_user and status = 'active';
  if not found then raise exception 'not employed'; end if;
  select * into v_job from public.jobs where id = v_emp.job_id;

  -- clean up stale shifts (e.g. server restart)
  update public.work_shifts set status = 'abandoned', ended_at = now()
   where user_id = p_user and status = 'active';

  insert into public.work_shifts (employment_id, user_id) values (v_emp.id, p_user) returning id into v_shift;
  return jsonb_build_object(
    'shift_id', v_shift, 'employment_id', v_emp.id, 'salary', v_emp.salary,
    'job_title', v_job.title, 'building_id', v_job.building_id
  );
end;
$$;
revoke execute on function public.start_shift(uuid) from public, anon, authenticated;

create or replace function public.complete_shift(p_shift uuid, p_success boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shift public.work_shifts%rowtype;
  v_emp   public.employment%rowtype;
  v_pay   bigint := 0;
  v_bal   bigint;
begin
  if not public.is_service_role() then raise exception 'server only'; end if;
  select * into v_shift from public.work_shifts where id = p_shift for update;
  if not found or v_shift.status <> 'active' then raise exception 'shift not active'; end if;
  select * into v_emp from public.employment where id = v_shift.employment_id;

  if p_success and v_emp.status = 'active' then
    v_pay := v_emp.salary;
    update public.users set balance = balance + v_pay where id = v_shift.user_id;
    insert into public.transactions (user_id, amount, kind, note)
    values (v_shift.user_id, v_pay, 'salary', 'Shift completed');
    update public.employment set last_shift_at = now() where id = v_emp.id;
  end if;

  update public.work_shifts
     set status = case when p_success then 'completed'::public.shift_status else 'failed'::public.shift_status end,
         ended_at = now(), payout = v_pay
   where id = p_shift;

  select balance into v_bal from public.users where id = v_shift.user_id;
  return jsonb_build_object('ok', true, 'payout', v_pay, 'balance', v_bal);
end;
$$;
revoke execute on function public.complete_shift(uuid, boolean) from public, anon, authenticated;

create or replace function public.abandon_shift(p_shift uuid)
returns void
language sql security definer set search_path = public as $$
  update public.work_shifts set status = 'abandoned', ended_at = now()
   where id = p_shift and status = 'active' and public.is_service_role();
$$;
revoke execute on function public.abandon_shift(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.towns            enable row level security;
alter table public.families         enable row level security;
alter table public.users            enable row level security;
alter table public.family_members   enable row level security;
alter table public.buildings        enable row level security;
alter table public.units            enable row level security;
alter table public.furniture        enable row level security;
alter table public.jobs             enable row level security;
alter table public.job_applications enable row level security;
alter table public.employment       enable row level security;
alter table public.work_shifts      enable row level security;
alter table public.transactions     enable row level security;

-- World data: readable by everyone signed in
create policy "towns readable" on public.towns for select to authenticated using (true);
create policy "buildings readable" on public.buildings for select to authenticated using (true);
create policy "units readable" on public.units for select to authenticated using (true);
create policy "furniture readable" on public.furniture for select to authenticated using (true);
create policy "families readable" on public.families for select to authenticated using (true);
create policy "family members readable" on public.family_members for select to authenticated using (true);
create policy "jobs readable" on public.jobs for select to authenticated using (status = 'open' or public.is_admin());

-- Own data
create policy "users read own" on public.users for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "applications read own" on public.job_applications for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "employment read own" on public.employment for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "shifts read own" on public.work_shifts for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "transactions read own" on public.transactions for select to authenticated using (user_id = auth.uid());

-- Admin management (Admin Panel in Phase 2 can hit these directly)
create policy "admin manage jobs" on public.jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage buildings" on public.buildings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage users" on public.users for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Note: balances, units ownership, furniture, shifts and employment are only
-- mutated through the SECURITY DEFINER functions above or by the game server
-- using the service role key (which bypasses RLS).

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on all tables in schema public to authenticated;
