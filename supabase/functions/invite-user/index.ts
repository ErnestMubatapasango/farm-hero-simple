// Invite a user to the caller's organization via Supabase Auth.
// Caller must be authenticated (JWT verified by the gateway) and hold
// super_admin or developer role for the target org.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Allowed origins for CORS. Add production domain(s) as needed.
const ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:5173",
  // Lovable preview + published URLs share this suffix
];

function corsFor(origin: string | null): Record<string, string> {
  const allow =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".lovable.app") ||
      origin.endsWith(".lovableproject.com"))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Very small in-memory rate limiter (per caller id). Resets on cold start.
const rateWindow = new Map<string, number[]>();
const RATE_LIMIT = 20; // requests
const RATE_WINDOW_MS = 60_000;
function rateLimited(callerId: string): boolean {
  const now = Date.now();
  const arr = (rateWindow.get(callerId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  rateWindow.set(callerId, arr);
  return arr.length > RATE_LIMIT;
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // Decode JWT (already verified by gateway via verify_jwt = true) to get caller id.
  let callerId: string;
  try {
    const token = authHeader.slice("Bearer ".length);
    const payload = JSON.parse(atob(token.split(".")[1]));
    callerId = payload.sub;
    if (!callerId) throw new Error("No sub claim");
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }

  if (rateLimited(callerId)) {
    return json({ error: "Too many requests. Please slow down." }, 429);
  }

  let body: { email?: string; role?: string; action?: string; invitation_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = body.action ?? "invite";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up caller's org and verify role
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", callerId)
    .maybeSingle();

  const { data: rolesRows } = await admin
    .from("user_roles")
    .select("role, organization_id")
    .eq("user_id", callerId);

  const roles = (rolesRows ?? []).map((r) => r.role);
  const isDeveloper = roles.includes("developer");
  const superAdminOrgIds = new Set(
    (rolesRows ?? [])
      .filter((r) => r.role === "super_admin" && r.organization_id)
      .map((r) => r.organization_id as string),
  );
  if (!isDeveloper && superAdminOrgIds.size === 0) return json({ error: "Forbidden" }, 403);

  const callerCanActOnOrg = (targetOrgId: string | null | undefined) =>
    isDeveloper || (!!targetOrgId && superAdminOrgIds.has(targetOrgId));

  const orgId = profile?.organization_id;
  if (!orgId && !isDeveloper) return json({ error: "No organization" }, 400);

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const redirectTo = `${origin}/accept-invite`;


  if (action === "invite") {
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role ?? "enumerator";
    if (!email || !["admin", "enumerator"].includes(role)) {
      return json({ error: "email and valid role required" }, 400);
    }
    if (!orgId) return json({ error: "No organization" }, 400);
    if (!callerCanActOnOrg(orgId)) return json({ error: "Forbidden" }, 403);

    // Insert the invitations row FIRST so acceptance logic has a target even
    // if the email dispatch flakes. The unique constraint on (email, org)
    // isn't enforced yet; we tolerate a soft duplicate here.
    const { data: invRow, error: rowErr } = await admin
      .from("invitations")
      .insert({
        organization_id: orgId,
        email,
        role,
        invited_by: callerId,
        status: "pending",
      })
      .select("id")
      .single();
    if (rowErr) return json({ error: "Invitation could not be recorded" }, 400);

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { organization_id: orgId, role, invited_by: callerId },
      redirectTo,
    });
    if (inviteErr) {
      // Mark row as failed so admins can retry via "resend" without a duplicate.
      await admin
        .from("invitations")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: callerId })
        .eq("id", invRow.id);
      // Generic message — avoid enumerating existing emails.
      return json({ error: "Invitation could not be sent" }, 400);
    }

    if (invited.user?.id) {
      await admin
        .from("invitations")
        .update({ invited_user_id: invited.user.id })
        .eq("id", invRow.id);
    }

    return json({ ok: true });
  }

  if (action === "resend") {
    if (!body.invitation_id) return json({ error: "invitation_id required" }, 400);
    const { data: inv } = await admin
      .from("invitations")
      .select("email, role, organization_id")
      .eq("id", body.invitation_id)
      .maybeSingle();
    if (!inv) return json({ error: "Invitation not found" }, 404);
    if (!callerCanActOnOrg(inv.organization_id)) return json({ error: "Forbidden" }, 403);

    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(inv.email, {
      data: { organization_id: inv.organization_id, role: inv.role, invited_by: callerId },
      redirectTo,
    });
    if (inviteErr) return json({ error: inviteErr.message }, 400);

    await admin
      .from("invitations")
      .update({ status: "pending", accepted_at: null })
      .eq("id", body.invitation_id);

    return json({ ok: true });
  }

  if (action === "revoke") {
    if (!body.invitation_id) return json({ error: "invitation_id required" }, 400);
    const { data: inv } = await admin
      .from("invitations")
      .select("invited_user_id, status, organization_id")
      .eq("id", body.invitation_id)
      .maybeSingle();
    if (!inv) return json({ error: "Invitation not found" }, 404);
    if (!callerCanActOnOrg(inv.organization_id)) return json({ error: "Forbidden" }, 403);

    if (inv.status === "pending") {
      // Hard delete: no profile/role/farmers exist yet.
      if (inv.invited_user_id) {
        await admin.auth.admin.deleteUser(inv.invited_user_id);
      }
      await admin.from("invitations").delete().eq("id", body.invitation_id);
      return json({ ok: true });
    }


    if (inv.status === "accepted") {
      // Soft deactivate: drop role(s), preserve auth user + profile so
      // farmers.enrolled_by still resolves to a real name.
      const caller = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: rpcErr } = await caller.rpc("revoke_invitation", {
        _invitation_id: body.invitation_id,
      });
      if (rpcErr) return json({ error: rpcErr.message }, 400);
      return json({ ok: true });
    }

    // Already revoked — nothing to do.
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
