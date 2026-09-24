"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "shared/src/lib/auditLog";
import {
  DRIVER_DOCUMENTS_BUCKET,
  buildDocumentPath,
  isDocumentType,
  validateDocumentFile,
} from "@/lib/driverDocuments";

export type DocumentFormState = { error: string | null; success: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FILE_NAME_LENGTH = 200;

function isValidCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Écritures faites avec le client de SESSION (pas supabaseAdmin), comme
// l'upload du logo : la RLS de storage.objects et de driver_documents est
// ainsi réellement exercée en plus de requirePermission, qui reste la
// première garde.
export async function uploadDriverDocument(
  _prevState: DocumentFormState,
  formData: FormData
): Promise<DocumentFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "driverDocuments.manage");
  if (guardError) return { ...guardError, success: false };
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const driverId = String(formData.get("driverId") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const expirationRaw = String(formData.get("expirationDate") ?? "").trim();
  const file = formData.get("file");

  if (!isDocumentType(type)) {
    return { error: "Type de document invalide.", success: false };
  }
  // Optionnelle : un certificat peut ne pas avoir d'expiration suivie.
  if (expirationRaw && !isValidCalendarDate(expirationRaw)) {
    return { error: "Date d'expiration invalide.", success: false };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Merci de choisir un fichier.", success: false };
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = validateDocumentFile(file, head);
  if (!check.ok) {
    return { error: check.error, success: false };
  }

  const supabase = await createClient();

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", driverId)
    .eq("company_id", access.company.id)
    .maybeSingle();
  if (!driver) {
    return { error: "Ce chauffeur n'existe pas ou ne vous appartient pas.", success: false };
  }

  const filePath = buildDocumentPath(access.company.id, driverId, check.ext);

  const { error: uploadError } = await supabase.storage
    .from(DRIVER_DOCUMENTS_BUCKET)
    .upload(filePath, file, { contentType: check.mime });
  if (uploadError) {
    console.error("Impossible de téléverser le document :", uploadError.message);
    return { error: "Impossible de téléverser ce document. Réessayez.", success: false };
  }

  const { data: row, error: insertError } = await supabase
    .from("driver_documents")
    .insert({
      driver_id: driverId,
      company_id: access.company.id,
      type,
      file_path: filePath,
      file_name: file.name.slice(0, MAX_FILE_NAME_LENGTH),
      expiration_date: expirationRaw || null,
      uploaded_by: access.user.sub,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    console.error("Impossible d'enregistrer le document :", insertError?.message);
    // Compensation : jamais de fichier orphelin sans ligne qui le référence.
    await supabase.storage.from(DRIVER_DOCUMENTS_BUCKET).remove([filePath]);
    return { error: "Impossible d'enregistrer ce document. Réessayez.", success: false };
  }

  await logAuditEvent({
    action: "driver_document_added",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { driverId, documentId: row.id, type, expirationDate: expirationRaw || null },
  });

  revalidatePath(`/chauffeurs/${driverId}`);
  return { error: null, success: true };
}

export async function deleteDriverDocument(
  _prevState: DocumentFormState,
  formData: FormData
): Promise<DocumentFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "driverDocuments.manage");
  if (guardError) return { ...guardError, success: false };
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const documentId = String(formData.get("documentId") ?? "").trim();
  const driverId = String(formData.get("driverId") ?? "").trim();

  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("driver_documents")
    .select("id, file_path, type")
    .eq("id", documentId)
    .eq("driver_id", driverId)
    .eq("company_id", access.company.id)
    .maybeSingle();
  if (!doc) {
    return { error: "Ce document n'existe pas ou ne vous appartient pas.", success: false };
  }

  // Le fichier d'abord : en cas d'échec on s'arrête, la ligne reste et
  // référence toujours un fichier existant. L'inverse laisserait un fichier
  // privé orphelin, sans plus aucune ligne pour le retrouver.
  const { error: removeError } = await supabase.storage.from(DRIVER_DOCUMENTS_BUCKET).remove([doc.file_path]);
  if (removeError) {
    console.error("Impossible de supprimer le fichier :", removeError.message);
    return { error: "Impossible de supprimer ce document. Réessayez.", success: false };
  }

  const { error: deleteError } = await supabase
    .from("driver_documents")
    .delete()
    .eq("id", documentId)
    .eq("company_id", access.company.id);
  if (deleteError) {
    console.error("Impossible de supprimer la ligne du document :", deleteError.message);
    return { error: "Impossible de supprimer ce document. Réessayez.", success: false };
  }

  await logAuditEvent({
    action: "driver_document_deleted",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { driverId, documentId, type: doc.type },
  });

  revalidatePath(`/chauffeurs/${driverId}`);
  return { error: null, success: true };
}
