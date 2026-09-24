import { NextRequest, NextResponse } from "next/server";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { DRIVER_DOCUMENTS_BUCKET } from "@/lib/driverDocuments";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Le bucket driver-documents est PRIVÉ : aucune URL publique n'existe. La
// seule façon de lire un fichier est cette route, qui vérifie la session et
// la permission, relit la ligne sous RLS (filtrée sur la compagnie), puis
// redirige vers une URL signée valable 60 secondes — jamais écrite dans le
// HTML d'une page, jamais réutilisable longtemps.
export async function GET(_request: NextRequest, ctx: RouteContext<"/chauffeurs/[id]/documents/[docId]/telecharger">) {
  const { id, docId } = await ctx.params;

  const access = await requireCompany();
  if (requirePermission(access, "driverDocuments.manage") || !access.ok) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  if (!UUID_RE.test(id) || !UUID_RE.test(docId)) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("driver_documents")
    .select("file_path")
    .eq("id", docId)
    .eq("driver_id", id)
    .eq("company_id", access.company.id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from(DRIVER_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.file_path, 60);
  if (error || !signed) {
    console.error("Impossible de signer l'URL du document :", error?.message);
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const response = NextResponse.redirect(signed.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
