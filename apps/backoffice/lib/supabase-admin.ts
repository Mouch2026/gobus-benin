import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role client — bypasses RLS. `import "server-only"` fails the
// build if this is ever imported from a Client Component, so
// SERVICE_ROLE_KEY (never NEXT_PUBLIC_-prefixed) cannot leak into the
// browser bundle. Only import this from Server Actions/Server Components,
// never from a "use client" file. Mirror of apps/web/lib/supabase-admin.ts.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
