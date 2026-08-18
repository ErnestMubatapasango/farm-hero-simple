const raw = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";

function formatVersion(value: string): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export const APP_VERSION = raw;
export const APP_VERSION_LABEL = formatVersion(raw);
