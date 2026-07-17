// Invite a user to the caller's organization via Supabase Auth.
// Caller must be authenticated and have super_admin or developer role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
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

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { organization_id: orgId, role, invited_by: callerId },
      redirectTo,
    });
    if (inviteErr) return json({ error: inviteErr.message }, 400);

    const { error: rowErr } = await admin.from("invitations").insert({
      organization_id: orgId,
      email,
      role,
      invited_by: callerId,
      invited_user_id: invited.user?.id ?? null,
      status: "pending",
    });
    if (rowErr) return json({ error: rowErr.message }, 400);

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
