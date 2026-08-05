import { supabase } from "@/integrations/supabase/client";

const KEY = "kyf_pending_org";

interface PendingOrg {
  name?: string;
  full_name?: string;
}

export interface CompletePendingOrgResult {
  created: boolean;
  error?: string;
}

export function readPendingOrg(): PendingOrg | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingOrg;
  } catch {
    return null;
  }
}

export function stashPendingOrg(pending: PendingOrg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
}

export function clearPendingOrg() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Secondary fallback path: organizations are normally created server-side at
 * signup (from the `pending_org_name` signup metadata). This only kicks in for
 * accounts created before that behaviour existed, or if the trigger path was
 * bypassed. Errors are returned rather than swallowed.
 */
export async function completePendingOrg(userId: string): Promise<CompletePendingOrgResult> {
  const pending = readPendingOrg();
  if (!pending) return { created: false };

  if (!pending.name) {
    clearPendingOrg();
    return { created: false };
  }

  // Already has an org? Nothing to do.
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile?.organization_id) {
    clearPendingOrg();
    return { created: false };
  }

  const slug = pending.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { error } = await supabase.rpc("create_organization", {
    _name: pending.name,
    _slug: slug,
  });

  if (error) {
    if (/already belongs/i.test(error.message)) {
      clearPendingOrg();
      return { created: false };
    }
    return { created: false, error: error.message };
  }

  if (pending.full_name) {
    await supabase
      .from("profiles")
      .update({ full_name: pending.full_name })
      .eq("user_id", userId);
  }

  clearPendingOrg();
  return { created: true };
}
