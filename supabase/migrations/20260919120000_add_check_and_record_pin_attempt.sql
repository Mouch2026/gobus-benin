-- Chantier 6 (correctif) : checkAndRecordPinAttempt côté TypeScript
-- (lock-actions.ts) faisait un SELECT count() puis un INSERT séparés,
-- sans verrou — vérifié en conditions réelles : 8 tentatives concurrentes
-- (Promise.all, aucun await entre elles) ont TOUTES été autorisées au
-- lieu de 3 max, une vraie contournement du rate-limit sous script
-- automatisé (exactement le profil d'attaque contre lequel ce rate-limit
-- existe). Corrigé en déplaçant le compte-puis-décide dans une seule
-- fonction SQL, avec un verrou explicite sur la ligne company_members
-- correspondante — même patron que record_payment_part_received
-- (chantier 3c/4) : verrouiller la ligne parente FOR UPDATE avant de
-- calculer, pour sérialiser les tentatives concurrentes sur ce même
-- membre plutôt que de les laisser toutes lire le même état "sous la
-- limite" avant qu'aucune n'ait encore écrit.

create function public.check_and_record_pin_attempt(p_locked_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
begin
  perform 1 from public.company_members where id = p_locked_member_id for update;

  select count(*) into v_recent_count
  from public.pin_attempts
  where locked_member_id = p_locked_member_id
    and created_at > now() - interval '5 minutes';

  if v_recent_count >= 3 then
    return false;
  end if;

  insert into public.pin_attempts (locked_member_id) values (p_locked_member_id);
  return true;
end;
$$;

revoke execute on function public.check_and_record_pin_attempt(uuid) from public;
grant execute on function public.check_and_record_pin_attempt(uuid) to service_role;
