import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Sprout, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";

type AuthMode = "signin" | "create-org";

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (session) return <Navigate to="/" replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else navigate("/");
    setLoading(false);
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName },
        },
      });
      if (signUpError) throw signUpError;

      const userId = authData.user?.id;
      if (!userId) {
        setMessage("Check your email for a confirmation link.");
        setLoading(false);
        return;
      }

      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ name: orgName, slug, created_by: userId })
        .select("id")
        .single();
      if (orgError) throw orgError;

      await supabase
        .from("profiles")
        .update({ organization_id: org.id, full_name: fullName })
        .eq("user_id", userId);

      await supabase
        .from("user_roles")
        .insert({ user_id: userId, organization_id: org.id, role: "super_admin" });

      setMessage("Organization created! Check your email to confirm your account, then sign in.");
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInfo || !inviteToken) return;
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: inviteInfo.email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName },
        },
      });
      if (signUpError) throw signUpError;

      const userId = authData.user?.id;
      if (!userId) {
        setMessage("Check your email for a confirmation link, then sign in.");
        setLoading(false);
        return;
      }

      // Update profile with org
      await supabase
        .from("profiles")
        .update({ organization_id: inviteInfo.organization_id, full_name: fullName })
        .eq("user_id", userId);

      // Assign role
      await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          organization_id: inviteInfo.organization_id,
          role: inviteInfo.role as any,
        });

      // Mark invitation as accepted
      await supabase
        .from("invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("token", inviteToken);

      setMessage("Account created! Check your email for a confirmation link, then sign in.");
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const getSubmitHandler = () => {
    if (mode === "accept-invite") return handleAcceptInvite;
    if (mode === "create-org") return handleCreateOrg;
    return handleSignIn;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sprout className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">KYF Platform</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create-org"
              ? "Create your organization"
              : mode === "accept-invite"
                ? "Accept your invitation"
                : "Sign in to continue"}
          </p>
        </div>

        {/* Mode tabs (hidden during invite accept) */}
        {!inviteToken && (
          <div className="flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(""); setMessage(""); }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode("create-org"); setError(""); setMessage(""); }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === "create-org" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Create Organization
            </button>
          </div>
        )}

        {/* Invite info badge */}
        {mode === "accept-invite" && inviteInfo && (
          <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">
              You've been invited as <span className="capitalize">{inviteInfo.role.replace("_", " ")}</span>
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">Create your account to get started.</p>
          </div>
        )}

        <form onSubmit={getSubmitHandler()} className="space-y-4">
          {mode === "create-org" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Organization Name</label>
              <Input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Farms Ltd"
                required
              />
            </div>
          )}

          {(mode === "create-org" || mode === "accept-invite") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={mode === "accept-invite"}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Password</label>
              {mode === "signin" && (
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              )}
            </div>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-primary">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : mode === "create-org"
                ? "Create Organization"
                : mode === "accept-invite"
                  ? "Create Account"
                  : "Sign In"}
          </button>
        </form>

        {mode === "accept-invite" && (
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <button onClick={() => { setMode("signin"); setError(""); setMessage(""); }} className="text-primary hover:underline">
              Sign in instead
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
