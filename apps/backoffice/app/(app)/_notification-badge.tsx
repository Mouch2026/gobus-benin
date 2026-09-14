"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Composant minimal, même patron que _live-clock.tsx : seul le compte
// initial vient du serveur, ensuite un sondage toutes les 60 s via un
// route handler dédié. Si le compte a changé, on redemande un rendu
// serveur (le panneau lui-même reste entièrement côté serveur) plutôt que
// de dupliquer la liste des notifications côté client.
export function NotificationBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      fetch("/notifications-non-lues")
        .then((res) => res.json())
        .then((data: { count: number }) => {
          setCount((previous) => {
            if (data.count !== previous) {
              router.refresh();
            }
            return data.count;
          });
        })
        .catch(() => {
          // Best-effort : en cas d'échec réseau, le compteur affiché reste
          // le dernier connu plutôt que de casser la topbar.
        });
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  if (count === 0) {
    return null;
  }

  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
