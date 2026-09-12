"use client";

import { useEffect, useState } from "react";

// Composant minimal : le calcul du fuseau béninois reste entièrement dans
// lib/benin-time.ts (server-only) — ce client se contente d'afficher la
// valeur rendue par le serveur au chargement, puis va la rafraîchir une
// fois par minute via /heure-benin plutôt que de dupliquer ce calcul ici.
export function LiveBeninClock({ initialTime }: { initialTime: string }) {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    const id = setInterval(() => {
      fetch("/heure-benin")
        .then((res) => res.json())
        .then((data: { time: string }) => setTime(data.time))
        .catch(() => {
          // Best-effort : en cas d'échec réseau, l'heure affichée reste la
          // dernière connue plutôt que de casser la topbar.
        });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return <span>{time}</span>;
}
