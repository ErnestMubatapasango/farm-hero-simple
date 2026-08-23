import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  IDLE_WRITE_THROTTLE_MS,
  clearLastActivity,
  markIdleLogout,
  readLastActivity,
  storeIdleRedirect,
  writeLastActivity,
} from "@/lib/idle";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/accept-invite"];

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

/**
 * Signs the user out after IDLE_TIMEOUT_MS with no activity.
 * Last-activity timestamp lives in localStorage so all tabs share one clock.
 */
export function useIdleTimeout() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [msRemaining, setMsRemaining] = useState(IDLE_TIMEOUT_MS);
  const lastWriteRef = useRef(0);
  const signingOutRef = useRef(false);

  const keepAlive = useCallback(() => {
    if (!userId) return;
    const now = Date.now();
    writeLastActivity(userId, now);
    lastWriteRef.current = now;
    setMsRemaining(IDLE_TIMEOUT_MS);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setMsRemaining(IDLE_TIMEOUT_MS);
      return;
    }

    // Seed the clock if this is a fresh session in this browser.
    if (readLastActivity(userId) === null) writeLastActivity(userId);

    const touch = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < IDLE_WRITE_THROTTLE_MS) return;
      lastWriteRef.current = now;
      writeLastActivity(userId, now);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") touch();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, touch, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisible);

    const forceSignOut = async () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      markIdleLogout();
      const path = window.location.pathname + window.location.search;
      if (!PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))) {
        storeIdleRedirect(path);
      }
      clearLastActivity(userId);
      await supabase.auth.signOut();
    };

    const tick = () => {
      const last = readLastActivity(userId) ?? Date.now();
      const remaining = last + IDLE_TIMEOUT_MS - Date.now();
      setMsRemaining(remaining);
      if (remaining <= 0) void forceSignOut();
    };

    tick();
    const interval = window.setInterval(tick, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, touch));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [userId]);

  return {
    active: Boolean(userId),
    msRemaining,
    secondsUntilLogout: Math.max(0, Math.ceil(msRemaining / 1000)),
    showWarning: Boolean(userId) && msRemaining > 0 && msRemaining <= IDLE_WARNING_MS,
    keepAlive,
  };
}
