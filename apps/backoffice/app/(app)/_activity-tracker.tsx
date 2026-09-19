"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lockScreen, recordActivity } from "./lock-actions";

// Vérifié toutes les 15s — assez fin pour un seuil de 2-5 min sans
// surcharger. Ne rend rien : l'écran de verrouillage lui-même
// (_lock-screen.tsx) n'est rendu que côté serveur par layout.tsx, une
// fois requireCompany() au courant (calcul paresseux sur
// last_activity_at, voir dal.ts) — ce composant se contente de
// déclencher ce recalcul au bon moment plutôt que d'afficher son propre
// overlay, pour n'avoir qu'un seul endroit qui sait dessiner l'écran de
// verrouillage.
const CHECK_INTERVAL_MS = 15 * 1000;
const HEARTBEAT_INTERVAL_MS = 45 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "touchstart"] as const;

export function ActivityTracker({ lockTimeoutMinutes }: { lockTimeoutMinutes: number }) {
  const router = useRouter();
  const lastInteractionAt = useRef(Date.now());
  const lastHeartbeatAt = useRef(Date.now());
  const hasInteractedSinceHeartbeat = useRef(false);
  const hasTriggeredLock = useRef(false);

  useEffect(() => {
    const onActivity = () => {
      lastInteractionAt.current = Date.now();
      hasInteractedSinceHeartbeat.current = true;
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const timeoutMs = lockTimeoutMinutes * 60 * 1000;
    const interval = setInterval(() => {
      const now = Date.now();

      if (!hasTriggeredLock.current && now - lastInteractionAt.current > timeoutMs) {
        hasTriggeredLock.current = true;
        void lockScreen().then(() => router.refresh());
        return;
      }

      // Battement de cœur : seulement si une interaction a eu lieu depuis
      // le dernier envoi — un onglet resté ouvert sans interaction n'émet
      // rien, exactement le cas qu'on veut voir expirer côté serveur.
      if (hasInteractedSinceHeartbeat.current && now - lastHeartbeatAt.current > HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatAt.current = now;
        hasInteractedSinceHeartbeat.current = false;
        void recordActivity();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      clearInterval(interval);
    };
  }, [lockTimeoutMinutes, router]);

  return null;
}
