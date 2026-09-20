import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/dal";
import { getUnreadNotificationCountsByType } from "@/lib/notifications";

// Même patron que notifications-non-lues/route.ts — interrogé toutes les
// 60s par les badges par rubrique de la barre latérale (_app-shell.tsx).
export async function GET() {
  await requireUser();
  const counts = await getUnreadNotificationCountsByType();
  return NextResponse.json({ counts });
}
