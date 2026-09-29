import Link from "next/link";
import { requireCompany, requirePageAccess } from "@/lib/supabase/dal";
import { getActiveAgencies, getSelectedAgency } from "@/lib/agency-selection";
import { getCompanyNotifications } from "@/lib/notifications";
import { getBeninDateString, getBeninMidnightToday } from "@/lib/benin-time";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "./_components";
import { StatCard } from "./_stat-card";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_STYLES,
  NOTIFICATION_LEVEL_LABELS,
  NOTIFICATION_LEVEL_STYLES,
  formatDepartureDateTime,
} from "./_shared";
import { BookingsChart } from "./_dashboard-chart";
import {
  getConfirmedBookingsInPeriod,
  getRevenueInPeriod,
  getOccupancyRateInPeriod,
  getRecentBookings,
  groupBookingsByDay,
} from "./_dashboard-queries";
import { buildMonthGrid, shiftMonth, monthLabel, WEEKDAY_LABELS } from "./chauffeurs/monthGrid";
import { AgencySelect } from "./_agency-select";
import { getRevenueByMethodInPeriod, getActiveClientsCount, getTopRoutes, getTripDatesInMonth } from "./pilotage/_queries";

const MONTH_RE = /^\d{4}-\d{2}$/;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mtn_money: "MTN Mobile Money",
  moov_money: "Moov Money",
  card: "Carte bancaire",
  cash: "Espèces",
};

const ALERT_TYPES = new Set(["trip_delay_reported", "driver_document_expiring"]);

function formatNotificationDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

