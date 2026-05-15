# Verification notifications

When an admin marks a farmer as **verified** or **rejected**, two things happen:

1. **Farmer** gets an SMS on the phone we have on file (via Twilio).
2. **Enumerator** who enrolled them sees an in-app notification + a badge on the sidebar/dashboard.

---

## 1. SMS to the farmer (Twilio)

**Setup**
- Connect the **Twilio** connector (one-click via the connection picker — provides `TWILIO_API_KEY` + `LOVABLE_API_KEY` automatically through the gateway).
- Ask the user for the Twilio **From** phone number (E.164, e.g. `+15558675310`) and store it as a secret `TWILIO_FROM_NUMBER`.

**Server function** — `src/lib/notifications/sms.functions.ts`
- `sendVerificationSms({ farmerId })` — protected by `requireSupabaseAuth`.
  - Loads the farmer (RLS scopes to caller's org).
  - Verifies caller is admin/super_admin/developer for that org.
  - Skips silently if `phone` is empty or status isn't `verified`/`rejected`.
  - Composes message:
    - verified → `"Hello {firstName}, your registration with {orgName} has been verified. Welcome aboard!"`
    - rejected → `"Hello {firstName}, your registration with {orgName} needs more info. Please contact your enumerator."`
  - POSTs to `https://connector-gateway.lovable.dev/twilio/Messages.json` with `To`, `From`, `Body`.
  - Logs the outcome (sid or error) into `farmer_activity_log` as `sms_sent` / `sms_failed` so we have an audit trail. No new table needed.

**Trigger**
- In `src/pages/CreditScoreDetail.tsx`/`AdminFarmers.tsx` (wherever status is changed to `verified`/`rejected`), call `sendVerificationSms` right after the successful status update. Failure to send doesn't roll back the verification — just toast a warning.

---

## 2. In-app notification for the enumerator

**Schema** — one new table:

```text
notifications
  id uuid pk
  user_id uuid          -- recipient (the enumerator)
  organization_id uuid
  type text             -- 'farmer_verified' | 'farmer_rejected'
  farmer_id uuid
  title text
  body text
  read_at timestamptz null
  created_at timestamptz default now()
```

RLS:
- SELECT/UPDATE: `user_id = auth.uid()` (recipient only).
- INSERT: server-side only (admin/super_admin/developer for the org), or via the same status-change trigger.

**Trigger mechanism**: a Postgres trigger on `farmers` — when `status` transitions to `verified` or `rejected`, insert a row into `notifications` for `farmers.enrolled_by`. This keeps it consistent regardless of which UI does the update.

**UI**
- `src/components/NotificationBell.tsx` in the top header — bell icon with unread count badge, dropdown listing recent notifications (clicking one navigates to the farmer's detail page and marks read).
- Realtime subscription to `notifications` filtered by `user_id` so badge updates live.
- Sidebar "Farmers" item gets a small dot when there are unread `farmer_*` notifications (enumerator only).

---

## Files

**New**
- `src/lib/notifications/sms.functions.ts` — Twilio sender (server fn).
- `src/components/NotificationBell.tsx` — header bell + dropdown.
- `src/hooks/useNotifications.ts` — fetch + realtime + mark-read helpers.

**Edited**
- `src/pages/AdminFarmers.tsx` (or wherever verify/reject buttons live) — call `sendVerificationSms` after status change.
- `src/components/AppSidebar.tsx` / top bar — mount `<NotificationBell />`.

**Migration** — `notifications` table + RLS + trigger on `farmers` for status change.

**Secrets needed**
- `TWILIO_FROM_NUMBER` (added via secrets tool after Twilio connector is linked).

---

## Out of scope
- Email to farmer (they don't have accounts; phone is the channel).
- Per-organization SMS templates (single hard-coded message for now — easy to extend later).
- Delivery status webhooks from Twilio (we only log the send result).
