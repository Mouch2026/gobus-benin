import { supabaseAdmin } from "@/lib/supabase-admin";

export type AgencyOperationalKpis = {
  bookingsTodayCount: number;
  bookingsYesterdaySameTimeCount: number;
  pendingOnlinePaymentCount: number;
  boardingPendingCount: number;
};

export async function getAgencyOperationalKpis(
  companyId: string,
  stationId: string,
  todayFrom: Date,
  todayTo: Date,
  yesterdayFrom: Date,
  yesterdayTo: Date
): Promise<AgencyOperationalKpis> {
  const { data, error } = await supabaseAdmin
    .rpc("get_agency_operational_kpis", {
      p_company_id: companyId,
      p_station_id: stationId,
      p_today_from: todayFrom.toISOString(),
      p_today_to: todayTo.toISOString(),
      p_yesterday_from: yesterdayFrom.toISOString(),
      p_yesterday_to: yesterdayTo.toISOString(),
    })
    .maybeSingle<{
      bookings_today_count: number;
      bookings_yesterday_same_time_count: number;
      pending_online_payment_count: number;
      boarding_pending_count: number;
    }>();

  if (error || !data) {
    console.error("Impossible de charger les KPI de l'agence :", error?.message);
    return {
      bookingsTodayCount: 0,
      bookingsYesterdaySameTimeCount: 0,
      pendingOnlinePaymentCount: 0,
      boardingPendingCount: 0,
    };
  }

  return {
    bookingsTodayCount: data.bookings_today_count,
    bookingsYesterdaySameTimeCount: data.bookings_yesterday_same_time_count,
    pendingOnlinePaymentCount: data.pending_online_payment_count,
    boardingPendingCount: data.boarding_pending_count,
  };
}

export type UpcomingTrip = {
  tripId: string;
  departureAt: string;
  busNumber: string;
  originCity: string;
  destinationCity: string;
  totalSeats: number;
  availableSeats: number;
  latestDelayMinutes: number | null;
  latestDelayReason: string | null;
  latestDelayReportedAt: string | null;
};

export async function getAgencyUpcomingTrips(companyId: string, stationId: string): Promise<UpcomingTrip[]> {
  const { data, error } = await supabaseAdmin.rpc("get_agency_upcoming_trips", {
    p_company_id: companyId,
    p_station_id: stationId,
  });

  if (error) {
    console.error("Impossible de charger les prochains départs :", error.message);
    return [];
  }

  return ((data ?? []) as {
    trip_id: string;
    departure_at: string;
    bus_number: string;
    origin_city: string;
    destination_city: string;
    total_seats: number;
    available_seats: number;
    latest_delay_minutes: number | null;
    latest_delay_reason: string | null;
    latest_delay_reported_at: string | null;
  }[]).map((row) => ({
    tripId: row.trip_id,
    departureAt: row.departure_at,
    busNumber: row.bus_number,
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    totalSeats: row.total_seats,
    availableSeats: row.available_seats,
    latestDelayMinutes: row.latest_delay_minutes,
    latestDelayReason: row.latest_delay_reason,
    latestDelayReportedAt: row.latest_delay_reported_at,
  }));
}

export type PendingPaymentBooking = {
  bookingId: string;
  bookingReference: string;
  passengerNames: string;
  phone: string | null;
  originCity: string;
  destinationCity: string;
  departureAt: string;
  paymentId: string;
  paymentMethod: string;
  amountDueFcfa: number;
  paymentTokenExpiresAt: string | null;
};

export async function getAgencyPendingPaymentBookings(
  companyId: string,
  stationId: string
): Promise<PendingPaymentBooking[]> {
  const { data, error } = await supabaseAdmin.rpc("get_agency_pending_payment_bookings", {
    p_company_id: companyId,
    p_station_id: stationId,
  });

  if (error) {
    console.error("Impossible de charger les réservations à traiter :", error.message);
    return [];
  }

  return ((data ?? []) as {
    booking_id: string;
    booking_reference: string;
    passenger_names: string;
    phone: string | null;
    origin_city: string;
    destination_city: string;
    departure_at: string;
    payment_id: string;
    payment_method: string;
    amount_due_fcfa: number;
    payment_token_expires_at: string | null;
  }[]).map((row) => ({
    bookingId: row.booking_id,
    bookingReference: row.booking_reference,
    passengerNames: row.passenger_names,
    phone: row.phone,
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    departureAt: row.departure_at,
    paymentId: row.payment_id,
    paymentMethod: row.payment_method,
    amountDueFcfa: row.amount_due_fcfa,
    paymentTokenExpiresAt: row.payment_token_expires_at,
  }));
}