export default async function DashboardPage(props: PageProps<"/">) {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  // requirePageAccess(result, "companyWide") est LE point de contrôle
  // central (voir lib/supabase/dal.ts) : owner, ou chef d'agence
  // explicitement autorisé par le propriétaire. Inchangé par la fusion
  // avec /pilotage (chantier "un seul tableau de bord compagnie entière")
  // — /pilotage lui-même n'est plus qu'une redirection vers "/", sans
  // garde propre, "/" restant la seule et unique porte d'entrée.
  requirePageAccess(result, "companyWide");

  const { company } = result;

  const searchParams = await props.searchParams;
  const monthParam = typeof searchParams.month === "string" ? searchParams.month : null;
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : getBeninDateString().slice(0, 7);

  const todayFrom = getBeninMidnightToday();
  const todayTo = new Date();
  const elapsedMs = todayTo.getTime() - todayFrom.getTime();
  const yesterdayFrom = new Date(todayFrom.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayTo = new Date(yesterdayFrom.getTime() + elapsedMs);

  const thirtyDaysAgo = new Date(todayTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(todayTo.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    bookingsToday,
    bookingsYesterday,
    revenueToday,
    revenueYesterday,
    occupancyRate,
    activeClients,
    methodBreakdown,
    topRoutes,
    tripDates,
    recentBookings,
    weekBookings,
    allNotifications,
    agencies,
    selectedAgency,
  ] = await Promise.all([
    getConfirmedBookingsInPeriod(company.id, todayFrom, todayTo),
    getConfirmedBookingsInPeriod(company.id, yesterdayFrom, yesterdayTo),
    getRevenueInPeriod(company.id, todayFrom, todayTo),
    getRevenueInPeriod(company.id, yesterdayFrom, yesterdayTo),
    getOccupancyRateInPeriod(company.id, todayFrom, todayTo),
    getActiveClientsCount(company.id, thirtyDaysAgo, todayTo),
    getRevenueByMethodInPeriod(company.id, thirtyDaysAgo, todayTo),
    getTopRoutes(company.id, thirtyDaysAgo, todayTo),
    getTripDatesInMonth(company.id, month),
    getRecentBookings(company.id),
    getConfirmedBookingsInPeriod(company.id, sevenDaysAgo, todayTo),
    getCompanyNotifications(50),
    // La garde plus haut (requirePageAccess) a déjà redirigé si le niveau
    // "companyWide" n'était pas atteint — on sait donc ici que owner OU
    // chef d'agence autorisé.
    getActiveAgencies(company.id),
    getSelectedAgency({ allowPreview: true }),
  ]);

  const bookingsDelta = bookingsToday.length - bookingsYesterday.length;
  const revenueDelta = revenueToday - revenueYesterday;
  const alerts = allNotifications.filter((n) => ALERT_TYPES.has(n.type)).slice(0, 10);
  const weeklyChartData = groupBookingsByDay(weekBookings);
  const weeks = buildMonthGrid(month);
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const methodTotalFcfa = Object.values(methodBreakdown).reduce((sum, m) => sum + m.amountFcfa, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-950">Pilotage</h1>
        {agencies.length >= 1 && selectedAgency ? (
          <div className="flex flex-wrap items-center gap-3">
            <AgencySelect agencies={agencies} selectedAgencyId={selectedAgency.id} />
            <Link
              href="/mon-tableau-de-bord"
              className="text-sm font-medium text-zinc-950 hover:underline"
            >
              Voir le tableau de bord de cette agence →
            </Link>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Réservations du jour"
          value={
            <span className="flex items-baseline gap-2">
              {bookingsToday.length}
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
          label="Revenus du jour"
          value={
            <span className="flex flex-col">
              {formatFcfa(revenueToday)}
              <span
                className={`text-sm font-medium ${revenueDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {revenueDelta >= 0 ? "+" : ""}
                {formatFcfa(revenueDelta)} vs hier
              </span>
            </span>
          }
        />
        <StatCard
          label="Taux de remplissage"
          value={occupancyRate === null ? "—" : `${Math.round(occupancyRate * 100)} %`}
        />
        <StatCard label="Clients actifs (30j)" value={activeClients} />
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950">Alertes en temps réel</h2>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
            Aucune alerte pour le moment.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.map((notification) => (
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
        <h2 className="mb-4 text-lg font-semibold text-zinc-950">
          Réservations — 7 derniers jours
        </h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          {weeklyChartData.length === 0 ? (
            <p className="text-zinc-500">Aucune réservation confirmée cette semaine.</p>
          ) : (
            <BookingsChart data={weeklyChartData} />
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950">
          Répartition des paiements (30 derniers jours)
        </h2>
        {methodTotalFcfa === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
            Aucun paiement approuvé sur cette période.
          </p>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6">
            {(Object.keys(PAYMENT_METHOD_LABELS) as (keyof typeof methodBreakdown)[]).map((method) => {
              const { amountFcfa, count } = methodBreakdown[method];
              const share = methodTotalFcfa > 0 ? Math.round((amountFcfa / methodTotalFcfa) * 100) : 0;
              return (
                <div key={method} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-zinc-950">
                      {PAYMENT_METHOD_LABELS[method]}
                    </span>
                    <span className="text-zinc-500">
                      {formatFcfa(amountFcfa)} ({count}) · {share} %
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-zinc-950" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950">
          Top 5 itinéraires (30 derniers jours)
        </h2>
        {topRoutes.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
            Aucune réservation confirmée sur cette période.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {topRoutes.map((route, index) => (
              <li
                key={`${route.originCity}-${route.destinationCity}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm"
              >
                <span className="text-zinc-950">
                  {index + 1}. {route.originCity} → {route.destinationCity}
                </span>
                <span className="text-zinc-500">{route.count} réservation{route.count > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-950">Calendrier des trajets</h2>
          <div className="flex items-center gap-3">
            <Link
              href={`/?month=${prevMonth}`}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              ← Mois précédent
            </Link>
            <span className="text-sm font-medium capitalize text-zinc-950">{monthLabel(month)}</span>
            <Link
              href={`/?month=${nextMonth}`}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Mois suivant →
            </Link>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {weeks.map((week, i) => (
              <div key={i} className="grid grid-cols-7 gap-1">
                {week.map((day) => {
                  const hasTrip = tripDates.has(day.date);
                  return (
                    <div
                      key={day.date}
                      className={`relative flex h-12 flex-col items-center justify-start gap-1 rounded p-1 text-xs font-medium ${day.isCurrentMonth ? "" : "opacity-40"}`}
                    >
                      <span className="text-zinc-900">{day.dayOfMonth}</span>
                      {hasTrip ? <span className="h-1.5 w-1.5 rounded-full bg-zinc-950" /> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950">
          5 réservations les plus récentes
        </h2>
        {recentBookings.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500">
            Aucune réservation pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[600px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">Réservation</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3 text-zinc-700">{booking.booking_reference}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      {formatFcfa(booking.total_price_fcfa)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          BOOKING_STATUS_STYLES[booking.status] ??
                          "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {formatDepartureDateTime(booking.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/reservations/nouvelle"
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            + Nouvelle réservation
          </Link>
          <a
            href={`/reservations/export?from=${getBeninDateString()}&to=${getBeninDateString()}`}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            ⭳ Export du jour
          </a>
          <Link
            href="/trajets/nouveau"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Créer un itinéraire
          </Link>
        </div>
      </section>
    </div>
  );
}
