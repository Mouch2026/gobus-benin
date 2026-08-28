import { LoginForm } from "./LoginForm";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConnexionPage(props: PageProps<"/connexion">) {
  const searchParams = await props.searchParams;
  const redirectTo = firstValue(searchParams.next) ?? "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            GoBus Bénin — Back-office
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Connectez-vous avec le compte fourni par GoBus.
          </p>
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
