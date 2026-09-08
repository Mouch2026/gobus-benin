import { NextResponse } from "next/server";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBeninDateString, getBeninMidnightToday } from "@/lib/benin-time";
import { BOOKING_STATUS_LABELS, formatDepartureDateTime } from "../../_shared";

type ExportRow = {
  booking_reference: string;
  origin_city: string;
  destination_city: string;
  departure_at: string;
  bus_number: string;
  full_name: string;
  phone: string | null;
  seat_number: string | null;
  booking_status: string;
  total_price_fcfa: number;
  booking_created_at: string;
};

// Échappement CSV minimal — pas de nouvelle dépendance npm pour un format
// aussi simple : entoure de guillemets uniquement si la valeur contient
// une virgule, un guillemet ou un retour à la ligne, et double les
// guillemets internes (RFC 4180).
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// GET plutôt qu'une Server Action : un lien <a href> natif suffit à
// déclencher le téléchargement, aucun JS client nécessaire.
export async function GET() {
  const result = await requireCompany();
  if (!result.ok) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  // "Aujourd'hui" = minuit au Bénin (Africa/Porto-Novo, UTC+1 fixe) →
  // maintenant — même convention que le sélecteur de période du
  // Dashboard (getBeninMidnightToday, voir lib/benin-time.ts). Jamais
  // minuit UTC ni l'heure locale du serveur.
  const to = new Date();
  const from = getBeninMidnightToday();

  const { data, error } = await supabaseAdmin.rpc("get_company_bookings_for_export", {
    p_company_id: result.company.id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) {
    console.error("Impossible de générer l'export du jour :", error.message);
    return NextResponse.json({ error: "Impossible de générer l'export." }, { status: 500 });
  }

  const header = [
    "Référence",
    "Trajet",
    "Départ",
    "Bus",
    "Passager",
    "Téléphone",
    "Siège",
    "Statut",
    "Montant (FCFA)",
  ];

  const rows = ((data ?? []) as ExportRow[]).map((row) => [
    row.booking_reference,
    `${row.origin_city} → ${row.destination_city}`,
    formatDepartureDateTime(row.departure_at),
    row.bus_number,
    row.full_name,
    row.phone ?? "",
    row.seat_number ?? "",
    BOOKING_STATUS_LABELS[row.booking_status] ?? row.booking_status,
    String(row.total_price_fcfa),
  ]);

  const csvBody = [header, ...rows].map((cols) => cols.map(csvEscape).join(",")).join("\r\n");
  // BOM UTF-8 (﻿) : Excel (courant dans ce contexte) affiche mal les
  // accents d'un CSV UTF-8 sans BOM.
  const csvWithBom = "﻿" + csvBody;

  // getBeninDateString(), pas to.toISOString() ni from.toISOString() :
  // near minuit UTC, la date UTC de "maintenant" (et même celle de
  // l'instant `from`, qui vaut 23h UTC la veille) peut différer d'un jour
  // de la vraie date calendaire béninoise.
  const filename = `reservations-du-jour-${getBeninDateString()}.csv`;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
