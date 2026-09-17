import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../_components";
import { formatDepartureDateTime } from "../_shared";
import { PromoCodeForm } from "./PromoCodeForm";
import { PromoCodeToggleButton } from "./PromoCodeToggleButton";

type PromoCode = {
  id: string;
  code: string;
  discount_type: "fixed" | "percent";
  discount_fixed_fcfa: number | null;
  discount_percent: number | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  uses_count: number;
  min_purchase_fcfa: number | null;
  is_active: boolean;
};

function discountLabel(promoCode: PromoCode): string {
  return promoCode.discount_type === "fixed"
    ? `− ${formatFcfa(promoCode.discount_fixed_fcfa ?? 0)}`
    : `− ${promoCode.discount_percent ?? 0} %`;
}

async function getCompanyPromoCodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from("promo_codes")
    .select(
      "id, code, discount_type, discount_fixed_fcfa, discount_percent, starts_at, ends_at, max_uses, uses_count, min_purchase_fcfa, is_active"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Impossible de charger les codes promo :", error.message);
    return [];
  }
  return (data ?? []) as PromoCode[];
}

export default async function CodesPromoPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const canManage = can(result.role, "promoCodes.manage");
  const supabase = await createClient();
  const promoCodes = await getCompanyPromoCodes(supabase, result.company.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
      {canManage ? (
        <section>
          <h1 className="mb-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Nouveau code promo
          </h1>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Réduit uniquement le prix du billet (jamais les frais de service), sur vos trajets
            uniquement. Les règles d&apos;un code ne sont plus modifiables après sa création — seule
            la désactivation reste possible.
          </p>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <PromoCodeForm />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Vos codes promo
        </h2>

        {promoCodes.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucun code promo pour le moment{canManage ? " — créez-en un ci-dessus." : "."}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {promoCodes.map((promoCode) => (
              <div
                key={promoCode.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                    {promoCode.code}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      promoCode.is_active
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {promoCode.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{discountLabel(promoCode)}</span>
                  <span>
                    {promoCode.uses_count} utilisation{promoCode.uses_count > 1 ? "s" : ""}
                    {promoCode.max_uses ? ` / ${promoCode.max_uses}` : ""}
                  </span>
                  {promoCode.min_purchase_fcfa ? (
                    <span>Achat min. {formatFcfa(promoCode.min_purchase_fcfa)}</span>
                  ) : null}
                  {promoCode.starts_at ? (
                    <span>Début {formatDepartureDateTime(promoCode.starts_at)}</span>
                  ) : null}
                  {promoCode.ends_at ? (
                    <span>Fin {formatDepartureDateTime(promoCode.ends_at)}</span>
                  ) : null}
                </div>

                {canManage ? (
                  <PromoCodeToggleButton promoCodeId={promoCode.id} isActive={promoCode.is_active} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
