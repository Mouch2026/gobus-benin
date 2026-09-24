-- Chantier C : documents de chauffeurs (permis, carte d'identité,
-- certificats) + seuil d'alerte d'expiration par compagnie + fonction de
-- balayage appelée par l'Edge Function driver-document-expiry-alerts.
-- La planification pg_cron est dans une migration SÉPARÉE
-- (20260925100000), à pousser APRÈS le déploiement de la fonction.

-- ============================================================================
-- 1. Bucket Storage PRIVÉ. Contrairement à company-logos (public = true,
--    lecture anonyme via /object/public/), ces fichiers sont des données
--    personnelles : aucune lecture anonyme, aucune URL publique, lecture
--    uniquement par URL signée courte générée côté serveur.
--
--    "on conflict do update" plutôt que "do nothing" : garantit que le
--    bucket est privé et porte ces limites même si l'id existait déjà.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  5242880, -- 5 Mio : un PDF scanné recto-verso dépasse souvent 2 Mo
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Extrait la compagnie du 1er segment du chemin
-- ("<company_id>/<driver_id>/<uuid>.<ext>"). Renvoie NULL si ce segment
-- n'est pas un UUID : les policies company-logos font un cast direct
-- ((storage.foldername(name))[1]::uuid) qui LÈVE UNE ERREUR sur un chemin
-- malformé au lieu de refuser. Ici NULL -> is_company_manager_or_owner(NULL)
-- est faux -> refus propre.
create function public.storage_company_id_from_path(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(p_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(p_name))[1])::uuid
  end;
$$;

-- Toutes "to authenticated" : AUCUNE policy pour anon (les policies
-- company-logos n'ont pas de clause "to", elles s'appliquent à PUBLIC).
-- Lecture ET écriture réservées à owner + agency_manager de la compagnie
-- du chemin. Aucune policy UPDATE : un fichier ne se réécrit pas, on
-- supprime puis on ré-uploade.
create policy "driver_documents_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'driver-documents'
    and public.is_company_manager_or_owner(public.storage_company_id_from_path(name))
  );

-- Profondeur imposée : <company_id>/<driver_id>/<fichier>.
create policy "driver_documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'driver-documents'
    and array_length(storage.foldername(name), 1) = 2
    and public.is_company_manager_or_owner(public.storage_company_id_from_path(name))
  );

create policy "driver_documents_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'driver-documents'
    and public.is_company_manager_or_owner(public.storage_company_id_from_path(name))
  );

-- ============================================================================
-- 2. driver_documents
-- ============================================================================

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null check (type in ('permis', 'carte_identite', 'certificat', 'autre')),
  file_path text not null unique,
  -- Nom d'origine, affiché dans la liste. Le fichier stocké porte un nom
  -- généré côté serveur, jamais le nom fourni par l'utilisateur.
  file_name text not null,
  -- Nullable : un certificat peut ne pas avoir d'expiration suivie.
  expiration_date date,
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  -- Posé une seule fois, atomiquement, par sweep_driver_document_expiry() :
  -- même principe que vouchers.refund_notified_at.
  expiry_alert_sent_at timestamptz,
  -- Une ligne ne peut jamais pointer vers le dossier d'une AUTRE compagnie
  -- ou d'un autre chauffeur : la route de téléchargement signe file_path.
  check (file_path like company_id::text || '/' || driver_id::text || '/%'),
  -- Même patron composite que trips.driver_id / driver_unavailability.
  foreign key (driver_id, company_id) references public.drivers (id, company_id)
);

create index driver_documents_driver_id_idx on public.driver_documents (driver_id);

-- Lignes encore à surveiller : c'est ce que balaie la fonction ci-dessous.
create index driver_documents_pending_alert_idx
  on public.driver_documents (company_id, expiration_date)
  where expiration_date is not null and expiry_alert_sent_at is null;

alter table public.driver_documents enable row level security;

-- Lecture réservée à owner + agency_manager (PAS "tout membre", contrairement
-- à drivers) : un agent ne voit même pas la liste, cohérent avec le bucket.
create policy "driver_documents_select_manager" on public.driver_documents
  for select using (public.is_company_manager_or_owner(company_id));
create policy "driver_documents_insert_manager" on public.driver_documents
  for insert with check (
    public.is_company_manager_or_owner(company_id)
    and uploaded_by = auth.uid()
  );
