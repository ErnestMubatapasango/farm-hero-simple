import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Sprout, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";

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

  if (session) return <Navigate to="/" replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If the user signed up as an org creator with email confirmation on,
    // finish org creation now that we have a session.
    try {
      const pendingRaw = localStorage.getItem("kyf_pending_org");
      if (pendingRaw && signInData.session) {
        const pending = JSON.parse(pendingRaw) as {
          name?: string;
          full_name?: string;
        };
        if (pending?.name) {
          const slug = pending.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          const { error: rpcError } = await supabase.rpc("create_organization", {
            _name: pending.name,
            _slug: slug,
          });
          if (!rpcError && pending.full_name) {
            await supabase
              .from("profiles")
              .update({ full_name: pending.full_name })
              .eq("user_id", signInData.session.user.id);
          }
        }
        localStorage.removeItem("kyf_pending_org");
      }
    } catch {
      /* non-fatal */
    }

    await refreshRoles();
    navigate("/", { replace: true });
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

      // Email confirmation on → no session yet. Stash org intent so first
      // sign-in completes the setup, and stop here.
      if (!authData.session) {
        try {
          localStorage.setItem(
            "kyf_pending_org",
            JSON.stringify({ name: orgName, full_name: fullName }),
          );
        } catch {
          /* ignore */
        }
        setMessage(
          "Check your email to confirm your account. Your organization will be created on first sign-in.",
        );
        setLoading(false);
        return;
      }

      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const { error: rpcError } = await supabase.rpc("create_organization", {
        _name: orgName,
        _slug: slug,
      });
      if (rpcError) throw rpcError;

      await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", authData.session.user.id);

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
