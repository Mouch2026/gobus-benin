import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../_components";
import { AgenceForm, type StationOption } from "./AgenceForm";

type Agency = {
  id: string;
  name: string;
  is_active: boolean;
  stations: { name: string; city: string } | null;
};

// Gares : référence PARTAGÉE entre toutes les compagnies, curée par GoBus
// (jamais créée depuis le back-office). Lisible publiquement — le client
// de session suffit.
async function getActiveStations(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<StationOption[]> {
  const { data, error } = await supabase
    .from("stations")
    .select("id, name, city")
    .eq("is_active", true)
    .order("city", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les gares :", error.message);
    return [];
  }
  return (data ?? []) as StationOption[];
}

async function getCompanyAgencies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<Agency[]> {
  const { data, error } = await supabase
    .from("agencies")
    .select("id, name, is_active, stations(name, city)")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les agences :", error.message);
    return [];
  }
  return (data ?? []) as unknown as Agency[];
}

export default async function AgencesPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const supabase = await createClient();
  const [stations, agencies] = await Promise.all([
    getActiveStations(supabase),
    getCompanyAgencies(supabase, result.company.id),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
      <section>
        <h1 className="mb-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Nouvelle agence</h1>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Un guichet de votre compagnie, rattaché à une gare. La liste des gares est gérée par
          GoBus — contactez-nous si la vôtre n&apos;y figure pas encore.
        </p>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {stations.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Aucune gare disponible pour le moment. Contactez GoBus pour en faire ajouter une.
            </p>
          ) : (
            <AgenceForm stations={stations} />
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Vos agences</h2>

        {agencies.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucune agence pour le moment — créez-en une ci-dessus.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {agencies.map((agency) => (
              <Link
                key={agency.id}
                href={`/agences/${agency.id}`}
                className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">{agency.name}</span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      agency.is_active
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {agency.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {agency.stations
                    ? agency.stations.name === agency.stations.city
                      ? agency.stations.name
                      : `${agency.stations.name} · ${agency.stations.city}`
                    : "Gare inconnue"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
