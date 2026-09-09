import { NextRequest, NextResponse } from "next/server";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBeninDateString } from "@/lib/benin-time";
import { BOOKING_STATUS_LABELS, formatDepartureDateTime } from "../../_shared";
import { parseReservationFilters, filterBookings, type BookingOverviewRow } from "../filterBookings";

type ExportRow = {
  booking_reference: string;
  origin_city: string;
  destination_city: string;
  departure_at: string;
  bus_number: string;
  // LEFT JOIN côté SQL (get_company_bookings_export_rows) : une
  // réservation sans aucun passager doit quand même apparaître dans
  // l'export (comme dans le tableau), avec ces champs vides plutôt que
  // de disparaître silencieusement.
  full_name: string | null;
  phone: string | null;
  seat_number: string | null;
  booking_status: string;
  total_price_fcfa: number;
  booking_created_at: string;
};

// Échappement CSV minimal — pas de nouvelle dépendance npm pour un format
// aussi simple (RFC 4180). Réutilisé tel quel depuis l'export "aujourd'hui"
// du Dashboard.
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Respecte exactement les filtres actifs du tableau /reservations : même
// fonction parseReservationFilters/filterBookings que la page, jamais une
// deuxième implémentation qui pourrait diverger — ce que l'utilisateur
// voit à l'écran est ce qu'il obtient dans le CSV.
export async function GET(request: NextRequest) {
  const result = await requireCompany();
  if (!result.ok) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseReservationFilters(Object.fromEntries(searchParams));

  const { data: overview, error: overviewError } = await supabaseAdmin.rpc(
    "get_company_bookings_overview",
    { p_company_id: result.company.id }
  );
  if (overviewError) {
    console.error("Impossible de charger les réservations pour l'export :", overviewError.message);
    return NextResponse.json({ error: "Impossible de générer l'export." }, { status: 500 });
  }

  const matching = filterBookings((overview ?? []) as BookingOverviewRow[], filters);
  const bookingIds = matching.map((row) => row.booking_id);

  if (bookingIds.length === 0) {
    return NextResponse.json({ error: "Aucune réservation ne correspond à ces filtres." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.rpc("get_company_bookings_export_rows", {
    p_company_id: result.company.id,
    p_booking_ids: bookingIds,
  });

  if (error) {
    console.error("Impossible de générer l'export :", error.message);
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
    row.full_name ?? "",
    row.phone ?? "",
    row.seat_number ?? "",
    BOOKING_STATUS_LABELS[row.booking_status] ?? row.booking_status,
    String(row.total_price_fcfa),
  ]);

  const csvBody = [header, ...rows].map((cols) => cols.map(csvEscape).join(",")).join("\r\n");
  // BOM UTF-8 : Excel (courant dans ce contexte) affiche mal les accents
  // d'un CSV UTF-8 sans BOM.
  const csvWithBom = "﻿" + csvBody;

  const filename = `reservations-export-${getBeninDateString()}.csv`;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
