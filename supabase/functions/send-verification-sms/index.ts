// Send an SMS to a farmer when their record is verified or rejected.
// Caller must be admin/super_admin/developer for the farmer's organization.
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

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  let body: { farmer_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const farmerId = body.farmer_id;
  if (!farmerId || typeof farmerId !== "string") {
    return json({ error: "farmer_id required" }, 400);
  }

  // Caller-scoped client (RLS) — confirms caller can read this farmer
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: farmer, error: fErr } = await admin
    .from("farmers")
    .select("id, first_name, last_name, phone, status, organization_id")
    .eq("id", farmerId)
    .maybeSingle();
  if (fErr || !farmer) return json({ error: "Farmer not found" }, 404);

  // Authorize: caller must be admin/super_admin/developer for the org
  const { data: roles } = await admin
    .from("user_roles")
    .select("role, organization_id")
    .eq("user_id", callerId);
  const allowed = (roles ?? []).some(
    (r) =>
      r.role === "developer" ||
      ((r.role === "admin" || r.role === "super_admin") &&
        r.organization_id === farmer.organization_id),
  );
  if (!allowed) return json({ error: "Forbidden" }, 403);

  if (farmer.status !== "verified" && farmer.status !== "rejected") {
    return json({ skipped: "status_not_terminal" });
  }
  if (!farmer.phone) {
    await admin.from("farmer_activity_log").insert({
      farmer_id: farmer.id,
      organization_id: farmer.organization_id,
      actor_id: callerId,
      action: "whatsapp_skipped_no_phone",
    });
    return json({ skipped: "no_phone" });
  }

  // Org name for the message body
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", farmer.organization_id)
    .maybeSingle();
  const orgName = org?.name ?? "your organization";

  const messageBody =
    farmer.status === "verified"
      ? `Hello ${farmer.first_name}, your registration with ${orgName} has been verified. Welcome aboard!`
      : `Hello ${farmer.first_name}, your registration with ${orgName} needs more information. Please contact your enumerator.`;

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !TWILIO_WHATSAPP_FROM) {
    await admin.from("farmer_activity_log").insert({
      farmer_id: farmer.id,
      organization_id: farmer.organization_id,
      actor_id: callerId,
      action: "whatsapp_failed",
      notes: "Missing Twilio WhatsApp configuration",
    });
    return json({ error: "Twilio WhatsApp not configured" }, 500);
  }

  // Normalize phone to E.164, then prefix with `whatsapp:` for the Twilio WhatsApp channel.
  const normalizedPhone = farmer.phone.trim().startsWith("+")
    ? farmer.phone.trim()
    : `+${farmer.phone.trim().replace(/[^\d]/g, "")}`;
  const toAddr = `whatsapp:${normalizedPhone}`;
  const fromAddr = TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;

  // TODO: For production, swap `Body` for `ContentSid` + `ContentVariables` (approved WhatsApp template).
  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: toAddr,
      From: fromAddr,
      Body: messageBody,
    }),
  });
  const respText = await res.text();

  if (!res.ok) {
    await admin.from("farmer_activity_log").insert({
      farmer_id: farmer.id,
      organization_id: farmer.organization_id,
      actor_id: callerId,
      action: "whatsapp_failed",
      notes: `Twilio ${res.status}: ${respText.slice(0, 500)}`,
    });
    return json({ error: "WhatsApp send failed", status: res.status, detail: respText }, 502);
  }

  let sid: string | undefined;
  try {
    sid = JSON.parse(respText)?.sid;
  } catch {
    /* ignore */
  }

  await admin.from("farmer_activity_log").insert({
    farmer_id: farmer.id,
    organization_id: farmer.organization_id,
    actor_id: callerId,
    action: "whatsapp_sent",
    notes: sid ? `Twilio SID ${sid}` : null,
  });

  return json({ sent: true, sid });
});
