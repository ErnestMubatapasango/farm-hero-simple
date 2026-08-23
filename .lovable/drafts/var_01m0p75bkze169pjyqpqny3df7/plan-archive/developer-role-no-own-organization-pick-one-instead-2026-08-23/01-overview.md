# Developer role: no own organization, pick one instead

## Short answer

A developer does not need to own an organization. The database already treats
`developer` as a platform-level role: every read policy on farmers, documents,
yield history, farm health, credit scores, profiles and organizations passes for
a developer regardless of `organization_id`, and the permission function grants
a developer every permission key without an org row. What is missing is only on
the front end: nearly every page reads a single `organizationId` from the
signed-in user's profile, so a developer with no organization sees empty pages.

So the fix is an **active organization selector** for developers, not an
organization of their own.

## What changes

1. A developer signing in lands on the dashboard with an organization picker at
   the top (also mirrored in the sidebar) listing every organization on the
   platform by name, with member and farmer counts.
2. The choice becomes the "active organization" for the whole session and is
   remembered across reloads. Every section — dashboard, farmers, documents,
   analytics, credit scores, users, invitations, roles — reads from that
   organization.
3. Until a developer picks one, pages show a short "Select an organization to
   continue" state instead of empty tables.
4. A developer is never sent to the create-organization screen, and creating an
   organization stays optional for them (useful for their own test data).
5. Nothing changes for super admins, admins or enumerators: their active
   organization is always their own, with no picker shown.
