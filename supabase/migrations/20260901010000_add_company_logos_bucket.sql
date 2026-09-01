-- Premier usage de Supabase Storage sur ce projet. Bucket public dédié aux
-- logos de compagnie (déjà consommés tels quels via companies.logo_url par
-- /recherche, page sans connexion — aucune donnée confidentielle ici,
-- contrairement à l'abonnement ou aux paiements).
--
-- file_size_limit/allowed_mime_types en dur ici comme deuxième ligne de
-- défense, indépendante de la validation côté Server Action (jamais faire
-- confiance au seul client).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  2097152, -- 2 Mo
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Chemin : {company_id}/logo.{ext} — storage.foldername(name) (fonction
-- native Supabase) renvoie le premier segment du chemin, ce qui permet de
-- vérifier la propriété directement dans la policy via is_company_owner()
-- (déjà utilisée partout ailleurs — routes, bus_layouts — pas une
-- nouvelle vérification). is_company_owner n'a aucun GRANT EXECUTE
-- explicite dans ce projet, mais Postgres l'accorde à PUBLIC par défaut
-- tant que ce n'est pas révoqué — déjà comme ça qu'elle fonctionne dans
-- les policies existantes.

create policy "company_logos_select_public"
on storage.objects for select
using (bucket_id = 'company-logos');

create policy "company_logos_insert_owner"
on storage.objects for insert
with check (
  bucket_id = 'company-logos'
  and public.is_company_owner((storage.foldername(name))[1]::uuid)
);

create policy "company_logos_update_owner"
on storage.objects for update
using (
  bucket_id = 'company-logos'
  and public.is_company_owner((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'company-logos'
  and public.is_company_owner((storage.foldername(name))[1]::uuid)
);

create policy "company_logos_delete_owner"
on storage.objects for delete
using (
  bucket_id = 'company-logos'
  and public.is_company_owner((storage.foldername(name))[1]::uuid)
);
