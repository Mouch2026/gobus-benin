-- Corrige "permission denied for function assign_and_insert_passengers"
-- (code 42501) — confirmé réellement en appelant create_booking_for_company
-- avec un p_user_id (pas supposé).
--
-- Cause : create_booking (security invoker) appelle en interne
-- assign_and_insert_passengers (elle aussi security invoker) — toute la
-- chaîne reste exécutée avec le rôle Postgres RÉEL de l'appelant initial,
-- jamais élevée. Quand create_booking_for_company (20260909120000) est
-- appelée par le back-office via service_role, current_user reste
-- service_role jusqu'au bout de la chaîne, y compris dans cet appel
-- interne — mais assign_and_insert_passengers n'a jamais été accordée
-- qu'à authenticated (20260830030000_add_bus_layouts_and_seat_assignment.sql),
-- jamais à service_role, puisque ce chemin d'appel n'existait pas avant
-- ce chantier.

grant execute on function public.assign_and_insert_passengers(uuid, uuid, text[]) to service_role;
