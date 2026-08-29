// Seed de données de test, idempotent (rejouable sans dupliquer).
// Usage : npm run seed

import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(import.meta.dirname, "../.env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL et SERVICE_ROLE_KEY doivent être définis dans .env"
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USER_EMAIL = "test@test.com";
const TEST_USER_PASSWORD = "TestPassword123!";

const TEST_COMPANY = {
  name: "ATT Test",
  slug: "att-test",
};

const TEST_ROUTE = {
  origin_city: "Cotonou",
  destination_city: "Parakou",
  distance_km: 411,
};

const TEST_TRIP = {
  seat_class: "standard",
  price_fcfa: 7500,
  total_seats: 40,
  available_seats: 40,
};

const TEST_SUBSCRIPTION_PLANS = [
  {
    name: "Essentiel",
    price_fcfa: 15000,
    billing_period: "monthly",
    features: ["Jusqu'à 5 trajets actifs", "Support par WhatsApp"],
  },
  {
    name: "Pro",
    price_fcfa: 35000,
    billing_period: "monthly",
    features: ["Trajets illimités", "Support prioritaire", "Statistiques de vente"],
  },
] as const;

async function ensureTestUser(): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });

  if (!error) {
    return data.user.id;
  }

  if (error.code !== "email_exists") {
    throw error;
  }

  // admin.createUser has no upsert mode: an existing user must be found by
  // paging through admin.listUsers() (the admin API has no filter-by-email).
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listError) throw listError;

    const existing = listed.users.find((user) => user.email === TEST_USER_EMAIL);
    if (existing) {
      // Force the password back to the known fixed value even on a rerun —
      // otherwise a user created before TEST_USER_PASSWORD existed (or
      // manually changed since) would keep an unknown password forever,
      // since createUser() only sets it on first creation.
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        password: TEST_USER_PASSWORD,
      });
      if (updateError) throw updateError;
      return existing.id;
    }

    if (!listed.nextPage) {
      throw new Error(
        `${TEST_USER_EMAIL} introuvable via listUsers alors que createUser le dit déjà enregistré.`
      );
    }
    page = listed.nextPage;
  }
}

async function ensureSubscriptionPlan(plan: (typeof TEST_SUBSCRIPTION_PLANS)[number]): Promise<string> {
  // Same reasoning as ensureTestCompany/ensureTestRoute: manual
  // check-then-write instead of upsert(onConflict:), to keep `id` stable
  // across reruns. No DB-level unique constraint on `name` — the script
  // doesn't need one to match by it, same as ensureTestTrip matching on
  // (route_id, seat_class) without a unique constraint backing that pair.
  const { data: existing, error: selectError } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("name", plan.name)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("subscription_plans")
      .update({
        price_fcfa: plan.price_fcfa,
        billing_period: plan.billing_period,
        features: plan.features,
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("subscription_plans")
    .insert({
      name: plan.name,
      price_fcfa: plan.price_fcfa,
      billing_period: plan.billing_period,
      features: plan.features,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

async function ensureTestCompany(ownerId: string): Promise<string> {
  // Checked and updated by hand rather than via .upsert({ onConflict: "slug" }):
  // that upsert path was observed to replace the existing row's `id` with a
  // freshly generated one on every conflict instead of preserving it, which
  // would silently break any other row (e.g. a booking) already referencing
  // that id. Matching by natural key and updating in place keeps `id` stable
  // across reruns.
  const { data: existing, error: selectError } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", TEST_COMPANY.slug)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("companies")
      .update({ ...TEST_COMPANY, owner_id: ownerId })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("companies")
    .insert({ ...TEST_COMPANY, owner_id: ownerId })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

async function ensureTestRoute(companyId: string): Promise<string> {
  // Same reasoning as ensureTestCompany: manual check-then-write instead of
  // upsert(onConflict:), to keep `id` stable across reruns.
  const { data: existing, error: selectError } = await supabase
    .from("routes")
    .select("id")
    .eq("company_id", companyId)
    .eq("origin_city", TEST_ROUTE.origin_city)
    .eq("destination_city", TEST_ROUTE.destination_city)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("routes")
      .update({ distance_km: TEST_ROUTE.distance_km })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("routes")
    .insert({ ...TEST_ROUTE, company_id: companyId })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

function tomorrowAt8amBenin(): string {
  // Anchored to Africa/Porto-Novo (UTC+1, no DST) via an explicit offset —
  // not Date.prototype.setHours(), which sets the *executing machine's*
  // local timezone. That mismatch previously made seeded departures drift
  // by an hour (or more) depending on where/when the script ran.
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const isoDate = tomorrow.toISOString().slice(0, 10);
  return `${isoDate}T08:00:00+01:00`;
}

async function ensureTestTrip(companyId: string, routeId: string): Promise<string> {
  const departureAt = tomorrowAt8amBenin();

  // Matched by (route_id, seat_class), not departure_at: departure_at is
  // "tomorrow" relative to whenever the script happens to run, so it's a
  // moving target by design — using it as part of the identity key would
  // insert a brand new trip every different calendar day instead of
  // rolling the existing test trip's date forward, which is what we
  // actually want from a reseed. No natural unique DB constraint covers
  // this, so existence is checked manually rather than via
  // upsert(onConflict:).
  const { data: existing, error: selectError } = await supabase
    .from("trips")
    .select("id")
    .eq("route_id", routeId)
    .eq("seat_class", TEST_TRIP.seat_class)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("trips")
      .update({ company_id: companyId, departure_at: departureAt, ...TEST_TRIP })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("trips")
    .insert({ company_id: companyId, route_id: routeId, departure_at: departureAt, ...TEST_TRIP })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

async function main() {
  console.log("Seed des données de test GoBus Bénin...\n");

  const essentielPlanId = await ensureSubscriptionPlan(TEST_SUBSCRIPTION_PLANS[0]);
  console.log(`✓ Plan "${TEST_SUBSCRIPTION_PLANS[0].name}"  (${essentielPlanId})`);

  const proPlanId = await ensureSubscriptionPlan(TEST_SUBSCRIPTION_PLANS[1]);
  console.log(`✓ Plan "${TEST_SUBSCRIPTION_PLANS[1].name}"  (${proPlanId})`);

  const userId = await ensureTestUser();
  console.log(`✓ Utilisateur test    ${TEST_USER_EMAIL}  (${userId})`);

  const companyId = await ensureTestCompany(userId);
  console.log(`✓ Compagnie "${TEST_COMPANY.name}"  (${companyId})`);

  const routeId = await ensureTestRoute(companyId);
  console.log(
    `✓ Route ${TEST_ROUTE.origin_city} → ${TEST_ROUTE.destination_city}  (${routeId})`
  );

  const tripId = await ensureTestTrip(companyId, routeId);
  console.log(`✓ Trip  (${tripId})`);

  console.log("\nIds :");
  console.log(
    JSON.stringify({ essentielPlanId, proPlanId, userId, companyId, routeId, tripId }, null, 2)
  );

  console.log("\nIdentifiants de connexion :");
  console.log(`  email    ${TEST_USER_EMAIL}`);
  console.log(`  password ${TEST_USER_PASSWORD}`);
}

main().catch((error) => {
  console.error("\n✗ Échec du seed :", error?.message ?? error);

  if (error?.code === "42501" || /permission denied/i.test(String(error?.message))) {
    console.error(
      "\n→ La clé service_role n'a pas les privilèges nécessaires sur cette table.\n" +
        "  Vérifie que supabase/migrations/20260828042905_grant_service_role_privileges.sql" +
        " a bien été appliquée."
    );
  }

  process.exitCode = 1;
});
