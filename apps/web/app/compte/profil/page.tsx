import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccountShell } from "../_shared";
import { ProfilForm } from "./ProfilForm";
import { PasswordForm } from "./PasswordForm";

export default async function ProfilPage() {
  await requireUser("/compte/profil");

  // supabase.auth.getUser() plutôt que les claims JWT de requireUser() :
  // valeur fraîche, pas potentiellement périmée juste après une mise à
  // jour de user_metadata.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const fullName = (userData.user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? "";
  const email = userData.user?.email ?? "";

  return (
    <AccountShell active="/compte/profil" title="Profil">
      <div className="flex flex-col gap-8">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <ProfilForm fullName={fullName} email={email} />
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">
            Changer le mot de passe
          </h2>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <PasswordForm />
          </div>
        </div>
      </div>
    </AccountShell>
  );
}
