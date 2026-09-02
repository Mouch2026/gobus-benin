import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role client — bypasses RLS. Ce module (packages/shared/lib/
// notifications) s'exécute aussi bien dans le process apps/web que dans
// apps/backoffice (cancelTrip) : les deux doivent donc porter les mêmes
// variables NEXT_PUBLIC_SUPABASE_URL/SERVICE_ROLE_KEY dans leur propre
// .env.local. `import "server-only"` fait échouer le build si ce module
// est jamais importé depuis un Client Component, dans l'une ou l'autre
// app.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
