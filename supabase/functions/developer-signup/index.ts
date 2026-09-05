// Public endpoint: create a platform developer account (no organization).
// Only emails present in public.platform_developers are accepted. Responses are
// deliberately generic so the allowlist cannot be probed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:5173",
  "https://kyfplatform.org",
  "https://www.kyfplatform.org",
  "https://kyf2.lovable.app",
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
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// Small in-memory rate limiter, keyed by email. Resets on cold start.
const rateWindow = new Map<string, number[]>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (rateWindow.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  rateWindow.set(key, arr);
  return arr.length > RATE_LIMIT;
}

const NOT_ALLOWED =
  "This option is only for platform developers. Ask an organization admin to invite you.";

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
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: {
    email?: string;
    password?: string;
    first_name?: string;
    last_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const firstName = (body.first_name ?? "").trim();
  const lastName = (body.last_name ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) {
    return json({ error: "A valid email is required." }, 400);
  }
  if (password.length < 8 || password.length > 128) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) {
    return json({ error: "First and last name are required." }, 400);
  }
  if (rateLimited(email)) {
    return json({ error: "Too many attempts. Please try again later." }, 429);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Allowlist check (service role only; never exposed to the browser).
  const { data: allowRow, error: allowError } = await admin
    .from("platform_developers")
    .select("email")
    .ilike("email", email)
    .maybeSingle();

  if (allowError) {
    console.error("allowlist lookup failed", allowError.message);
    return json({ error: "Could not verify access. Please try again." }, 500);
  }
  if (!allowRow) {
    return json({ error: NOT_ALLOWED }, 403);
  }

  // 2. Existing account? Do not create a duplicate.
  const { data: existing } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
    // @ts-ignore filter is supported by the admin API
    filter: `email.eq.${email}`,
  });
  const alreadyExists = (existing?.users ?? []).some(
    (u) => (u.email ?? "").toLowerCase() === email,
  );
  if (alreadyExists) {
    // Make sure the developer role is present, then tell them to sign in.
    await admin.rpc("ensure_platform_developer", { _email: email });
    return json(
      {
        error:
          "An account already exists for this email. Sign in instead, or use \u201cForgot password?\u201d to reset it.",
        code: "account_exists",
      },
      409,
    );
  }

  // 3. Create the account with the email pre-confirmed.
  const fullName = `${firstName} ${lastName}`.trim();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, full_name: fullName },
  });

  if (createError || !created?.user) {
    console.error("createUser failed", createError?.message);
    const msg = createError?.message ?? "Could not create the account.";
    return json({ error: msg }, 400);
  }

  const userId = created.user.id;

  // 4. Ensure profile + developer role exist.
  const { error: roleError } = await admin.rpc("ensure_platform_developer", { _email: email });
  if (roleError) console.error("ensure_platform_developer failed", roleError.message);

  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
      },
      { onConflict: "user_id" },
    );
  if (profileError) console.error("profile upsert failed", profileError.message);

  return json({ ok: true, user_id: userId });
});
