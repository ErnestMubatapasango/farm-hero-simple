import { useEffect, useState } from "react";
import { resolveAvatarUrl } from "@/lib/avatar";

export function useAvatarUrl(value?: string | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveAvatarUrl(value).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [value]);

  return url;
}
