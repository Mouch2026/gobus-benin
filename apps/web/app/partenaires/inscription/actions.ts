"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type SignupState = { error: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6; // Supabase Auth's own default minimum

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (combining diacritical marks)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function generateUniqueCompanySlug(companyName: string): Promise<string> {
  const base = slugify(companyName) || "compagnie";
  let candidate = base;

  for (let attempt = 1; attempt <= 20; attempt++) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) return candidate;
    candidate = `${base}-${attempt + 1}`;
  }

  throw new Error("Impossible de générer un slug unique pour cette compagnie.");
}

function mapAuthError(error: { code?: string; message: string }): string {
  if (error.code === "email_exists") {
    return "Un compte existe déjà avec cet email.";
  }
  return "Impossible de créer le compte. Vérifiez vos informations et réessayez.";
}

type CreateCompanyAccountInput = {
  email: string;
  password: string;
  companyName: string;
  planId: string;
};

type CreateCompanyAccountResult =
  | { ok: true; subscriptionId: string }
  | { ok: false; error: string };

// No redirect() call anywhere in this function — see the comment in
// signupCompany() below for why that matters.
async function createCompanyAccount(
  input: CreateCompanyAccountInput
): Promise<CreateCompanyAccountResult> {
  // Step 1: Auth user. admin.createUser is an HTTP call to the Auth
  // service (schema `auth`), not part of any Postgres transaction we
  // control — this is exactly why failures below are handled with manual
  // compensations (delete what was created) rather than a DB transaction.
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (userError || !userData.user) {
    return { ok: false, error: mapAuthError(userError ?? { message: "unknown" }) };
  }

  const userId = userData.user.id;

  // Step 2: companies. On failure, compensate by removing the just-created
  // auth user — no account left half-created with no way out.
  const slug = await generateUniqueCompanySlug(input.companyName);
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .insert({ owner_id: userId, name: input.companyName, slug })
    .select("id")
    .single();

  if (companyError || !company) {
    await supabaseAdmin.auth.admin.deleteUser(userId);

    // 23505 = unique_violation (verified against the live DB: inserting a
    // second row with an already-used slug returns exactly this code).
    // generateUniqueCompanySlug() above already retries on a *known*
    // collision, so this only fires on the residual race between its
    // check and this insert (e.g. two signups for the same name landing
    // at the same time) — same class of race as booking_reference's
    // check-then-insert, same reasoning for why the UNIQUE constraint,
    // not the pre-check, is the real guarantee.
    if (companyError?.code === "23505") {
      return { ok: false, error: "Ce nom de compagnie est déjà utilisé, essayez-en un autre." };
    }

    return { ok: false, error: "Impossible de créer votre compagnie. Réessayez." };
  }

  // Step 3: company_subscriptions. On failure, compensate in reverse
  // creation order: company, then the auth user.
  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from("company_subscriptions")
    .insert({
      company_id: company.id,
      subscription_plan_id: input.planId,
      status: "pending_payment",
    })
    .select("id")
    .single();

  if (subscriptionError || !subscription) {
    await supabaseAdmin.from("companies").delete().eq("id", company.id);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { ok: false, error: "Impossible de créer votre abonnement. Réessayez." };
  }

  return { ok: true, subscriptionId: subscription.id };
}

export async function signupCompany(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const planId = String(formData.get("planId") ?? "");

  if (!companyName) {
    return { error: "Merci de renseigner le nom de votre compagnie." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Merci de renseigner un email valide." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }

  // Never trust the query-param-sourced planId blindly — re-check it
  // refers to a real, currently active plan.
  const { data: plan, error: planError } = await supabaseAdmin
    .from("subscription_plans")
    .select("id")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (planError || !plan) {
    return { error: "Ce plan n'existe pas ou n'est plus disponible. Choisissez-en un autre." };
  }

  const result = await createCompanyAccount({ email, password, companyName, planId: plan.id });

  if (!result.ok) {
    return { error: result.error };
  }

  // redirect() throws a special NEXT_REDIRECT signal internally — calling
  // it here, after createCompanyAccount() has already returned normally
  // (not inside its try/catch), means a successful redirect can never be
  // mistaken for a failure that needs compensating.
  redirect(`/partenaires/paiement?subscription=${result.subscriptionId}`);
}
