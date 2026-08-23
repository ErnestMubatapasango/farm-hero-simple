import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Sprout, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { completePendingOrg, stashPendingOrg } from "@/lib/pendingOrg";
import { clearIdleState, consumeIdleLogout, consumeIdleRedirect } from "@/lib/idle";


type AuthMode = "signin" | "create-org";

export default function Login() {
  const { session, refreshRoles } = useAuth();
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
  const [idleNotice, setIdleNotice] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    if (consumeIdleLogout()) setIdleNotice(true);
    const stored = consumeIdleRedirect();
    if (stored) setRedirectTo(stored);
  }, []);

  if (session) {
    clearIdleState();
    return <Navigate to={redirectTo ?? "/"} replace />;
  }


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Pending-org completion is handled centrally in AuthProvider.
    await refreshRoles();
    const target = redirectTo ?? "/";
    clearIdleState();
    setRedirectTo(null);
    setIdleNotice(false);
    navigate(target, { replace: true });
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
          data: { full_name: fullName, pending_org_name: orgName },
        },
      });
      if (signUpError) throw signUpError;

      // The organization is created server-side at signup from the
      // `pending_org_name` metadata. The localStorage stash is only a
      // secondary fallback for older accounts / unexpected gaps.
      stashPendingOrg({ name: orgName, full_name: fullName });

      if (!authData.session) {
        setMessage(
          "Check your email to confirm your account. Your organization has been created and will be ready when you sign in.",
        );
        setLoading(false);
        return;
      }

      // Immediate session (email confirmation off) → the trigger already ran.
      const result = await completePendingOrg(authData.session.user.id);
      if (result.error) throw new Error(result.error);

      await refreshRoles();
      setMessage("Organization created. Redirecting…");
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };


  const getSubmitHandler = () => {
    if (mode === "create-org") return handleCreateOrg;
    return handleSignIn;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8 sm:py-12 md:py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sprout className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">KYF Platform</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create-org" ? "Create your organization" : "Sign in to continue"}
          </p>
        </div>

        {idleNotice && (
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            You were signed out after 30 minutes of inactivity. Please sign in again.
          </div>
        )}



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

        <form onSubmit={getSubmitHandler()} className="space-y-5">
          {mode === "create-org" && (
            <>
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
            </>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
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
            {loading ? "Please wait..." : mode === "create-org" ? "Create Organization" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
