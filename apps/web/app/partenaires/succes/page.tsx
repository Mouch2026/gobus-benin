import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BACKOFFICE_URL = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "http://localhost:3001";

type SubscriptionCompany = {
  companies: { name: string; owner_id: string } | null;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function getSuccessInfo(
  subscriptionId: string
): Promise<{ companyName: string; email: string | null } | null> {
  const { data: subscription, error } = await supabaseAdmin
    .from("company_subscriptions")
    .select("companies(name, owner_id)")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionCompany>();

  if (error || !subscription?.companies) {
    console.error("Impossible de charger la compagnie :", error?.message);
    return null;
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
    subscription.companies.owner_id
  );

  return {
    companyName: subscription.companies.name,
    email: userData.user?.email ?? null,
  };
}

export default async function SuccesPage(props: PageProps<"/partenaires/succes">) {
  const searchParams = await props.searchParams;
  const subscriptionId = firstValue(searchParams.subscription);

  const info = subscriptionId ? await getSuccessInfo(subscriptionId) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Votre compte est prêt
        </h1>

        {info ? (
          <p className="mt-3 text-muted">
            Compagnie <span className="font-semibold text-foreground">{info.companyName}</span>
            {info.email ? (
              <>
                {" "}
                — connectez-vous avec{" "}
                <span className="font-semibold text-foreground">{info.email}</span> et le mot de
                passe que vous venez de choisir.
              </>
            ) : null}
          </p>
        ) : (
          <p className="mt-3 text-muted">
            Utilisez l&apos;email et le mot de passe que vous venez de choisir pour vous connecter.
          </p>
        )}

        <a
          href={`${BACKOFFICE_URL}/connexion`}
          className="mt-6 block rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Se connecter au back-office
        </a>

        <Link
          href="/"
          className="mt-4 block text-sm font-medium text-muted hover:text-foreground"
        >
          Retour à l&apos;accueil GoBus
        </Link>
      </div>
    </div>
  );
}
