import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/dal";
import { getUnreadNotificationCount } from "@/lib/notifications";

// Interrogé une fois par minute par le badge de la cloche
// (_notification-badge.tsx), même patron que /heure-benin.
export async function GET() {
  await requireUser();
  const count = await getUnreadNotificationCount();
  return NextResponse.json({ count });
}
