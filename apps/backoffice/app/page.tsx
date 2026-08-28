import { requireCompany } from "@/lib/supabase/dal";
import { NoCompanyMessage } from "./_components";
import { logout } from "./actions";

export default async function BackofficeHome() {
  const { user, company } = await requireCompany();

  if (!company) {
    return <NoCompanyMessage />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">{company.name}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Connecté en tant que {String(user.email ?? user.sub)}
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg border border-zinc-200 px-4 py-2.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
