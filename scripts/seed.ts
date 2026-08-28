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
const TEST_USER_PASSWORD = "test-password-123";

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
    if (existing) return existing.id;

    if (!listed.nextPage) {
      throw new Error(
        `${TEST_USER_EMAIL} introuvable via listUsers alors que createUser le dit déjà enregistré.`
      );
    }
    page = listed.nextPage;
  }
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

function tomorrowAt8am(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date.toISOString();
}

async function ensureTestTrip(companyId: string, routeId: string): Promise<string> {
  const departureAt = tomorrowAt8am();

  // No natural unique constraint on trips, so existence is checked manually
  // (route_id + departure_at) instead of relying on upsert(onConflict:).
  const { data: existing, error: selectError } = await supabase
    .from("trips")
    .select("id")
    .eq("route_id", routeId)
    .eq("departure_at", departureAt)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error: updateError } = await supabase
      .from("trips")
      .update({ company_id: companyId, ...TEST_TRIP })
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
  console.log(JSON.stringify({ userId, companyId, routeId, tripId }, null, 2));
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
