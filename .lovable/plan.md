## Switch farmer notifications from SMS to WhatsApp

We'll keep the existing edge function and just change the channel — WhatsApp goes through the same Twilio Messages endpoint, only the `To` and `From` need a `whatsapp:` prefix.

### Changes

**1. New secret** — `TWILIO_WHATSAPP_FROM = whatsapp:+15559768239`
   - Keep `TWILIO_FROM_NUMBER` around (unused for now, easy to revert).

**2. Edit `supabase/functions/send-verification-sms/index.ts`**
   - Read `TWILIO_WHATSAPP_FROM` instead of `TWILIO_FROM_NUMBER`.
   - Set `From: TWILIO_WHATSAPP_FROM` and `To: 'whatsapp:' + farmer.phone` (normalize to E.164 first; prepend `+` if missing).
   - Activity log actions: `whatsapp_sent` / `whatsapp_failed` / `whatsapp_skipped_no_phone` (so the audit trail is honest about the channel).
   - Same authorization, same message bodies, same gateway URL.

**3. UI copy** — in `AdminFarmerDetail.tsx`, the toast after verify/reject says "Sending SMS…"; change to "Sending WhatsApp message…".

No DB migration, no schema change, no new files. The in-app notification for the enumerator is unchanged.

### About the WhatsApp template requirement

Twilio requires a **pre-approved template** for *business-initiated* WhatsApp messages (which is exactly our case — the farmer hasn't messaged us first). Without one, sends to numbers outside your sandbox allow-list will fail with error `63016` ("Failed to send freeform message because you are outside the allowed window").

Two paths:

- **Now (testing):** Use the Twilio WhatsApp **sandbox**. Each test farmer has to text your sandbox join code to `+1 415 523 8886` once. Freeform messages then work for 24 h after their last reply. Good enough to demo end-to-end today.
- **Production:** In Twilio Console → Messaging → Content Template Builder, create two templates (one for "verified", one for "rejected") with a `{{1}}` variable for the farmer's first name and `{{2}}` for org name. Submit for WhatsApp approval (usually <24 h). Once approved, the edge function sends `ContentSid` + `ContentVariables` instead of `Body`. I can wire that in as a follow-up once you have the template SIDs.

For this change I'll ship the freeform version (works in sandbox immediately) and leave a `TODO` marker where the `ContentSid` swap goes.

### Files

**Edited**
- `supabase/functions/send-verification-sms/index.ts` — switch sender + recipient to `whatsapp:` prefix, rename log actions.
- `src/pages/AdminFarmerDetail.tsx` — toast copy.

**Secret added**
- `TWILIO_WHATSAPP_FROM` — value: `whatsapp:+15559768239`
