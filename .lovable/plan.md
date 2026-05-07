- Revised Authentication & Organization Onboarding Plan
  ## 🎯 Overview
  Set up a secure multi-tenant RBAC system where:
  - Organizations are created first
  - The creator of the organization automatically becomes the `super_admin`
  - `super_admins` can invite/create:
    - admins
    - enumerators
  - Farmers are **NOT allowed to sign up directly** in the MVP
  - Farmers are onboarded only by enumerators through the PWA
  This ensures:
  - controlled onboarding
  - verified farmer data
  - organization-level data isolation
  - proper operational hierarchy
  ---
  # 👥 Role Permissions Summary

  | Role        | Access                                                                          |
  | ----------- | ------------------------------------------------------------------------------- |
  | developer   | Full platform-wide access across all organizations                              |
  | super_admin | Full control of their own organization                                          |
  | admin       | Manage users, review farmer data, verify documents, approve/reject applications |
  | enumerator  | Field onboarding of farmers and data collection                                 |

  ---
  # 🏢 Multi-Tenant Organization Structure
  ## New Core Concept
  The system is organization-based.
  Every:
  - admin
  - enumerator
  - farmer data
  - application
  belongs to an organization.
  ---
  # Database Changes
  ---
  ## 1. Create Organization Table
  ```sql
  CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
  );

  ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

  ```
  ---
  ## 2. Create Role Enum & User Roles Table
  ```sql
  CREATE TYPE public.app_role AS ENUM (
    'developer',
    'super_admin',
    'admin',
    'enumerator'
  );

  CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, organization_id, role)
  );

  ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

  ```
  ---
  ## 3. Update Profiles Table
  ```sql
  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

    full_name TEXT,
    avatar_url TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  ```
  ---
  ## 4. Create has_role() Security Definer Function
  ```sql
  CREATE OR REPLACE FUNCTION public.has_role(
    _user_id UUID,
    _role app_role
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
  $$;

  ```
  ---
  # 🔐 Authentication Flow (UPDATED)
  ## 🚫 Remove Public Signup for Farmers
  Farmers do NOT create accounts in the MVP.
  Instead:
  - Enumerators onboard farmers via PWA
  - Farmer data is stored internally
  - Farmer authentication can come later
  ---
  # ✅ New Signup Flow
  There are now only 2 authentication entry points:
  ---
  ## 1. Create Organization
  This is the primary onboarding flow.
  ### Form Fields
  - Organization Name
  - Full Name
  - Email
  - Password
  ### On Success
  System automatically:
  1. Creates auth user
  2. Creates organization
  3. Creates profile
  4. Assigns `super_admin` role
  5. Links user to organization
  ---
  ## 2. Sign In
  Used by:
  - super_admins
  - admins
  - enumerators
  - developers
  ---
  # 🔄 Organization Creation Flow
  ## When a user creates an organization:
  ### Backend Actions
  ```text
  1. Create auth user
  2. Create organization
  3. Insert profile
  4. Assign super_admin role
  5. Link user to organization

  ```
  ---
  # 👤 User Invitation Flow
  Only `super_admin` can:
  - invite admins
  - invite enumerators
  - assign roles
  ---
  # ✉️ Recommended Invitation System (Better Than Open Signup)
  Instead of public signup for admins/enumerators:
  ### Super Admin:
  1. Creates invitation
  2. User receives invite link/email
  3. User sets password
  4. Role already predefined
  This prevents:
  - unauthorized organization access
  - fake enumerators
  - role abuse
  ---
  # 🛡️ RLS Policies
  ## user_roles
  - Users can read their own roles
  - super_admins can manage roles only within their organization
  - developers can access all organizations
  ---
  ## profiles
  - Users can read/update own profile
  - admins+ can read organization profiles only
  - developers can access all profiles
  ---
  ## organizations
  - Users can only view their own organization
  - developers can access all organizations
  ---
  # ⚙️ Remove Old Logic
  ## ❌ Remove This
  > “Default role on signup: enumerator”
  This is no longer valid.
  ---
  ## ✅ Replace With
  ### Organization creator:
  Automatically assigned:
  ```text
  super_admin

  ```
  ### Admins & Enumerators:
  Created/invited by super_admin
  ### Farmers:
  Created internally by enumerators
  ---
  # 🧱 Frontend Changes
  ---
  ## 1. Update Auth Pages
  Replace current signup page with:
  ### Option A
  ```text
  Create Organization

  ```
  ### Option B
  ```text
  Sign In

  ```
  ---
  # 2. Remove Farmer Signup
  Delete:
  - farmer registration auth flow
  - farmer signup route
  Farmers are onboarding records, not platform users (for MVP).
  ---
  # 3. Update useAuth Hook
  Expose:
  - roles
  - organization
  - hasRole()
  - isSuperAdmin
  - isAdmin
  - isEnumerator
  ---
  # 4. Update Sidebar Navigation
  Navigation visibility based on:
  - role
  - organization scope
  ---
  # 5. Admin Pages
  ## Super Admin
  - User management
  - Invite users
  - Assign roles
  ## Admin
  - Farmer review
  - Verification
  - Application management
  ## Enumerator
  - Farmer onboarding only
  ---
  # 🔥 Important Architectural Improvement
  ## Add organization_id Everywhere
  All core business tables should include:
  ```sql
  organization_id UUID

  ```
  Examples:
  - farmers
  - funding_applications
  - documents
  - enumerator_activity
  This is essential for:
  - tenant isolation
  - scaling
  - security
  - analytics later
  ---
  # 📌 Technical Notes
  - Roles are stored in `user_roles`, never in profiles
  - Organizations are the tenant boundary
  - Farmers are not authenticated users in MVP
  - Enumerators are organization-scoped users
  - `super_admin` is automatically assigned during organization creation
  - Invitation-based onboarding is preferred over open signup
  - Developers bypass organization restrictions for support/debugging
  ---
  # 🚀 Recommended Incremental Build Order
  ## Phase 1
  - Organizations
  - Authentication
  - RBAC
  - User invitations
  ## Phase 2
  - Enumerator onboarding flow
  - Farmer registration
  - Farmer profiles
  ## Phase 3
  - Applications
  - Verification
  - Approval workflow
  This sequencing keeps development aligned with the actual operational flow of the system.