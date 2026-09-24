import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@6.25.0";
import { renderExpiryEmailHtml, type ExpiringDocument } from "./email.ts";

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : injectées par la plateforme.
// CRON_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL : déjà déclarées pour
// expire-vouchers (mêmes valeurs). BACKOFFICE_URL : propre à cette
// fonction (`supabase secrets set BACKOFFICE_URL=https://...`) — sert à
// construire le lien vers la fiche du chauffeur dans l'e-mail.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type SweptDocument = ExpiringDocument & { alert_company_id: string };
type CompanyMember = { email: string | null; role: string; is_active: boolean };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Fonction distincte de expire-vouchers (et non une extension) : cadence
// différente (quotidienne vs 15 min) et domaines de panne indépendants —
// une erreur ici ne doit jamais bloquer l'expiration des avoirs.
Deno.serve(async (req) => {
  // Seul rempart réel contre un appel externe : verify_jwt est désactivé
  // (supabase/config.toml), la clé anon étant un JWT valide qui l'aurait
  // satisfait. Vérifié avant TOUTE autre action : ni RPC, ni e-mail, si le
  // secret est absent ou incorrect.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Non autorisé" }, 401);
  }

  // Revendique atomiquement les documents qui franchissent le seuil ET crée
  // les notifications in-app dans la même transaction (voir la migration).
  // À partir de là un document est marqué : un échec d'e-mail ci-dessous
  // n'est pas rejoué (même compromis qu'expire-vouchers), mais la
  // notification in-app est déjà écrite.
  const { data: swept, error } = await supabaseAdmin.rpc("sweep_driver_document_expiry");
  if (error) {
    console.error("sweep_driver_document_expiry a échoué :", error.message);
    return json({ error: error.message }, 500);
  }

  const documents = (swept ?? []) as SweptDocument[];
  if (documents.length === 0) {
    return json({ processed: 0, companies: 0, sent: 0, failed: 0 });
  }

  const byCompany = new Map<string, SweptDocument[]>();
  for (const doc of documents) {
    const list = byCompany.get(doc.alert_company_id) ?? [];
    list.push(doc);
    byCompany.set(doc.alert_company_id, list);
  }

  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .in("id", [...byCompany.keys()]);
  const companyNames = new Map<string, string>((companies ?? []).map((c) => [c.id as string, c.name as string]));

  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const from = Deno.env.get("RESEND_FROM_EMAIL")!;
  const backofficeUrl = Deno.env.get("BACKOFFICE_URL")?.replace(/\/+$/, "") ?? null;
  if (!backofficeUrl) {
    console.error("BACKOFFICE_URL absente : les e-mails partent sans lien vers la fiche chauffeur.");
  }

  let sent = 0;
  let failed = 0;

  for (const [companyId, docs] of byCompany) {
    // Destinataires : propriétaire + chefs d'agence actifs uniquement.
    const { data: members, error: membersError } = await supabaseAdmin.rpc("get_company_members", {
      p_company_id: companyId,
    });
    if (membersError) {
      console.error(`Membres introuvables pour la compagnie ${companyId} :`, membersError.message);
      failed++;
      continue;
    }

    const recipients = ((members ?? []) as CompanyMember[])
      .filter((m) => m.is_active && (m.role === "owner" || m.role === "agency_manager") && m.email)
      .map((m) => m.email as string);

    const html = renderExpiryEmailHtml(companyNames.get(companyId) ?? "votre compagnie", docs, backofficeUrl);

    // Un seul e-mail récapitulatif par destinataire et par exécution, pas
    // un e-mail par document.
    for (const email of recipients) {
      const { error: sendError } = await resend.emails.send({
        from,
        to: email,
        subject: `${docs.length} document(s) de chauffeur à renouveler`,
        html,
      });
      if (sendError) {
        console.error(`Envoi Resend échoué (compagnie ${companyId}) :`, sendError.message);
        failed++;
      } else {
        sent++;
      }
    }
  }

  return json({ processed: documents.length, companies: byCompany.size, sent, failed });
});
