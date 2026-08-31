import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../_components";
import { Navigation } from "../_navigation";
import { ProfilForm } from "./ProfilForm";
import { PasswordForm } from "./PasswordForm";

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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto max-w-xl px-6 py-8">
        <h1 className="mb-6 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Profil</h1>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {profile ? (
            <ProfilForm company={profile} />
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400">
              Impossible de charger le profil pour le moment.
            </p>
          )}
        </div>

        <h2 className="mb-6 mt-8 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Changer le mot de passe
        </h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <PasswordForm />
        </div>
      </main>
    </div>
  );
}
