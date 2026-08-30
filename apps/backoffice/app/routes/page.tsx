import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../_components";
import { Navigation } from "../_navigation";
import { RouteForm } from "./RouteForm";

type CompanyRoute = {
  id: string;
  origin_city: string;
  destination_city: string;
  distance_km: number;
  duration_minutes: number | null;
};

async function getCompanyRoutes(companyId: string): Promise<CompanyRoute[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .select("id, origin_city, destination_city, distance_km, duration_minutes")
    .eq("company_id", companyId)
    .order("origin_city", { ascending: true });

  if (error) {
    console.error("Impossible de charger les routes :", error.message);
    return [];
  }

  return data ?? [];
}

export default async function RoutesPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const routes = await getCompanyRoutes(result.company.id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
        <section>
          <h1 className="sr-only">Routes — {result.company.name}</h1>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Nouvelle route
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <RouteForm />
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Vos routes
          </h2>

          {routes.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucune route pour le moment — créez-en une ci-dessus.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Distance</th>
                    <th className="px-4 py-3 font-medium">Durée estimée</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route) => (
                    <tr
                      key={route.id}
                      className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                        {route.origin_city} → {route.destination_city}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {route.distance_km} km
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {route.duration_minutes ? `${route.duration_minutes} min` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
