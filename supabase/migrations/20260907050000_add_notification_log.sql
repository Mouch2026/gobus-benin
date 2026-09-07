-- Journal des notifications envoyées au voyageur (confirmation de
-- réservation, annulation de trajet, avoir en attente de remboursement)
-- — écrit au moment de l'envoi réel par packages/shared/src/lib/
-- notifications/notificationLog.ts, jamais déduit après coup. Même
-- convention RLS/GRANT que points_ledger/vouchers : lecture propre
-- uniquement, toute écriture passe par service_role.

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('booking_confirmation', 'trip_cancellation', 'voucher_refund_pending')),
  booking_id uuid references public.bookings (id) on delete set null,
  voucher_id uuid references public.vouchers (id) on delete set null,
  -- Une seule valeur possible aujourd'hui plutôt qu'un texte libre — prêt
  -- pour WhatsApp demain (ajouter la valeur au check), sans risquer des
  -- valeurs non normalisées entre-temps.
  channel text not null default 'email' check (channel in ('email')),
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  constraint notification_log_target_check check (booking_id is not null or voucher_id is not null)
);

create index notification_log_user_id_idx on public.notification_log (user_id);

alter table public.notification_log enable row level security;

create policy "notification_log_select_own" on public.notification_log
  for select
  using (user_id = auth.uid());
-- Aucune policy insert/update/delete pour authenticated : toute écriture
-- vient de packages/shared/notifications via supabaseAdmin (service_role)
-- — même principe que points_ledger/vouchers.

grant select on public.notification_log to authenticated;
grant all on public.notification_log to service_role;
-- No anon grant: comme points_ledger/vouchers, n'existe que pour un compte connecté.
