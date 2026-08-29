export function NoCompanyMessage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Aucune compagnie associée à ce compte
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Contactez GoBus pour rattacher votre compte à une compagnie.
        </p>
      </div>
    </div>
  );
}
