// Chantier C (documents de chauffeurs) : constantes et validation pures,
// sans dépendance Next/Supabase — importables aussi bien par les Server
// Actions que par un test exécuté hors Next.

export const DRIVER_DOCUMENTS_BUCKET = "driver-documents";

// Doit rester aligné avec file_size_limit / allowed_mime_types du bucket
// (supabase/migrations/20260925090000_add_driver_documents.sql) : ces
// contrôles côté serveur sont la première ligne, ceux du bucket la
// deuxième, indépendante.
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const DOCUMENT_MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const DOCUMENT_TYPES = ["permis", "carte_identite", "certificat", "autre"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  permis: "Permis de conduire",
  carte_identite: "Carte d'identité",
  certificat: "Certificat",
  autre: "Autre",
};

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

// Détecte le type RÉEL d'après les premiers octets. Le type MIME envoyé
// par le navigateur est déclaratif : ces fichiers sont des données
// personnelles servies ensuite par URL signée, on ne s'y fie pas seul.
export function detectDocumentMime(head: Uint8Array): string | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp"; // "RIFF" .... "WEBP"
  }
  return null;
}

export type DocumentFileCheck = { ok: true; mime: string; ext: string } | { ok: false; error: string };

export function validateDocumentFile(file: { size: number; type: string }, head: Uint8Array): DocumentFileCheck {
  if (file.size <= 0) {
    return { ok: false, error: "Merci de choisir un fichier." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "Le fichier ne doit pas dépasser 5 Mo." };
  }
  const ext = DOCUMENT_MIME_TO_EXT[file.type];
  if (!ext) {
    return { ok: false, error: "Format non supporté (PDF, PNG, JPG ou WEBP uniquement)." };
  }
  const detected = detectDocumentMime(head);
  if (detected !== file.type) {
    return { ok: false, error: "Le contenu du fichier ne correspond pas à son type déclaré." };
  }
  return { ok: true, mime: file.type, ext };
}

// Chemin : <company_id>/<driver_id>/<uuid>.<ext> — nom généré côté
// serveur, jamais le nom fourni par l'utilisateur (conservé en base dans
// file_name). Doit respecter la profondeur (2 dossiers) imposée par la
// policy d'insertion du bucket et le CHECK de driver_documents.file_path.
export function buildDocumentPath(companyId: string, driverId: string, ext: string): string {
  return `${companyId}/${driverId}/${crypto.randomUUID()}.${ext}`;
}
