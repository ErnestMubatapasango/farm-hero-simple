export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
export const IDLE_WARNING_MS = 2 * 60 * 1000; // warn 2 minutes before logout
export const IDLE_WRITE_THROTTLE_MS = 15 * 1000;

export const IDLE_LOGOUT_FLAG = "kyf.idle-logout";
export const IDLE_REDIRECT_KEY = "kyf.idle-redirect";


export function idleStorageKey(userId: string) {
  return `kyf.last-activity.${userId}`;
}

export function readLastActivity(userId: string): number | null {
  try {
    const raw = localStorage.getItem(idleStorageKey(userId));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(userId: string, ts: number = Date.now()) {
  try {
    localStorage.setItem(idleStorageKey(userId), String(ts));
  } catch {
    /* ignore */
  }
}

export function clearLastActivity(userId: string) {
  try {
    localStorage.removeItem(idleStorageKey(userId));
  } catch {
    /* ignore */
  }
}

export function markIdleLogout() {
  try {
    sessionStorage.setItem(IDLE_LOGOUT_FLAG, "1");
  } catch {
    /* ignore */
  }
}

export function consumeIdleLogout(): boolean {
  try {
    const flag = sessionStorage.getItem(IDLE_LOGOUT_FLAG);
    if (flag) sessionStorage.removeItem(IDLE_LOGOUT_FLAG);
    return Boolean(flag);
  } catch {
    return false;
  }
}

export function storeIdleRedirect(path: string) {
  try {
    sessionStorage.setItem(IDLE_REDIRECT_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeIdleRedirect(): string | null {
  try {
    const path = sessionStorage.getItem(IDLE_REDIRECT_KEY);
    if (path) sessionStorage.removeItem(IDLE_REDIRECT_KEY);
    return path && path.startsWith("/") ? path : null;
  } catch {
    return null;
  }
}

export function clearIdleState() {
  try {
    sessionStorage.removeItem(IDLE_LOGOUT_FLAG);
    sessionStorage.removeItem(IDLE_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
}

