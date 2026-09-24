import { NextRequest, NextResponse } from "next/server";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBeninDateString } from "@/lib/benin-time";
import { formatDepartureDateTime } from "../../_shared";
import { parseBoardingValidationFilters, filterBoardingValidations, type BoardingValidationRow } from "../filterBoardingValidations";

type ExportRow = {
  booking_reference: string;
  origin_city: string;
  destination_city: string;
  departure_at: string;
  bus_number: string;
  full_name: string;
  seat_number: string | null;
  validated_at: string;
  method: "scan" | "manuel";
  validated_by_name: string;
};

const METHOD_LABELS: Record<"scan" | "manuel", string> = {
  scan: "Scan",
  manuel: "Manuel",
};

// Échappement CSV minimal — même patron que l'export réservations, pas de
// nouvelle dépendance npm pour un format aussi simple (RFC 4180).
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Respecte exactement les filtres actifs du tableau /embarquement — même
// fonction parse/filter que la page, jamais une deuxième implémentation
// qui pourrait diverger.
export async function GET(request: NextRequest) {
  const result = await requireCompany();
  if (!result.ok) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  if (requirePermission(result, "boarding.validate")) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseBoardingValidationFilters(Object.fromEntries(searchParams));

  const { data: overview, error: overviewError } = await supabaseAdmin.rpc(
    "get_company_boarding_validations_overview",
    { p_company_id: result.company.id }
  );
  if (overviewError) {
    console.error("Impossible de charger les validations pour l'export :", overviewError.message);
    return NextResponse.json({ error: "Impossible de générer l'export." }, { status: 500 });
  }

  const matching = filterBoardingValidations((overview ?? []) as BoardingValidationRow[], filters);
  const validationIds = matching.map((row) => row.validation_id);

  if (validationIds.length === 0) {
    return NextResponse.json({ error: "Aucune validation ne correspond à ces filtres." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.rpc("get_company_boarding_validations_export_rows", {
    p_company_id: result.company.id,
    p_validation_ids: validationIds,
  });

  if (error) {
    console.error("Impossible de générer l'export :", error.message);
    return NextResponse.json({ error: "Impossible de générer l'export." }, { status: 500 });
  }

  const header = ["Référence", "Trajet", "Départ", "Bus", "Passager", "Siège", "Validé le", "Méthode", "Validé par"];

  const rows = ((data ?? []) as ExportRow[]).map((row) => [
    row.booking_reference,
    `${row.origin_city} → ${row.destination_city}`,
    formatDepartureDateTime(row.departure_at),
    row.bus_number,
    row.full_name,
    row.seat_number ?? "",
    formatDepartureDateTime(row.validated_at),
    METHOD_LABELS[row.method],
    row.validated_by_name,
  ]);

  const csvBody = [header, ...rows].map((cols) => cols.map(csvEscape).join(",")).join("\r\n");
  // BOM UTF-8 : Excel affiche mal les accents d'un CSV UTF-8 sans BOM.
  const csvWithBom = "﻿" + csvBody;

  const filename = `embarquement-export-${getBeninDateString()}.csv`;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
