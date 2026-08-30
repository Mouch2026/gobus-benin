import { LookupForm } from "./LookupForm";

export default function GererMaReservationPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Gérer ma réservation
          </h1>
          <p className="mt-2 text-muted">
            Retrouvez votre réservation avec sa référence et le numéro de téléphone du passager.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-8">
          <LookupForm />
        </div>
      </div>
    </div>
  );
}
