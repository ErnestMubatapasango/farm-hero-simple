-- KYF Platform — data-only reset
--
-- Clears all application data while PRESERVING auth users and profiles, so
-- everyone can sign back in and re-create their organization.
--
-- Run in the Supabase SQL editor (or via the data tool). Order matters:
-- children before parents, and profile pointers are cleared last so nobody
-- ends up linked to an organization that no longer exists.
--
-- NOTE: files in the private `farmer-documents` storage bucket are NOT removed
-- by this script. Delete them separately from Storage if required.

BEGIN;

DELETE FROM public.notifications;
DELETE FROM public.farmer_activity_log;
DELETE FROM public.farmer_documents;
DELETE FROM public.crop_yield_history;
DELETE FROM public.farmer_crops;
DELETE FROM public.credit_scores;
DELETE FROM public.farm_health_scores;
DELETE FROM public.farmers;
DELETE FROM public.invitations;
DELETE FROM public.user_roles;
DELETE FROM public.organizations;

-- Drop dangling organization links on surviving profiles.
UPDATE public.profiles SET organization_id = NULL WHERE organization_id IS NOT NULL;

-- Always leave at least one platform-wide developer behind.
SELECT public.ensure_platform_developer();

COMMIT;

-- Sanity check
-- SELECT (SELECT count(*) FROM public.organizations) AS orgs,
--        (SELECT count(*) FROM public.farmers)       AS farmers,
--        (SELECT count(*) FROM public.user_roles)    AS roles;
