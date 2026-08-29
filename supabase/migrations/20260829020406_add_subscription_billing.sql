-- Company subscription billing (replaces per-ticket commission).
-- Companies pay a fixed subscription fee for back-office access; they keep
-- 100% of the price they set on trips.price_fcfa. This migration adds the
-- plan catalog, the company/subscription link + status, and the
-- subscription payment ledger. Traveler-side service fees are handled
-- separately in payments (see 20260829020408_add_payment_fee_breakdown.sql)
-- — bookings.total_price_fcfa is untouched and remains the base price only.

-- ============================================================================
-- Tables
-- ============================================================================

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_fcfa integer not null check (price_fcfa >= 0),
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  -- Array of human-readable feature strings, display purposes only — not an
  -- enforced quota/limits mechanism.
  features jsonb not null default '[]'::jsonb,
  -- Hides a plan from new subscriptions without deleting it (existing
  -- company_subscriptions rows keep referencing it via on delete restrict).
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per company (see unique(company_id) below) representing its
-- *current* subscription state — not a history. Renewals/plan changes
-- update this row in place; subscription_payments is the historical ledger.
create table public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_plan_id uuid not null references public.subscription_plans (id) on delete restrict,
  status text not null default 'pending_payment'
    check (status in ('active', 'inactive', 'pending_payment')),
  -- Informational (e.g. "renews on X" in the UI later). The access gate
  -- itself checks `status`, not these dates — no date-based auto-expiry in
  -- this migration.
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  company_subscription_id uuid not null references public.company_subscriptions (id) on delete cascade,
  -- Denormalized from company_subscriptions.company_id via trigger below —
  -- same rationale as bookings.company_id: lets RLS check ownership without
  -- joining through company_subscriptions.
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_plan_id uuid not null references public.subscription_plans (id) on delete restrict,
  amount_fcfa integer not null check (amount_fcfa >= 0),
  -- 'simulated' is the only real value right now — no FedaPay integration
  -- exists yet anywhere in this repo (no supabase/functions/). 'fedapay' is
  -- listed up front so switching the real payment on later doesn't require
  -- widening this constraint.
  provider text not null default 'simulated' check (provider in ('simulated', 'fedapay')),
  provider_transaction_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index company_subscriptions_company_id_idx on public.company_subscriptions (company_id);
create index subscription_payments_company_subscription_id_idx on public.subscription_payments (company_subscription_id);
create index subscription_payments_company_id_idx on public.subscription_payments (company_id);

-- ============================================================================
-- subscription_payments.company_id consistency (mirrors
-- set_booking_company_id in 20260825060934_create_core_schema.sql)
-- ============================================================================

create function public.set_subscription_payment_company_id()
returns trigger
language plpgsql
as $$
begin
  select company_id into new.company_id
  from public.company_subscriptions
  where id = new.company_subscription_id;
  return new;
end;
$$;

create trigger set_subscription_payment_company_id
  before insert or update of company_subscription_id on public.subscription_payments
  for each row execute function public.set_subscription_payment_company_id();

-- ============================================================================
-- Activate subscription on approved payment (mirrors
-- adjust_trip_seats_on_booking_status_change: side effect of a status
-- transition handled here, not left to application code to remember).
-- ============================================================================

create function public.activate_subscription_on_payment_approved()
returns trigger
language plpgsql
as $$
declare
  plan_billing_period text;
  period_length interval;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select billing_period into plan_billing_period
    from public.subscription_plans
    where id = new.subscription_plan_id;

    period_length := case plan_billing_period
      when 'yearly' then interval '1 year'
      else interval '1 month'
    end;

    update public.company_subscriptions
    set
      status = 'active',
      subscription_plan_id = new.subscription_plan_id,
      current_period_start = now(),
      current_period_end = now() + period_length
    where id = new.company_subscription_id;
  end if;

  return new;
end;
$$;

create trigger activate_subscription_on_payment_approved
  before update of status on public.subscription_payments
  for each row execute function public.activate_subscription_on_payment_approved();

-- ============================================================================
-- updated_at maintenance (reuses public.set_updated_at from the core schema
-- migration)
-- ============================================================================

create trigger set_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.company_subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscription_payments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.subscription_plans enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;

-- subscription_plans: public catalog, like companies/routes/trips. Managed
-- exclusively via service_role (no applicative "admin" role exists in this
-- schema yet) — no insert/update/delete policy for anon/authenticated.
create policy "subscription_plans_select_public" on public.subscription_plans
  for select
  using (true);

-- company_subscriptions: private to the owning company. Deliberately NO
-- insert/update/delete policy for authenticated — a company must never be
-- able to self-activate its own subscription. Only service_role (via the
-- simulated payment flow today, a real FedaPay webhook later) can change
-- status, through activate_subscription_on_payment_approved above or a
-- direct service_role write.
create policy "company_subscriptions_select_owner" on public.company_subscriptions
  for select
  using (public.is_company_owner(company_id));

-- subscription_payments: private billing history, same reasoning as
-- payments (traveler tickets) — read-only for the owning company, writes
-- exclusively via service_role.
create policy "subscription_payments_select_owner" on public.subscription_payments
  for select
  using (public.is_company_owner(company_id));

-- ============================================================================
-- Grants
-- Included in the same migration as the CREATE TABLE statements (unlike the
-- core schema, which had its grants added after the fact once "permission
-- denied" surfaced in production) — RLS policies alone do not grant access;
-- PostgREST/Postgres also require the ordinary GRANT.
-- ============================================================================

grant select on public.subscription_plans to anon, authenticated;
grant select on public.company_subscriptions to authenticated;
grant select on public.subscription_payments to authenticated;

grant all on public.subscription_plans to service_role;
grant all on public.company_subscriptions to service_role;
grant all on public.subscription_payments to service_role;