create policy "driver_documents_delete_manager" on public.driver_documents
  for delete using (public.is_company_manager_or_owner(company_id));
-- Pas de policy UPDATE : changer une date d'expiration = supprimer puis
-- ré-uploader, ce qui garde expiry_alert_sent_at cohérent.

grant select, insert, delete on public.driver_documents to authenticated;
grant all on public.driver_documents to service_role;
-- Aucun GRANT anon, volontairement (comme drivers / boarding_validations) :
-- la table n'a aucune lecture publique.

-- ============================================================================
-- 3. Seuil d'alerte par compagnie — même patron que cash_ceiling_fcfa et
--    lock_timeout_minutes : une colonne sur companies, pas de table de
--    configuration séparée. Modifiable par le propriétaire seul
--    (permission documentAlerts.manage, côté application).
-- ============================================================================

alter table public.companies
  add column document_alert_days integer not null default 30
    check (document_alert_days between 1 and 365);

-- ============================================================================
-- 4. sweep_driver_document_expiry — appelée par l'Edge Function
--    driver-document-expiry-alerts (service_role uniquement).
--
--    Revendique atomiquement les documents qui franchissent le seuil (un
--    document n'est JAMAIS renotifié : expiry_alert_sent_at n'est posé
--    qu'une fois, la clause "is null" est ce qui garantit l'unicité même
--    sous deux exécutions concurrentes), et crée dans la MÊME transaction
--    les notifications in-app — deux lignes par document (owner, puis
--    agency_manager) car target_role ne porte qu'une seule valeur ; les
--    agents ne reçoivent rien. target_agency_id reste NULL : un chauffeur
--    n'est rattaché à aucune agence.
--
--    Les documents des chauffeurs archivés sont ignorés (ils seront repris
--    si le chauffeur est réactivé, puisqu'ils ne sont pas revendiqués).
--    Un document déjà expiré au moment où il est franchi est aussi
--    signalé, une fois, en niveau 'critical'.
--
--    Colonnes de sortie préfixées : sans cela, les noms de sortie entrent
--    en conflit avec les colonnes de même nom dans le corps plpgsql (même
--    piège que get_company_bookings_overview, 20260909100000).
-- ============================================================================

create function public.sweep_driver_document_expiry()
returns table (
  alert_company_id uuid,
  alert_driver_id uuid,
  driver_name text,
  document_id uuid,
  doc_type text,
  doc_expiration_date date,
  days_left integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
begin
  return query
    with claimed as (
      update public.driver_documents d
      set expiry_alert_sent_at = now()
      from public.companies c, public.drivers dr
      where c.id = d.company_id
        and dr.id = d.driver_id
        and dr.is_active
        and d.expiration_date is not null
        and d.expiry_alert_sent_at is null
        and d.expiration_date <= v_today + c.document_alert_days
      returning
        d.company_id as c_id,
        d.driver_id as dr_id,
        dr.full_name as dr_name,
        d.id as doc_id,
        d.type as d_type,
        d.expiration_date as d_exp,
        (d.expiration_date - v_today) as d_left
    ),
    notified as (
      insert into public.company_notifications
        (company_id, kind, type, level, title, body, action_href, target_role)
      select
        cl.c_id,
        'event',
        'driver_document_expiring',
        case when cl.d_left < 0 then 'critical' else 'warning' end,
        case when cl.d_left < 0 then 'Document de chauffeur expiré'
             else 'Document de chauffeur bientôt expiré' end,
        (case cl.d_type
           when 'permis' then 'Permis'
           when 'carte_identite' then 'Carte d''identité'
           when 'certificat' then 'Certificat'
           else 'Document'
         end)
        || ' de ' || cl.dr_name || ' — '
        || case when cl.d_left < 0 then 'expiré le '
                when cl.d_left = 0 then 'expire aujourd''hui, le '
                else 'expire le ' end
        || to_char(cl.d_exp, 'DD/MM/YYYY'),
        '/chauffeurs/' || cl.dr_id,
        r.role
      from claimed cl
      cross join (values ('owner'), ('agency_manager')) as r(role)
      returning 1
    )
    select cl.c_id, cl.dr_id, cl.dr_name, cl.doc_id, cl.d_type, cl.d_exp, cl.d_left
    from claimed cl;
end;
$$;

revoke execute on function public.sweep_driver_document_expiry() from public;
grant execute on function public.sweep_driver_document_expiry() to service_role;
