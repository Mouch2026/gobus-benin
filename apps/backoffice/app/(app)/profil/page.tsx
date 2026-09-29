import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../_components";
import { ProfilForm } from "./ProfilForm";
import { PasswordForm } from "./PasswordForm";
import { PinForm } from "./PinForm";

type CompanyProfile = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
};

// requireCompany()'s own Company type only selects id/name/slug — not
// enough for this page, hence a dedicated fetch here.
async function getCompanyProfile(companyId: string): Promise<CompanyProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, phone, email, logo_url")
    .eq("id", companyId)
    .single();

  if (error) {
    console.error("Impossible de charger le profil :", error.message);
    return null;
  }

  return data;
}

export default async function ProfilPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const profile = await getCompanyProfile(result.company.id);
  // Trou trouvé par l'audit "gardes d'accès serveur" : nom/téléphone/
  // e-mail/logo sont une vraie donnée de compagnie (companyProfile.manage,
  // owner uniquement), pas un réglage personnel — le formulaire éditable
  // ne s'affiche donc plus que pour le propriétaire ; un non-propriétaire
  // voit au plus ces informations en lecture seule, jamais le formulaire.
  const canManageCompanyProfile = can(result.role, "companyProfile.manage");

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-950">Profil</h1>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        {!profile ? (
          <p className="text-zinc-500">
            Impossible de charger le profil pour le moment.
          </p>
        ) : canManageCompanyProfile ? (
          <ProfilForm company={profile} />
        ) : (
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-zinc-500">Nom de la compagnie</dt>
              <dd className="text-zinc-950">{profile.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Téléphone</dt>
              <dd className="text-zinc-950">{profile.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">E-mail</dt>
              <dd className="text-zinc-950">{profile.email ?? "—"}</dd>
            </div>
          </dl>
        )}
      </div>

      <h2 className="mb-6 mt-8 text-lg font-semibold text-zinc-950">
        Changer le mot de passe
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <PasswordForm />
      </div>

      <h2 className="mb-6 mt-8 text-lg font-semibold text-zinc-950">
        Changer le code PIN
      </h2>
      <p className="mb-4 -mt-4 text-sm text-zinc-500">
        Utilisé pour déverrouiller votre poste après une inactivité, ou pour laisser un collègue
        reprendre la main dessus.
      </p>
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <PinForm />
      </div>
    </div>
  );
}
