/**
 * Observability shim.
 *
 * Sentry SDK is intentionally NOT a hard dependency yet — this module gives us
 * a single call site so pages / hooks can report errors today, and we can wire
 * a real transport (Sentry, Logflare, etc.) later without touching callers.
 *
 * To enable Sentry:
 *   1. `bun add @sentry/react`
 *   2. Set `VITE_SENTRY_DSN` in the environment.
 *   3. Replace the `report` implementation below with `Sentry.captureException`.
 */

type Extra = Record<string, unknown>;

const dsn =
  typeof import.meta !== "undefined" ? (import.meta as { env?: { VITE_SENTRY_DSN?: string } }).env?.VITE_SENTRY_DSN : undefined;

const enabled = Boolean(dsn);

function report(level: "error" | "warn" | "info", message: string, error?: unknown, extra?: Extra) {
  // Always log locally so developers see failures during dev.
  const payload = { message, error, extra, ts: new Date().toISOString() };
  if (level === "error") console.error("[observability]", payload);
  else if (level === "warn") console.warn("[observability]", payload);
  else console.info("[observability]", payload);

  // When a DSN is configured we forward via the global Sentry object if the
  // host page has loaded the SDK. This keeps the shim dependency-free.
  if (!enabled) return;
  const g = globalThis as unknown as { Sentry?: { captureException?: (e: unknown, ctx?: unknown) => void; captureMessage?: (m: string, ctx?: unknown) => void } };
  if (!g.Sentry) return;
  try {
    if (error !== undefined) g.Sentry.captureException?.(error, { extra: { message, ...extra } });
    else g.Sentry.captureMessage?.(message, { level, extra });
  } catch {
    // never let telemetry break the app
  }
}

export const observability = {
  isEnabled: () => enabled,
  captureError: (message: string, error: unknown, extra?: Extra) => report("error", message, error, extra),
  captureWarning: (message: string, extra?: Extra) => report("warn", message, undefined, extra),
  captureInfo: (message: string, extra?: Extra) => report("info", message, undefined, extra),
};
