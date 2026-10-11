-- =============================================================================
-- Family names are no longer unique. Several players may found families with
-- the same name; a family is identified by its id, not its name.
-- =============================================================================

drop index if exists public.families_name_unique_ci;
create index if not exists families_name_idx on public.families (lower(name));

drop function if exists public.is_family_name_available(text);
