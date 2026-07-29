import { supabase } from "@/integrations/supabase/client";

const KEY = "kyf_pending_org";

interface PendingOrg {
  name?: string;
  full_name?: string;
}

/**
 * If a pending org intent was stashed at signup (email-confirmation flow),
 * complete it now that we have a session. Returns true when an org was created.
 * Idempotent: clears the localStorage key on success or on a known-benign failure
 * (e.g. user already belongs to an org).
 */
export async function completePendingOrg(userId: string): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  let pending: PendingOrg | null = null;
  try {
    pending = JSON.parse(raw) as PendingOrg;
  } catch {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    return false;
  }

  if (!pending?.name) {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    return false;
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
    // Already belongs to an org → nothing more to do, drop the key.
    if (/already belongs/i.test(error.message)) {
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }
    return false;
  }

  if (pending.full_name) {
    await supabase
      .from("profiles")
      .update({ full_name: pending.full_name })
      .eq("user_id", userId);
  }

  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return true;
}
