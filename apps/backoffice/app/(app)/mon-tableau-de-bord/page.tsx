import Link from "next/link";
import * as Icons from "@/lib/icons";
import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { getSelectedAgency, getActiveAgencies } from "@/lib/agency-selection";
import { getOpenSession, getTheoreticalBalance, getSessionMovementsBreakdown } from "@/lib/caisse";
import { getAgencyNotifications } from "@/lib/notifications";
import { getBeninMidnightToday } from "@/lib/benin-time";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../_components";
import { StatCard } from "../_stat-card";
import { NOTIFICATION_LEVEL_LABELS, NOTIFICATION_LEVEL_STYLES, formatDepartureDateTime } from "../_shared";
import { AgencySelect } from "../_agency-select";
import { SeatFillBar } from "./SeatFillBar";
import { DelayBadge } from "./DelayBadge";
import { ReportDelayForm } from "./ReportDelayForm";
import { RelaunchButton } from "./RelaunchButton";
import { getAgencyOperationalKpis, getAgencyUpcomingTrips, getAgencyPendingPaymentBookings } from "./_queries";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mtn_money: "MTN Mobile Money",
  moov_money: "Moov Money",
  card: "Carte bancaire",
};

function formatNotificationDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

export default async function AgentDashboardPage() {
  const access = await requireCompany();
  if (!access.ok) {
    return <AccessBlockedMessage reason={access.reason} />;
  }

  // allowPreview: owner uniquement — condition inchangée (getSelectedAgency
  // est désormais partagée avec /pilotage, qui l'autorise en plus pour un
  // chef d'agence avec l'autorisation pilotage ; cette page-ci continue
  // de toujours montrer SA PROPRE agence à un agency_manager/agent, même
  // si un cookie de prévisualisation a été posé ailleurs).
  const agency = await getSelectedAgency({ allowPreview: access.role === "owner" });

  if (!agency) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-8">
        <h1 className="text-lg font-semibold text-zinc-950">Mon tableau de bord</h1>
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
          Aucune agence active pour votre compagnie pour le moment.
        </p>
        {can(access.role, "agencies.manage") ? (
          <Link href="/agences" className="font-medium text-zinc-950 hover:underline">
            Créer une agence →
          </Link>
        ) : null}
      </div>
    );
  }

  const agencies = access.role === "owner" ? await getActiveAgencies(access.company.id) : [];

  const todayFrom = getBeninMidnightToday();
  const todayTo = new Date();
  const elapsedMs = todayTo.getTime() - todayFrom.getTime();
  const yesterdayFrom = new Date(todayFrom.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayTo = new Date(yesterdayFrom.getTime() + elapsedMs);

  const [kpis, openSession, upcomingTrips, pendingPayments, notifications] = await Promise.all([
    getAgencyOperationalKpis(access.company.id, agency.stationId, todayFrom, todayTo, yesterdayFrom, yesterdayTo),
    getOpenSession(access.user.sub),
    getAgencyUpcomingTrips(access.company.id, agency.stationId),
    getAgencyPendingPaymentBookings(access.company.id, agency.stationId),
    getAgencyNotifications(agency.id),
  ]);

  const [theoreticalBalance, caisseBreakdown] = openSession
    ? await Promise.all([
        getTheoreticalBalance(openSession.id),
        getSessionMovementsBreakdown(openSession.id),
      ])
    : [null, null];

  const bookingsDelta = kpis.bookingsTodayCount - kpis.bookingsYesterdaySameTimeCount;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-950">Mon tableau de bord</h1>
        {access.role === "owner" ? (
          <AgencySelect agencies={agencies} selectedAgencyId={agency.id} />
        ) : (
          <span className="text-sm text-zinc-500">{agency.name}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Réservations du jour"
          icon={Icons.TicketIcon}
          accent="blue"
          value={
            <span className="flex items-baseline gap-2">
              {kpis.bookingsTodayCount}
              <span
                className={`text-sm font-medium ${bookingsDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {bookingsDelta >= 0 ? "+" : ""}
                {bookingsDelta} vs hier
              </span>
            </span>
          }
        />
        <StatCard
          label="Paiements en ligne en attente"
          icon={Icons.CardIcon}
          accent="amber"
          value={kpis.pendingOnlinePaymentCount}
        />
        <StatCard
          label="Mes encaissements"
          icon={Icons.BanknoteIcon}
          accent="emerald"
          value={openSession ? formatFcfa(theoreticalBalance ?? 0) : "Aucune session ouverte"}
          href="/caisse"
        />
        <StatCard
          label="Billets à valider"
          icon={Icons.QrCodeIcon}
          accent="red"
          value={kpis.boardingPendingCount}
          href="/embarquement"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950">
            Prochains départs depuis l&apos;agence
          </h2>
          {upcomingTrips.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
              Aucun départ à venir depuis cette agence.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcomingTrips.map((trip) => (
                <li
                  key={trip.tripId}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-950">
                        {trip.originCity} → {trip.destinationCity}
                      </span>
                      <DelayBadge delayMinutes={trip.latestDelayMinutes} />
                    </div>
                    <span className="text-zinc-500">
                      {formatDepartureDateTime(trip.departureAt)} · Bus {trip.busNumber}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <SeatFillBar availableSeats={trip.availableSeats} totalSeats={trip.totalSeats} />
                    <ReportDelayForm tripId={trip.tripId} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-zinc-950">Ma session de caisse</h2>
          {!openSession ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
              Aucune session de caisse ouverte.{" "}
              <Link href="/caisse" className="font-medium text-zinc-950 hover:underline">
                Ouvrir une session →
              </Link>
            </p>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <p className="mb-4 text-xs text-zinc-500">
                Espèces uniquement — les paiements Mobile Money/carte ne passent jamais par une
                session de caisse.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <span className="block text-sm text-zinc-500">Encaissements</span>
                  <span className="font-display text-lg font-semibold text-zinc-950">
                    {formatFcfa(caisseBreakdown!.encaissementsFcfa)} ({caisseBreakdown!.encaissementsCount})
                  </span>
                </div>
                <div>
                  <span className="block text-sm text-zinc-500">Dépôts coffre</span>
                  <span className="font-display text-lg font-semibold text-zinc-950">
                    {formatFcfa(caisseBreakdown!.depotsFcfa)} ({caisseBreakdown!.depotsCount})
                  </span>
                </div>
                <div>
                  <span className="block text-sm text-zinc-500">Solde théorique</span>
                  <span className="font-display text-lg font-semibold text-zinc-950">
                    {formatFcfa(theoreticalBalance ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/reservations/nouvelle"
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            + Nouvelle réservation
          </Link>
          <Link
            href="/embarquement"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Embarquement
          </Link>
          <Link
            href="/reservations"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Rechercher une réservation
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950">Mes alertes</h2>
          {notifications.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
              Aucune alerte pour cette agence.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-zinc-950">{notification.title}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${NOTIFICATION_LEVEL_STYLES[notification.level]}`}
                    >
                      {NOTIFICATION_LEVEL_LABELS[notification.level]}
                    </span>
                  </div>
                  {notification.body ? (
                    <span className="text-sm text-zinc-500">{notification.body}</span>
                  ) : null}
                  <span className="text-xs text-zinc-400">
                    {formatNotificationDate(notification.createdAt)}
                  </span>
                  {notification.actionHref ? (
                    <Link
                      href={notification.actionHref}
                      className="mt-1 text-sm font-medium text-zinc-950 hover:underline"
                    >
                      Voir →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950">Réservations à traiter</h2>
          {pendingPayments.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
              Aucun paiement en ligne en attente pour cette agence.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[500px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-medium">Réservation</th>
                    <th className="px-4 py-3 font-medium">Trajet</th>
                    <th className="px-4 py-3 font-medium">Montant</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayments.map((booking) => {
                    const expired =
                      !booking.paymentTokenExpiresAt || new Date(booking.paymentTokenExpiresAt) <= new Date();
                    return (
                      <tr
                        key={booking.paymentId}
                        className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50"
                      >
                        <td className="px-4 py-3 text-zinc-700">
                          <div className="flex flex-col">
                            <span>{booking.bookingReference}</span>
                            <span className="text-xs text-zinc-500">{booking.passengerNames || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          <div className="flex flex-col">
                            <span>
                              {booking.originCity} → {booking.destinationCity}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {formatDepartureDateTime(booking.departureAt)} ·{" "}
                              {PAYMENT_METHOD_LABELS[booking.paymentMethod] ?? booking.paymentMethod}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          {formatFcfa(booking.amountDueFcfa)}
                        </td>
                        <td className="px-4 py-3">
                          <RelaunchButton paymentId={booking.paymentId} disabled={expired} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
