"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import {
  confirmBoarding,
  resolveByReference,
  searchByNameOrPhone,
  type BoardingCandidate,
} from "./actions";

type Feedback =
  | { kind: "error"; text: string }
  | { kind: "info"; text: string }
  | { kind: "success"; text: string };

// Scanner caméra + repli manuel toujours visibles en même temps (jamais
// l'un caché derrière l'autre) — scan et saisie manuelle convergent vers
// la même recherche : jsQR ne fait que remplir le champ "Numéro de billet
// ou QR code" à la place du clavier, un QR encode toujours un
// booking_reference en texte brut (GB-XXXXXX), jamais du JSON ni une URL.
export function BoardingValidationPanel({ tripId }: { tripId: string | null }) {
  const [reference, setReference] = useState("");
  const [nameOrPhone, setNameOrPhone] = useState("");
  const [candidates, setCandidates] = useState<BoardingCandidate[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState(false);
  // La provenance de la dernière recherche pilote le "method" envoyé à
  // confirmBoarding — jamais deviné depuis le contenu du champ texte (un
  // agent peut très bien taper la référence à la main).
  const [lookupMethod, setLookupMethod] = useState<"scan" | "manuel">("manuel");

  const handleReferenceLookup = useCallback(
    async (value: string, method: "scan" | "manuel") => {
      if (!tripId || pending) return;
      setPending(true);
      setFeedback(null);
      setLookupMethod(method);
      const result = await resolveByReference(value);
      setPending(false);
      if (result.error) {
        setFeedback({ kind: "error", text: result.error });
        setCandidates([]);
        return;
      }
      setCandidates(result.candidates);
    },
    [tripId, pending]
  );

  async function handleManualSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!tripId) return;
    setPending(true);
    setFeedback(null);
    setLookupMethod("manuel");
    const result = await searchByNameOrPhone(nameOrPhone);
    setPending(false);
    if (result.error) {
      setFeedback({ kind: "error", text: result.error });
      setCandidates([]);
      return;
    }
    if (result.candidates.length === 0) {
      setFeedback({ kind: "info", text: "Aucun passager ne correspond à cette recherche." });
    }
    setCandidates(result.candidates);
  }

  async function handleValidate(candidate: BoardingCandidate) {
    if (!tripId || pending) return;
    setPending(true);
    setFeedback(null);
    const result = await confirmBoarding(candidate.passengerId, tripId, candidate.bookingId, lookupMethod);
    setPending(false);

    if (result.status === "validated") {
      setFeedback({
        kind: "success",
        text: `${candidate.fullName} (siège ${candidate.seatNumber ?? "—"}) a embarqué.`,
      });
      setCandidates((prev) => prev.filter((c) => c.passengerId !== candidate.passengerId));
      return;
    }

    if (result.status === "already_validated") {
      const when = new Date(result.previousValidatedAt).toLocaleString("fr-BJ", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Porto-Novo",
      });
      setFeedback({
        kind: "error",
        text: `Billet déjà validé le ${when} par ${result.previousValidatedByName}. Une alerte a été envoyée.`,
      });
      return;
    }

    setFeedback({ kind: "error", text: result.message });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {!tripId ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Sélectionnez d&apos;abord un trajet ci-dessus pour pouvoir valider un billet.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <QrScanner disabled={!tripId} onDetected={(value) => handleReferenceLookup(value, "scan")} />

        <div className="flex flex-col gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleReferenceLookup(reference, "manuel");
            }}
            className="flex flex-col gap-1.5"
          >
            <label htmlFor="reference" className={LABEL_CLASSES}>
              Numéro de billet ou QR code
            </label>
            <div className="flex gap-2">
              <input
                id="reference"
                name="reference"
                type="text"
                placeholder="GB-XXXXXX"
                disabled={!tripId}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={`${FIELD_CLASSES} flex-1`}
              />
              <button
                type="submit"
                disabled={!tripId || pending}
                className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                Chercher
              </button>
            </div>
          </form>

          <form onSubmit={handleManualSearch} className="flex flex-col gap-1.5">
            <label htmlFor="nameOrPhone" className={LABEL_CLASSES}>
              Recherche par nom ou téléphone
            </label>
            <div className="flex gap-2">
              <input
                id="nameOrPhone"
                name="nameOrPhone"
                type="text"
                placeholder="Nom du passager ou numéro…"
                disabled={!tripId}
                value={nameOrPhone}
                onChange={(e) => setNameOrPhone(e.target.value)}
                className={`${FIELD_CLASSES} flex-1`}
              />
              <button
                type="submit"
                disabled={!tripId || pending}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Chercher
              </button>
            </div>
          </form>
        </div>
      </div>

      {feedback ? (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            feedback.kind === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : feedback.kind === "error"
                ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {candidates.map((candidate) => (
            <li
              key={candidate.passengerId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div className="text-sm">
                <p className="font-medium text-zinc-950 dark:text-zinc-50">{candidate.fullName}</p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {candidate.bookingReference} · Siège {candidate.seatNumber ?? "—"}
                  {candidate.tripId !== tripId ? " · Autre trajet" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleValidate(candidate)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                Valider l&apos;embarquement
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Scan caméra : navigator.mediaDevices.getUserMedia + jsQR (JS pur,
// aucune configuration serveur). onDetected reçoit le contenu texte brut
// du QR (un booking_reference) — identique à ce que produirait la saisie
// manuelle, jamais un format différent à interpréter séparément.
function QrScanner({ disabled, onDetected }: { disabled: boolean; onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastDetectedRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  useEffect(() => {
    // `disabled` doit faire partie des dépendances, pas seulement du
    // rendu : sans ça, désélectionner le trajet démonte <video>/<canvas>
    // (le composant bascule sur le placeholder) mais ne redéclenche
    // jamais ce effect, donc jamais son cleanup — la caméra resterait
    // allumée en arrière-plan alors que l'UI affiche déjà "désactivé".
    if (!active || disabled) return;

    let stream: MediaStream | null = null;
    let rafId: number;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        tick();
      } catch {
        if (!cancelled) setError("Caméra indisponible — utilisez la saisie manuelle ci-contre.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            // Anti-rafale : le même QR reste dans le champ de la caméra
            // pendant plusieurs frames — on ne redéclenche la recherche
            // que si la valeur change ou après 3s, jamais à chaque frame.
            const now = Date.now();
            const last = lastDetectedRef.current;
            if (code.data !== last.value || now - last.at > 3000) {
              lastDetectedRef.current = { value: code.data, at: now };
              onDetected(code.data);
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [active, disabled, onDetected]);

  if (disabled) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-600">
        Scanner caméra
      </div>
    );
  }

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setActive(true);
        }}
        className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Activer la caméra
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
      </div>
      <button
        type="button"
        onClick={() => setActive(false)}
        className="self-start text-xs font-medium text-zinc-500 hover:underline dark:text-zinc-400"
      >
        Désactiver la caméra
      </button>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
