import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../../_components";
import { NewTripForm } from "./NewTripForm";

async function getCompanyRoutes(companyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .select("id, origin_city, destination_city")
    .eq("company_id", companyId)
    .order("origin_city", { ascending: true });

  if (error) {
    console.error("Impossible de charger les routes :", error.message);
    return [];
  }

  return data ?? [];
}

export default async function NewTripPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const routes = await getCompanyRoutes(result.company.id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Nouveau trajet</h1>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Trajets
        </Link>
      </header>

      <main className="mx-auto max-w-xl px-6 py-8">
        {routes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Aucune route n&apos;existe encore pour votre compagnie. Créez-en une avant de
              déclarer un trajet.
            </p>
            <Link
              href="/routes"
              className="rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Créer une route
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <NewTripForm routes={routes} />
          </div>
        )}
      </main>
    </div>
  );
}
