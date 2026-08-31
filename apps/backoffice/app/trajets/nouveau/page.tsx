import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../../_components";
import { Navigation } from "../../_navigation";
import { NewTripForm } from "./NewTripForm";

// Suggestions seulement (datalist) : les villes déjà utilisées par cette
// compagnie, aller ET retour confondus, dédupliquées — ne contraint jamais
// la saisie, l'utilisateur reste libre de taper autre chose.
async function getCompanyCities(companyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .select("origin_city, destination_city")
    .eq("company_id", companyId);

  if (error) {
    console.error("Impossible de charger les villes :", error.message);
    return [];
  }

  const cities = new Set<string>();
  for (const route of data ?? []) {
    cities.add(route.origin_city);
    cities.add(route.destination_city);
  }
  return [...cities].sort((a, b) => a.localeCompare(b));
}

async function getCompanyBusLayouts(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bus_layouts")
    .select("id, name, seat_labels")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les plans de bus :", error.message);
    return [];
  }

  return (data ?? []) as { id: string; name: string; seat_labels: string[] }[];
}

export default async function NewTripPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const [cities, busLayouts] = await Promise.all([
    getCompanyCities(result.company.id),
    getCompanyBusLayouts(result.company.id),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto max-w-xl px-6 py-8">
        <h1 className="mb-6 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Nouveau trajet
        </h1>
        {busLayouts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Aucun plan de bus n&apos;existe encore pour votre compagnie. Un plan de bus est
              obligatoire pour déclarer un trajet.
            </p>
            <Link
              href="/plans-de-bus"
              className="rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Créer un plan de bus
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <NewTripForm cities={cities} busLayouts={busLayouts} />
          </div>
        )}
      </main>
    </div>
  );
}
